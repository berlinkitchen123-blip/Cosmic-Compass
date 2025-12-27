
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

interface ReadingOptions {
  astrology: boolean;
  numerology: boolean;
  rashifal: boolean;
  jyotish: boolean;
  dailyHoroscope: boolean;
  palmistry: boolean;
  lalKitab: boolean;
  vasthu: boolean;
  faceReading: boolean;
}

interface AdvancedReadingOptions {
  culturalContext: string; 
  includeScientificPerspective: boolean;
}

interface LifeEvent {
  description: string;
  date: string;
  planet?: string;
}

interface Visuals {
  face?: string;
  leftHand?: string;
  rightHand?: string;
}

interface ApiResponse {
  reading: string;
  groundingSources?: any[];
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

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
const db = getDatabase(fbApp, firebaseConfig.databaseURL);

const getOrGenerateUserId = (): string => {
  let userId = localStorage.getItem('cosmic_user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('cosmic_user_id', userId);
  }
  return userId;
};

const syncToFirebase = async (userId: string, data: any) => {
  try {
    const userRef = ref(db, `users/${userId}`);
    await set(userRef, { ...data, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    console.error("Firebase Sync Error:", error);
    return false;
  }
};

const loadFromFirebase = async (userId: string): Promise<any | null> => {
  try {
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error("Firebase Load Error:", error);
    return null;
  }
};

// --- Gemini Service ---

const LATEST_PRO_MODEL = 'gemini-3-pro-preview';

function buildAstrologyPrompt(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  visuals?: Visuals,
  isChatContext: boolean = false
): string {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = isChatContext 
    ? `You are the "Siddhanta Oracle". You analyze the 9 Planets (Navagraha) and the 9-5-1 Willpower Axis (Mars-Mercury-Sun). Project into 2030, 2040, and 2050.`
    : `Generate a Full Navagraha Synthesis & Willpower Analysis. Date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use high-level Vedic vocabulary.`;
  } else {
    prompt += ` Respond in English. Use a mystical yet professional tone.`;
  }

  prompt += `\n\nCORE SUBJECT:
- Name: ${birthDetails.name}
- Birth: ${birthDetails.dob} at ${birthDetails.tob} in ${birthDetails.pob}
- Rashi: ${birthDetails.rashi || 'Calculate'}

THE 9-5-1 WILLPOWER LINE (NUMEROLOGY):
- Analyze the 9-5-1 (Mars-Mercury-Sun) axis for leadership and resilience.

NAVAGRAHA MAPPING:
${lifeEvents.map(e => `- ${e.planet || 'Unspecified'} (${e.date}): ${e.description}`).join('\n')}

Format: Markdown. Tone: Visionary.`;
  return prompt;
}

function getPartFromImage(dataUri: string) {
  const [header, data] = dataUri.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  return { inlineData: { mimeType, data } };
}

async function getCombinedReading(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  enableGoogleSearch: boolean = false,
  visuals?: Visuals
): Promise<ApiResponse> {
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  const textPrompt = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, visuals, false);
  const parts: any[] = [{ text: textPrompt }];
  if (visuals?.face) parts.push(getPartFromImage(visuals.face));
  
  const response = await ai.models.generateContent({
    model: LATEST_PRO_MODEL,
    contents: { parts },
    config: { 
      temperature: 0.7, 
      tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
    },
  });
  return { 
    reading: response.text || "Cosmic signal lost.", 
    groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
  };
}

// --- Components ---

const InputField: React.FC<{ label: string; id: string; type: string; value: string; onChange: (e: any) => void }> = ({ label, id, type, value, onChange }) => (
  <div className="mb-4">
    <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5 px-1">{label}</label>
    <input type={type} id={id} value={value} onChange={onChange} className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" />
  </div>
);

const ChatInterface: React.FC<{
  chatHistory: ChatMessage[];
  onSendMessage: (msg: string) => void;
  loading: boolean;
  error: string | null;
  onBackToForm: () => void;
  onClearChat: () => void;
  suggestedQuestions: string[];
  isSyncing?: boolean;
  isFirebaseSynced?: boolean;
}> = ({ chatHistory, onSendMessage, loading, error, onBackToForm, onClearChat, suggestedQuestions, isSyncing, isFirebaseSynced }) => {
  const [currentInput, setCurrentInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

  const handleSend = () => { if(currentInput.trim()) { onSendMessage(currentInput); setCurrentInput(''); } };

  return (
    <div className="flex flex-col h-[75vh] md:h-[80vh] glass rounded-3xl overflow-hidden shadow-2xl border border-white/10">
      <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center">✨</div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Cosmic Oracle Chat</h2>
            <p className="text-[10px] uppercase text-indigo-400 font-black tracking-tighter">
              {isSyncing ? 'Saving to Cloud...' : isFirebaseSynced ? 'Synced to Akashic Record' : 'Sync Pending'}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <button onClick={onClearChat} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Clear History</button>
          <button onClick={onBackToForm} className="px-4 py-1.5 text-xs bg-indigo-600/20 text-indigo-300 rounded-lg">← View Chart</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-black/10">
        {chatHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-5 py-3 rounded-2xl border ${msg.role === 'user' ? 'bg-indigo-600/20 border-indigo-500/30' : 'bg-white/5 border-white/10 text-gray-200'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-indigo-400 animate-pulse">Channeling...</div>}
        <div ref={endRef} />
      </div>
      <div className="p-4 bg-white/5 border-t border-white/10">
        <div className="relative flex items-center">
          <input 
            type="text" 
            value={currentInput} 
            onChange={e => setCurrentInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Ask the Oracle..."
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
          <button onClick={handleSend} className="absolute right-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg">Send</button>
        </div>
      </div>
    </div>
  );
};

// --- App Component ---

const MASTER_STORAGE_KEY = 'cosmic_compass_master_v3';
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

interface AppState {
  birthDetails: BirthDetails;
  readingOptions: ReadingOptions;
  advancedReadingOptions: AdvancedReadingOptions;
  lifeEvents: LifeEvent[];
  outputLanguage: string;
  enableGoogleSearch: boolean;
  chatHistory: ChatMessage[];
  visuals: Visuals;
}

const DEFAULT_STATE: AppState = {
  birthDetails: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India', rashi: 'Cancer' },
  readingOptions: { astrology: true, numerology: true, rashifal: true, jyotish: true, dailyHoroscope: true, palmistry: true, lalKitab: true, vasthu: true, faceReading: true },
  advancedReadingOptions: { culturalContext: 'Vedic', includeScientificPerspective: true },
  lifeEvents: [
    { date: '1995-01-17', description: 'Birth in Vadodara, Gujarat - Sun Node', planet: 'Sun' },
    { date: '2012-05-15', description: 'Completed High School Education', planet: 'Mercury' },
    { date: '2013-08-20', description: 'Started Engineering Bachelor degree', planet: 'Jupiter' },
    { date: '2017-06-10', description: 'Graduation and Entry into Professional Career', planet: 'Sun' },
    { date: '2019-03-12', description: 'Shift in career focus and location', planet: 'Mars' },
    { date: '2021-02-14', description: 'Significant spiritual realization and lifestyle change', planet: 'Moon' },
    { date: '2021-08-24', description: 'Health crisis: Platelets dropped to 10k (Karmic Node)', planet: 'Saturn' },
    { date: '2021-12-10', description: 'Engagement ceremony with Pankti Patel', planet: 'Venus' },
    { date: '2022-01-04', description: 'Married Pankti Patel (Astro Union)', planet: 'Venus' },
    { date: '2023-05-15', description: 'Significant career advancement/promotion', planet: 'Mercury' },
    { date: '2024-06-20', description: 'Preparation for International Migration', planet: 'Rahu' },
    { date: '2024-11-06', description: 'Moved to Germany (Transcontinental Transit)', planet: 'Rahu' },
    { date: '2025-01-01', description: 'Stable residency and new professional phase', planet: 'Saturn' },
    { date: '2025-05-01', description: 'Future Growth: Family and Wealth Focus', planet: 'Jupiter' }
  ],
  outputLanguage: 'Gujarati',
  enableGoogleSearch: true,
  chatHistory: [],
  visuals: {}
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [appState, setAppState] = useState<AppState>(() => {
    const local = localStorage.getItem(MASTER_STORAGE_KEY);
    return local ? JSON.parse(local) : DEFAULT_STATE;
  });
  const [isChatMode, setIsChatMode] = useState(false);
  const [reading, setReading] = useState('');
  const [loading, setLoading] = useState(false);
  const chatSessionRef = useRef<Chat | null>(null);

  useEffect(() => {
    loadFromFirebase(userId).then(cloud => {
      if (cloud) setAppState(p => ({ ...p, ...cloud }));
      setIsRecovering(false);
    });
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(appState));
    const timer = setTimeout(async () => {
      setIsSyncing(true);
      const ok = await syncToFirebase(userId, appState);
      setIsFirebaseSynced(ok);
      setIsSyncing(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [appState, userId]);

  const handleGenerateReading = async () => {
    setLoading(true);
    try {
      const res = await getCombinedReading(appState.birthDetails, appState.readingOptions, appState.advancedReadingOptions, appState.lifeEvents, appState.outputLanguage, appState.enableGoogleSearch, appState.visuals);
      setReading(res.reading);
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const handleSendMessage = async (message: string) => {
    const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    if (!chatSessionRef.current) {
      chatSessionRef.current = ai.chats.create({
        model: LATEST_PRO_MODEL,
        config: { 
          systemInstruction: buildAstrologyPrompt(appState.birthDetails, appState.readingOptions, appState.advancedReadingOptions, appState.lifeEvents, appState.outputLanguage, appState.visuals, true),
          tools: appState.enableGoogleSearch ? [{ googleSearch: {} }] : undefined
        },
      });
    }
    const newHist: ChatMessage[] = [...appState.chatHistory, { role: 'user', text: message }];
    setAppState(p => ({ ...p, chatHistory: newHist }));
    setLoading(true);
    try {
      const result = await chatSessionRef.current.sendMessage({ message });
      setAppState(p => ({ ...p, chatHistory: [...newHist, { role: 'model', text: result.text || '' }] }));
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  if (isRecovering) return (
    <div className="h-screen flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-indigo-400 font-bold uppercase tracking-[0.3em] text-[10px]">Accessing Akashic Records...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto py-12 px-6">
      <header className="text-center mb-12">
        <h1 className="font-serif text-5xl md:text-6xl text-white font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-indigo-400">Cosmic Compass</h1>
        <div className="flex justify-center space-x-4 items-center">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${isFirebaseSynced ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
            {isSyncing ? 'Syncing...' : isFirebaseSynced ? 'Cloud Connected' : 'Sync Pending'}
          </div>
          <select value={appState.outputLanguage} onChange={e => setAppState(p => ({...p, outputLanguage: e.target.value}))} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 outline-none uppercase tracking-widest cursor-pointer">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
        </div>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl">
          <button onClick={() => setIsChatMode(false)} className={`px-10 py-3 rounded-xl font-bold transition-all ${!isChatMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Profile Mandali</button>
          <button onClick={() => setIsChatMode(true)} className={`px-10 py-3 rounded-xl font-bold transition-all ${isChatMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Oracle Chat</button>
        </div>
      </div>

      {!isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 border border-white/10">
              <h2 className="font-serif text-2xl text-white mb-6">Birth Data</h2>
              <InputField label="Full Name" id="n" type="text" value={appState.birthDetails.name} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, name: e.target.value}}))} />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Birth Date" id="d" type="date" value={appState.birthDetails.dob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, dob: e.target.value}}))} />
                <InputField label="Birth Time" id="t" type="time" value={appState.birthDetails.tob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, tob: e.target.value}}))} />
              </div>
              <InputField label="Birth Place" id="p" type="text" value={appState.birthDetails.pob} onChange={e => setAppState(p => ({...p, birthDetails: {...p.birthDetails, pob: e.target.value}}))} />
            </section>
          </div>
          <div className="lg:col-span-4">
            <section className="glass rounded-[2rem] p-8 flex flex-col min-h-[500px] border border-white/10 shadow-2xl">
              <h2 className="font-serif text-2xl text-white mb-6">Timeline (14 Events)</h2>
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {appState.lifeEvents.map((ev, i) => (
                  <div key={i} className="glass-dark p-4 rounded-xl border border-white/5 relative group">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-xl opacity-50"></div>
                    <div className="text-[10px] text-indigo-400 font-bold mb-1 uppercase tracking-tighter">{ev.date} — {ev.planet}</div>
                    <div className="text-xs text-gray-200 leading-relaxed font-medium">{ev.description}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="lg:col-span-4 space-y-6">
            <button onClick={handleGenerateReading} disabled={loading} className="w-full py-12 bg-indigo-600 rounded-[2rem] text-white font-black text-xl shadow-[0_20px_50px_rgba(79,70,229,0.3)] hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50 border border-white/20">
              {loading ? "Consulting Stars..." : "Generate Cosmic Synthesis"}
            </button>
            {reading && (
                <div className="glass rounded-[2rem] p-8 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-4">Oracle Proclamation</div>
                    {reading}
                </div>
            )}
          </div>
        </div>
      ) : (
        <ChatInterface chatHistory={appState.chatHistory} onSendMessage={handleSendMessage} loading={loading} error={null} onBackToForm={() => setIsChatMode(false)} onClearChat={() => setAppState(p => ({...p, chatHistory: []}))} suggestedQuestions={["Explain my 9-5-1 axis?", "What is my destiny in Germany?"]} isFirebaseSynced={isFirebaseSynced} isSyncing={isSyncing} />
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
