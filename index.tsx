import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

// --- Types ---

interface BirthDetails {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  rashi?: string;
}

interface LifeEvent {
  description: string;
  date: string;
  planet?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AppState {
  birthDetails: BirthDetails;
  lifeEvents: LifeEvent[];
  outputLanguage: string;
  chatHistory: ChatMessage[];
  enableGoogleSearch: boolean;
  isChatMode: boolean;
  specialNotes: string;
}

// --- Global Interface Extension ---
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

// --- Constants ---

const LATEST_FLASH_MODEL = 'gemini-3-flash-preview';
const LATEST_PRO_MODEL = 'gemini-3-pro-preview';
const MASTER_STORAGE_KEY = 'cosmic_compass_v3_final_safe';
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// --- Firebase Service ---

const firebaseConfig = {
  apiKey: "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg",
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(fbApp);

const getOrGenerateUserId = (): string => {
  let userId = localStorage.getItem('cosmic_user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('cosmic_user_id', userId);
  }
  return userId;
};

// --- Storage Utils ---

const saveLocal = (state: any) => localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(state));
const loadLocal = (defaultState: any) => {
  try {
    const local = localStorage.getItem(MASTER_STORAGE_KEY);
    return local ? JSON.parse(local) : defaultState;
  } catch { return defaultState; }
};

// --- Gemini Service Helpers ---

function buildAstrologyPrompt(
  birthDetails: BirthDetails,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  isChatContext: boolean = false
): string {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = isChatContext 
    ? `You are the "Siddhanta Oracle". You analyze Navagraha (9 Planets) and the 9-5-1 Willpower Axis. Provide a roadmap for 2030, 2040, and 2050.`
    : `Generate a Full Navagraha Synthesis & Willpower Analysis. Date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use high-level Vedic vocabulary. Always mention years 2030, 2040, 2050.`;
  } else {
    prompt += ` Respond in English. Use a mystical yet professional tone.`;
  }

  prompt += `\n\nCORE SUBJECT:
- Name: ${birthDetails.name}
- Birth: ${birthDetails.dob} at ${birthDetails.tob} in ${birthDetails.pob}

THE 9-5-1 WILLPOWER LINE:
- Analyze the 9 (Mars), 5 (Mercury), 1 (Sun) grid for high-level manifestation and leadership resilience.

NAVAGRAHA MAPPING:
${lifeEvents.map(e => `- ${e.planet || 'Unspecified Graha'} Node (${e.date}): ${e.description}`).join('\n')}

Format: Markdown. Tone: Visionary.`;
  return prompt;
}

// --- Components ---

const InputField: React.FC<{ label: string; id: string; type: string; value: string; onChange: (e: any) => void }> = ({ label, id, type, value, onChange }) => (
  <div className="mb-4">
    <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5 px-1">{label}</label>
    <input 
      type={type} 
      id={id} 
      value={value} 
      onChange={onChange} 
      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" 
    />
  </div>
);

// --- Main App ---

