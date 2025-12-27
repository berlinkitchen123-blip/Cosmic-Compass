import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat } from "@google/genai";
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { 
  User, Milestone, Sparkles, Globe, 
  MessageSquare, History, Zap, Compass, RefreshCw,
  Sun, Moon, Star, Send, Trash2, ArrowLeft,
  Camera, Eye, Layout, Info, MapPin, Clock, Share2, BookOpen, Settings, X, Key, Search
} from 'lucide-react';

// --- Configuration & Constants ---
// Default Fallback Key (May be restricted on deployment)
const DEFAULT_API_KEY = "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg";
const LATEST_PRO_MODEL = 'gemini-3-pro-preview';

const FIREBASE_CONFIG = {
  apiKey: DEFAULT_API_KEY,
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const MASTER_STORAGE_KEY = 'cosmic_compass_master_v17_stable';

// --- Types ---
interface BirthDetails {
  name: string;
  dob: string;
  tob: string;
  pob: string;
}

interface LifeNode {
  date: string;
  description: string;
  planet: string;
}

interface ChatMsg {
  role: 'user' | 'model';
  text: string;
}

interface AppState {
  profile: BirthDetails;
  timeline: LifeNode[];
  history: ChatMsg[];
  language: string;
  isChat: boolean;
  visuals: { face?: string; palm?: string };
  options: {
    astrology: boolean;
    numerology: boolean;
    rashifal: boolean;
    jyotish: boolean;
    palmistry: boolean;
    faceReading: boolean;
  }
}

const DEFAULT_STATE: AppState = {
  profile: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India' },
  timeline: [
    { date: '1995-01-17', description: 'Birth in Vadodara, Gujarat (Sun Node)', planet: 'Sun' },
    { date: '2021-08-24', description: 'Health crisis: Platelets 10k (Karmic Node)', planet: 'Saturn' },
    { date: '2022-01-04', description: 'Married Pankti Patel (Venus Union)', planet: 'Venus' },
    { date: '2024-11-06', description: 'Moved to Germany (International Transit)', planet: 'Rahu' }
  ],
  history: [],
  language: 'Gujarati',
  isChat: false,
  visuals: {},
  options: { astrology: true, numerology: true, rashifal: true, jyotish: true, palmistry: true, faceReading: true }
};

// --- Firebase Initialization (Singleton) ---
const firebaseApp = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
const database = getDatabase(firebaseApp, FIREBASE_CONFIG.databaseURL);

// --- App Component ---
const App: React.FC = () => {
  const [userId] = useState(() => {
    let id = localStorage.getItem('cosmic_user_id');
    if (!id) {
      id = 'u_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('cosmic_user_id', id);
    }
    return id;
  });

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(MASTER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_STATE;
  });

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('cosmic_custom_api_key') || '');
  const [enableSearch, setEnableSearch] = useState(() => localStorage.getItem('cosmic_enable_search') !== 'false');

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [oracleReading, setOracleReading] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);

  // Initial Data Recovery
  useEffect(() => {
    const fetchData = async () => {
      try {
        const snap = await get(ref(database, `users/${userId}`));
        if (snap.exists()) {
          setState(prev => ({ ...prev, ...snap.val() }));
        }
      } catch (e) { console.error("Cloud Error:", e); }
    };
    fetchData();
  }, [userId]);

  // Debounced Sync
  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(state));
    const t = setTimeout(async () => {
      setSyncing(true);
      try {
        await set(ref(database, `users/${userId}`), { ...state, lastUpdated: new Date().toISOString() });
      } catch (e) { console.error("Sync Error:", e); }
      finally { setSyncing(false); }
    }, 2000);
    return () => clearTimeout(t);
  }, [state, userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.history]);

  const saveSettings = () => {
    localStorage.setItem('cosmic_custom_api_key', customApiKey);
    localStorage.setItem('cosmic_enable_search', String(enableSearch));
    setShowSettings(false);
    // Reset chat session to use new key/config
    chatSessionRef.current = null;
    alert("Configuration Saved. The Oracle will now use your updated settings.");
  };

  const getEffectiveApiKey = () => customApiKey.trim() || DEFAULT_API_KEY;

  // AI Prompt Logic - The Core "Combined Science" Engine
  const getPrompt = (isChat: boolean) => {
    const { profile, timeline, language, options } = state;
    
    // Construct the request for combined sciences
    let scienceDirectives = "";
    if (options.astrology) scienceDirectives += "- **Western Astrology**: Analyze planetary transits and aspects.\n";
    if (options.jyotish) scienceDirectives += "- **Vedic Jyotish**: Analyze the D1 Chart (Rashi), D9 (Navamsa), and Vimshottari Dasha.\n";
    if (options.numerology) scienceDirectives += "- **Numerology**: Analyze the 9-5-1 Willpower Axis (Mars-Mercury-Sun) and the Life Path Number.\n";
    if (options.rashifal) scienceDirectives += "- **Rashifal**: Provide the current moon sign forecast.\n";
    if (options.palmistry || options.faceReading) scienceDirectives += "- **Samudrika Shastra**: Integrate any visual data (Face/Palm) into the reading.\n";

    const baseSystem = `You are the "Siddhanta Oracle", a Grand Unified Intelligence of metaphysical sciences. You do not treat these as separate; you synthesize them into a single, cohesive narrative.
    
    KEY ANALYSIS FRAMEWORK:
    ${scienceDirectives}
    
    SPECIFIC FOCUS:
    - **9-5-1 Willpower Axis**: Check for the presence of 9 (Action/Mars), 5 (Intellect/Mercury), and 1 (Ego/Sun) in the birth date grid. Explain how this drives the subject's leadership.
    - **Karmic Nodes**: Correlate the provided life timeline events with planetary movements (e.g., Saturn Return, Rahu Mahadasha).
    
    Response Rules:
    - Language: ${language}.
    - Tone: Mystical, Authoritative, yet scientifically structured.
    - Format: Use Markdown with clear headings for "Planetary Alignment", "Numerological Grid", and "Future Projections (2025-2030)".
    - **CRITICAL**: If the user asks about the future, project strictly based on planetary transits (Gochar).`;

    let userContext = `\n\nSUBJECT DATA:\nName: ${profile.name}\nDOB: ${profile.dob}\nTOB: ${profile.tob}\nPOB: ${profile.pob}`;
    userContext += `\n\nLIFE TIMELINE (Graha Nodes):\n${timeline.map(n => `- ${n.date}: ${n.description} [${n.planet}]`).join('\n')}`;

    if (isChat) {
      return baseSystem + userContext + "\n\nUser Question:";
    } else {
      return baseSystem + userContext + "\n\nTASK: Generate a Full Cosmic Synthesis Report combining all selected sciences.";
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setOracleReading('');
    try {
      const apiKey = getEffectiveApiKey();
      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [{ text: getPrompt(false) }];
      
      if (state.visuals.face) parts.push({ inlineData: { data: state.visuals.face.split(',')[1], mimeType: 'image/jpeg' } });
      if (state.visuals.palm) parts.push({ inlineData: { data: state.visuals.palm.split(',')[1], mimeType: 'image/jpeg' } });

      const config: any = {};
      if (enableSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const res = await ai.models.generateContent({
        model: LATEST_PRO_MODEL,
        contents: { parts },
        config
      });
      setOracleReading(res.text || 'The cosmos is silent. Verify the connection.');
    } catch (e: any) {
      console.error(e);
      if (e.toString().includes('403') || e.message?.includes('403')) {
        alert("Access Forbidden (403).\n\nYour API Key does not have permission for this model or Google Search Grounding.\n\n1. Open Settings (top right).\n2. Try disabling 'Google Search Grounding'.\n3. Or provide a valid Gemini API Key from a project with billing enabled.");
        setShowSettings(true);
      } else {
        alert("Consultation Failed: " + e.message);
      }
    } finally { setLoading(false); }
  };

  const handleSendChat = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    const newHistory: ChatMsg[] = [...state.history, { role: 'user', text }];
    setState(p => ({ ...p, history: newHistory }));
    
    try {
      const apiKey = getEffectiveApiKey();
      const ai = new GoogleGenAI({ apiKey });
      
      if (!chatSessionRef.current) {
        const config: any = { systemInstruction: getPrompt(true) };
        if (enableSearch) {
            config.tools = [{ googleSearch: {} }];
        }

        chatSessionRef.current = ai.chats.create({
          model: LATEST_PRO_MODEL,
          config
        });
      }
      const res = await chatSessionRef.current.sendMessage({ message: text });
      setState(p => ({ ...p, history: [...newHistory, { role: 'model', text: res.text || '' }] }));
    } catch (e: any) {
      console.error(e);
      if (e.toString().includes('403') || e.message?.includes('403')) {
        alert("Access Forbidden (403). Please check Settings > API Key.");
        setShowSettings(true);
      } else {
        alert("Oracle Error: " + e.message);
      }
    } finally { setLoading(false); }
  };

  const handleFileUpload = (type: 'face' | 'palm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setState(p => ({ ...p, visuals: { ...p.visuals, [type]: reader.result as string } }));
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24 relative z-10">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass bg-[#0f172a] rounded-3xl p-8 max-w-md w-full border border-white/20 shadow-2xl relative">
             <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 text-gray-400 hover:text-white"><X size={24}/></button>
             <h3 className="text-xl font-serif text-white mb-6 flex items-center gap-2"><Settings size={20} className="text-indigo-400"/> Oracle Configuration</h3>
             
             <div className="space-y-6">
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Key size={12}/> Gemini API Key</label>
                   <input 
                      type="password" 
                      placeholder="AIzaSy..." 
                      value={customApiKey} 
                      onChange={e => setCustomApiKey(e.target.value)} 
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                   />
                   <p className="text-[10px] text-gray-500 mt-2">Leave empty to use the shared default key (may be rate-limited).</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <div>
                       <label className="text-[12px] font-bold text-gray-200 block flex items-center gap-2"><Search size={12}/> Google Search Grounding</label>
                       <p className="text-[10px] text-gray-500 mt-1">Enhances answers with real-time web data.</p>
                    </div>
                    <button 
                        onClick={() => setEnableSearch(!enableSearch)} 
                        className={`w-10 h-6 rounded-full relative transition-all ${enableSearch ? 'bg-indigo-600' : 'bg-gray-600'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enableSearch ? 'left-5' : 'left-1'}`}></div>
                    </button>
                </div>

                <button onClick={saveSettings} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-sm shadow-lg transition-all">
                  Save Configuration
                </button>
             </div>
          </div>
        </div>
      )}

      <header className="text-center mb-12 relative">
        <h1 className="font-serif text-6xl text-white font-black mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white via-indigo-100 to-indigo-500">Akashic Oracle</h1>
        <div className="flex justify-center items-center space-x-3">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition-all ${syncing ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
            {syncing ? 'Syncing Akashic Cloud...' : 'Soul Record Synced (v17.2)'}
          </div>
          <select value={state.language} onChange={e => setState(p => ({...p, language: e.target.value}))} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase outline-none cursor-pointer">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
            <option value="Hindi">Hindi</option>
          </select>
          <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-indigo-500/20 transition-all">
             <Settings size={14} />
          </button>
        </div>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl border border-white/10">
          <button onClick={() => setState(p => ({...p, isChat: false}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${!state.isChat ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Chart Mandali</button>
          <button onClick={() => setState(p => ({...p, isChat: true}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${state.isChat ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Universal Oracle</button>
        </div>
      </div>

      {!state.isChat ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-700">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl relative">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3"><User size={20} className="text-indigo-400"/><span>Birth Data</span></h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1 block">Full Name</label>
                  <input type="text" value={state.profile.name} onChange={e => setState(p => ({...p, profile: {...p.profile, name: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1 block">Date</label>
                    <input type="date" value={state.profile.dob} onChange={e => setState(p => ({...p, profile: {...p.profile, dob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1 block">Time</label>
                    <input type="time" value={state.profile.tob} onChange={e => setState(p => ({...p, profile: {...p.profile, tob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                </div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5 ml-1 block">Birth Place</label>
                <input type="text" value={state.profile.pob} onChange={e => setState(p => ({...p, profile: {...p.profile, pob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border text-center">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-6">9-5-1 Willpower Axis</h3>
              <div className="grid grid-cols-3 gap-2 max-w-[150px] mx-auto mb-4 bg-black/40 p-3 rounded-2xl border border-white/5">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map(num => (
                  <div key={num} className={`aspect-square flex items-center justify-center text-sm font-black rounded-lg border ${[9, 5, 1].includes(num) ? 'bg-indigo-600/40 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 border-white/5 text-gray-800'}`}>
                    {num}
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-4">Active Planar Grid</p>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 flex flex-col min-h-[550px] glow-border shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3"><Milestone size={20} className="text-amber-400"/><span>Karmic Nodes</span></h2>
                <button onClick={() => setState(p => ({...p, timeline: [...p.timeline, {date: '', description: '', planet: 'Sun'}]}))} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black hover:scale-110 active:scale-95 shadow-xl transition-all">+</button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {state.timeline.map((item, i) => (
                  <div key={i} className="glass p-4 rounded-xl border border-white/5 relative group bg-black/20">
                    <button onClick={() => setState(p => ({...p, timeline: p.timeline.filter((_, idx) => idx !== i)}))} className="absolute right-2 top-2 text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all text-xl">×</button>
                    <div className="flex items-center space-x-2 mb-2">
                       <input type="date" value={item.date} onChange={e => { const t = [...state.timeline]; t[i].date = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-[10px] text-indigo-400 font-bold uppercase outline-none" />
                       <select value={item.planet} onChange={e => { const t = [...state.timeline]; t[i].planet = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-black/40 text-[9px] text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-white/10 outline-none">
                         {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                       </select>
                    </div>
                    <textarea value={item.description} onChange={e => { const t = [...state.timeline]; t[i].description = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-xs text-gray-300 w-full resize-none outline-none leading-relaxed" rows={2} placeholder="Life event..." />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <button onClick={handleGenerate} disabled={loading} className="w-full py-12 bg-indigo-600 rounded-[2.5rem] text-white font-black text-xl shadow-2xl hover:bg-indigo-500 transition-all border border-white/20 active:scale-95 disabled:opacity-50">
              {loading ? "Aligning Navagraha..." : "Generate Cosmic Synthesis"}
            </button>
            {oracleReading && (
              <div className="glass rounded-[2rem] p-8 text-sm leading-relaxed text-gray-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner animate-in slide-in-from-bottom-4">
                {oracleReading}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
               <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload('face')} />
                  {state.visuals.face ? <img src={state.visuals.face} className="w-full h-full object-cover" /> : <><Eye size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Face Scan</span></>}
               </label>
               <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload('palm')} />
                  {state.visuals.palm ? <img src={state.visuals.palm} className="w-full h-full object-cover" /> : <><Layout size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Palm Pattern</span></>}
               </label>
            </div>
            <section className="glass rounded-3xl p-6 glow-border">
              <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 tracking-widest flex items-center space-x-2"><BookOpen size={12}/><span>Combined Sciences</span></h4>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(state.options).map(opt => (
                  <button key={opt} onClick={() => setState(p => ({...p, options: {...p.options, [opt]: !(p.options as any)[opt]}}))} className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase transition-all ${(state.options as any)[opt] ? 'bg-indigo-600/30 border-indigo-400 text-white' : 'bg-black/20 border-white/5 text-gray-600'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-[70vh] glass rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="px-10 py-6 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl">🔮</div>
              <div>
                <h2 className="text-xl font-bold text-white">Universal Oracle Chat</h2>
                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Connection Active</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={() => setState(p => ({...p, history: []}))} className="px-4 py-1.5 text-[10px] font-black uppercase text-gray-500 hover:text-white transition-all">Clear Soul Record</button>
              <button onClick={() => setState(p => ({...p, isChat: false}))} className="px-4 py-1.5 text-[10px] font-black uppercase bg-indigo-600/20 text-indigo-300 rounded-lg border border-indigo-500/20">Back to Profile</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-black/10">
            {state.history.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                <Sparkles size={48} className="text-indigo-400"/>
                <p className="font-serif italic text-lg text-white">Inquire about the 9-5-1 axis, Jyotish charts, or your destiny peaks...</p>
              </div>
            )}
            {state.history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[80%] px-8 py-5 rounded-[2.5rem] border ${msg.role === 'user' ? 'bg-indigo-600/30 border-indigo-500/40 text-white' : 'bg-white/5 border-white/10 text-gray-200'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {loading && <div className="text-[10px] text-indigo-400 animate-pulse font-black uppercase tracking-widest text-center py-4">Oracle Channeling...</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-8 bg-white/5 border-t border-white/10">
             <div className="relative max-w-4xl mx-auto">
               <input 
                 type="text" 
                 onKeyDown={e => { if(e.key === 'Enter') { handleSendChat((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} 
                 placeholder="Speak your truth to the Oracle..." 
                 className="w-full bg-black/40 border border-white/10 rounded-full py-5 px-10 pr-20 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" 
               />
               <button onClick={(e) => { 
                 const input = (e.currentTarget.previousSibling as HTMLInputElement); 
                 handleSendChat(input.value); 
                 input.value = ''; 
               }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-indigo-400 hover:text-white transition-colors bg-indigo-600/10 rounded-full">
                 <Send size={24} />
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);