const DEFAULT_STATE: AppState = {
  birthDetails: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India', rashi: 'Cancer' },
  lifeEvents: [
    { date: '1995-01-17', description: 'Birth in Vadodara, Gujarat - Sun Node', planet: 'Sun' },
    { date: '2021-12-10', description: 'Engagement ceremony with Pankti Patel', planet: 'Venus' },
    { date: '2022-01-04', description: 'Married Pankti Patel (Astro Union)', planet: 'Venus' },
    { date: '2024-11-06', description: 'Moved to Germany (Transcontinental Transit)', planet: 'Rahu' }
  ],
  outputLanguage: 'Gujarati',
  chatHistory: [],
  enableGoogleSearch: true,
  isChatMode: false,
  specialNotes: 'Active 9-5-1 Axis'
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [appState, setAppState] = useState<AppState>(() => loadLocal(DEFAULT_STATE));
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initial Key Check
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else if (process.env.API_KEY && process.env.API_KEY.length > 5) {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  // Firebase Recovery
  useEffect(() => {
    const initCloud = async () => {
      try {
        const snap = await get(ref(db, `users/${userId}`));
        if (snap.exists()) setAppState(prev => ({ ...prev, ...snap.val() }));
      } catch (e) { console.error("Cloud Access Error", e); }
    };
    initCloud();
  }, [userId]);

  // Auto-Save
  useEffect(() => {
    saveLocal(appState);
    const timer = setTimeout(async () => {
      try {
        await set(ref(db, `users/${userId}`), { ...appState, lastUpdated: new Date().toISOString() });
        setIsFirebaseSynced(true);
      } catch { setIsFirebaseSynced(false); }
    }, 2000);
    return () => clearTimeout(timer);
  }, [appState, userId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [appState.chatHistory]);

  const ensureApiKey = async () => {
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      if (!selected) {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
        return true;
      }
      setHasApiKey(true);
      return true;
    }
    if (process.env.API_KEY && process.env.API_KEY.length > 5) {
      setHasApiKey(true);
      return true;
    }
    return false;
  };

  const handleGenerateReading = async () => {
    const ready = await ensureApiKey();
    if (!ready) { alert("Please connect to the Oracle using your API Key."); return; }

    setLoading(true);
    try {
      // Create new instance to ensure up-to-date key
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const res = await ai.models.generateContent({
        model: LATEST_PRO_MODEL,
        contents: buildAstrologyPrompt(appState.birthDetails, appState.lifeEvents, appState.outputLanguage),
        config: { tools: appState.enableGoogleSearch ? [{ googleSearch: {} }] : undefined },
      });
      setReading(res.text || '');
    } catch (e: any) {
      console.error(e);
      // If error is 403 or blocked, prompt for key selection again
      if (e.message?.includes("blocked") || e.message?.includes("403") || e.message?.includes("not found")) {
        alert("The Oracle connection is blocked. Please select a valid paid API key.");
        if (window.aistudio) await window.aistudio.openSelectKey();
      } else {
        alert("Cosmic Alignment Error: " + (e.message || "Unknown error"));
      }
    } finally { setLoading(false); }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    const ready = await ensureApiKey();
    if (!ready) return;

    setLoading(true);
    try {
      // Create new instance for chat as well
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      if (!chatSessionRef.current) {
        chatSessionRef.current = ai.chats.create({
          model: LATEST_FLASH_MODEL,
          config: { 
            systemInstruction: buildAstrologyPrompt(appState.birthDetails, appState.lifeEvents, appState.outputLanguage, true),
            tools: appState.enableGoogleSearch ? [{ googleSearch: {} }] : undefined
          },
        });
      }

      const newHist: ChatMessage[] = [...appState.chatHistory, { role: 'user', text }];
      setAppState(prev => ({ ...prev, chatHistory: newHist }));
      
      const result = await chatSessionRef.current.sendMessage({ message: text });
      setAppState(prev => ({ ...prev, chatHistory: [...newHist, { role: 'model', text: result.text || '' }] }));
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes("blocked") || e.message?.includes("403")) {
        if (window.aistudio) await window.aistudio.openSelectKey();
      }
      alert("Oracle Disconnected: " + e.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6">
      <header className="text-center mb-12">
        <h1 className="font-serif text-5xl text-white font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-indigo-400">Cosmic Compass</h1>
        <div className="flex justify-center space-x-4 items-center">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${isFirebaseSynced ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {isFirebaseSynced ? 'Cloud Synced' : 'Sync Pending'}
          </div>
          <button 
            onClick={() => window.aistudio?.openSelectKey()} 
            className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${hasApiKey ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300' : 'bg-red-500/20 border-red-500/30 text-red-300 animate-pulse'}`}
          >
            {hasApiKey ? 'Oracle Connected' : 'Connect to Oracle'}
          </button>
          <select value={appState.outputLanguage} onChange={e => setAppState(p => ({...p, outputLanguage: e.target.value}))} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 outline-none uppercase tracking-widest cursor-pointer hover:bg-white/10 transition-colors">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
        </div>
        <p className="mt-4 text-[9px] text-gray-500 uppercase tracking-widest">
          Ensure you select a API key from a <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline text-indigo-400">paid Google Cloud project</a> for Pro model access.
        </p>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl">
          <button onClick={() => setAppState(p => ({...p, isChatMode: false}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${!appState.isChatMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Profile Mandali</button>
          <button onClick={() => setAppState(p => ({...p, isChatMode: true}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${appState.isChatMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Oracle Chat</button>
        </div>
      </div>

      {!appState.isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 border border-white/10 shadow-xl glow-border">
              <h2 className="font-serif text-2xl text-white mb-6">Birth Data</h2>
              <InputField label="Name" id="n" type="text" value={appState.birthDetails.name} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, name: e.target.value}}))} />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Date" id="d" type="date" value={appState.birthDetails.dob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, dob: e.target.value}}))} />
                <InputField label="Time" id="t" type="time" value={appState.birthDetails.tob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, tob: e.target.value}}))} />
              </div>
              <InputField label="Birth Place" id="p" type="text" value={appState.birthDetails.pob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, pob: e.target.value}}))} />
            </section>
            
            <section className="glass rounded-[2rem] p-8 border border-white/10 shadow-xl">
               <h2 className="font-serif text-2xl text-white mb-6">Willpower Axis (9-5-1)</h2>
               <div className="grid grid-cols-3 gap-2 p-2 bg-black/20 rounded-xl">
                  {[4,9,2,3,5,7,8,1,6].map(num => (
                    <div key={num} className={`aspect-square flex items-center justify-center rounded-lg font-black transition-all ${[9,5,1].includes(num) ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border-indigo-400 border' : 'bg-white/5 text-gray-700/50'}`}>{num}</div>
                  ))}
               </div>
               <p className="mt-4 text-[10px] text-indigo-400 font-bold uppercase tracking-widest text-center">Active Potential Detected</p>
            </section>
          </div>
          
          <div className="lg:col-span-4">
            <section className="glass rounded-[2rem] p-8 flex flex-col min-h-[500px] border border-white/10 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-2xl text-white">Timeline</h2>
                <button onClick={() => setAppState(p => ({...p, lifeEvents: [...p.lifeEvents, {date: '', description: '', planet: 'Mars'}]}))} className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold hover:scale-110 active:scale-95 transition-all">+</button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {appState.lifeEvents.map((ev, i) => (
                  <div key={i} className="glass-dark p-4 rounded-xl border border-white/5 relative group hover:border-white/20 transition-all">
                    <button onClick={() => setAppState(p => ({...p, lifeEvents: p.lifeEvents.filter((_, idx) => idx !== i)}))} className="absolute right-2 top-2 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">×</button>
                    <div className="flex items-center space-x-2 mb-2">
                       <input type="text" value={ev.date} onChange={e => { const evs = [...appState.lifeEvents]; evs[i].date = e.target.value; setAppState(p => ({...p, lifeEvents: evs})); }} className="bg-transparent text-[10px] text-indigo-400 font-bold uppercase w-1/2 outline-none" />
                       <select value={ev.planet} onChange={e => { const evs = [...appState.lifeEvents]; evs[i].planet = e.target.value; setAppState(p => ({...p, lifeEvents: evs})); }} className="bg-black/20 text-[9px] text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-white/5 outline-none">
                         {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                       </select>
                    </div>
                    <textarea value={ev.description} onChange={e => { const evs = [...appState.lifeEvents]; evs[i].description = e.target.value; setAppState(p => ({...p, lifeEvents: evs})); }} className="bg-transparent text-xs text-gray-200 leading-relaxed font-medium w-full resize-none outline-none" rows={2} />
                  </div>
                ))}
              </div>
            </section>
          </div>
          
          <div className="lg:col-span-4 space-y-6">
            <button onClick={handleGenerateReading} disabled={loading} className="w-full py-12 bg-indigo-600 rounded-[2rem] text-white font-bold text-xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-500 transition-all border border-white/20 active:scale-95 disabled:opacity-50">
              {loading ? "Aligning Stars..." : "Generate Projections"}
            </button>
            {reading && (
              <div className="glass rounded-[2rem] p-8 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner">
                <div className="text-indigo-400 text-[10px] font-black uppercase mb-4 tracking-widest border-b border-indigo-400/20 pb-2">Roadmap 2030-2050</div>
                {reading}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-[75vh] glass rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 duration-300">
          <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white leading-tight">Cosmic Oracle</h2>
            <button onClick={() => setAppState(p => ({...p, chatHistory: []}))} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Clear History</button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-black/10">
            {appState.chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-5 py-3 rounded-2xl border ${msg.role === 'user' ? 'bg-indigo-600/20 border-indigo-500/30 text-white' : 'bg-white/5 border-white/10 text-gray-200'}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-indigo-400 animate-pulse pl-4">Channeling...</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-white/5 border-t border-white/10">
             <input 
               type="text" 
               onKeyDown={e => { if(e.key === 'Enter') { handleSendMessage((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} 
               placeholder="Ask the Oracle..." 
               className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50" 
             />
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);