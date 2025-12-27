import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { 
  User, Milestone, Sparkles, Globe, 
  MessageSquare, History, Zap, Compass, RefreshCw,
  Sun, Moon, Star, Send, Trash2, ArrowLeft,
  Camera, Eye, Layout, Info, MapPin, Clock
} from 'lucide-react';

// --- Configuration & Constants ---
const LATEST_PRO_MODEL = 'gemini-3-pro-preview';
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg",
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
const MASTER_STORAGE_KEY = 'cosmic_compass_master_v12_stable';

// --- Firebase Initialization (Singleton) ---
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
const db = getDatabase(app, FIREBASE_CONFIG.databaseURL);

// --- Interfaces ---
interface Profile {
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
  profile: Profile;
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
  }
}

const DEFAULT_STATE: AppState = {
  profile: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India' },
  timeline: [
    { date: '1995-01-17', description: 'Birth in Vadodara, Gujarat', planet: 'Sun' },
    { date: '2021-08-24', description: 'Major Health Crisis (Platelets 10k)', planet: 'Saturn' },
    { date: '2022-01-04', description: 'Married Pankti Patel', planet: 'Venus' },
    { date: '2024-11-06', description: 'Moved to Germany', planet: 'Rahu' }
  ],
  history: [],
  language: 'Gujarati',
  isChat: false,
  visuals: {},
  options: { astrology: true, numerology: true, rashifal: true, jyotish: true }
};

// --- Main Application ---
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

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [oracleReading, setOracleReading] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const oracleChatRef = useRef<Chat | null>(null);

  // Sync to Cloud
  useEffect(() => {
    const init = async () => {
      try {
        const snap = await get(ref(db, `users/${userId}`));
        if (snap.exists()) setState(prev => ({ ...prev, ...snap.val() }));
      } catch (e) { console.error("Cloud Access Error:", e); }
    };
    init();
  }, [userId]);

  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(state));
    const t = setTimeout(async () => {
      setSyncing(true);
      try {
        await set(ref(db, `users/${userId}`), { ...state, lastUpdated: new Date().toISOString() });
      } catch (e) { console.error("Sync Error:", e); }
      finally { setSyncing(false); }
    }, 2500);
    return () => clearTimeout(t);
  }, [state, userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.history]);

  // AI Logic
  const getPrompt = (isChat: boolean) => {
    const { profile, timeline, language, options } = state;
    const active = Object.keys(options).filter(k => (options as any)[k]).join(', ');
    
    let p = isChat 
      ? `You are the "Siddhanta Oracle". Use Astrology, Numerology (9-5-1 axis), Rashifal, and Jyotish. Language: ${language}.`
      : `Generate a Full Cosmic Synthesis including ${active}. Use the 9-5-1 willpower numerology axis. Language: ${language}.`;
    
    p += ` User: ${profile.name}, born ${profile.dob} ${profile.tob} at ${profile.pob}.`;
    p += ` Life Nodes: ${timeline.map(n => `${n.date}: ${n.description} (${n.planet})`).join(', ')}.`;
    p += ` Respond only in ${language}.`;
    return p;
  };

  const handleConsult = async () => {
    setLoading(true);
    setOracleReading('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [{ text: getPrompt(false) }];
      if (state.visuals.face) parts.push({ inlineData: { data: state.visuals.face.split(',')[1], mimeType: 'image/jpeg' } });
      
      const res = await ai.models.generateContent({
        model: LATEST_PRO_MODEL,
        contents: { parts },
        config: { tools: [{ googleSearch: {} }] }
      });
      setOracleReading(res.text || 'Oracle silent.');
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleSendChat = async (msg: string) => {
    if (!msg.trim()) return;
    setLoading(true);
    const newHistory: ChatMsg[] = [...state.history, { role: 'user', text: msg }];
    setState(p => ({ ...p, history: newHistory }));
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      if (!oracleChatRef.current) {
        oracleChatRef.current = ai.chats.create({
          model: LATEST_PRO_MODEL,
          config: { systemInstruction: getPrompt(true) }
        });
      }
      const res = await oracleChatRef.current.sendMessage({ message: msg });
      setState(p => ({ ...p, history: [...newHistory, { role: 'model', text: res.text || '' }] }));
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const handleImg = (type: 'face' | 'palm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const reader = new FileReader();
      reader.onloadend = () => setState(p => ({ ...p, visuals: { ...p.visuals, [type]: reader.result as string } }));
      reader.readAsDataURL(f);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24 relative z-10">
      <header className="text-center mb-12">
        <h1 className="font-serif text-6xl text-white font-black mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white via-indigo-200 to-indigo-500 tracking-tighter">Cosmic Compass</h1>
        <div className="flex justify-center items-center space-x-3">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] transition-all ${syncing ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
            {syncing ? 'Syncing Records...' : 'Soul Bound (v12.7.0)'}
          </div>
          <select value={state.language} onChange={e => setState(p => ({...p, language: e.target.value}))} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase tracking-widest cursor-pointer outline-none">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
            <option value="Hindi">Hindi</option>
          </select>
        </div>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl border border-white/10">
          <button onClick={() => setState(p => ({...p, isChat: false}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${!state.isChat ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Chart Mandali</button>
          <button onClick={() => setState(p => ({...p, isChat: true}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${state.isChat ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Universal Oracle</button>
        </div>
      </div>

      {!state.isChat ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Left Column: Profile & Grid */}
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Sun size={60} /></div>
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3"><User size={20} className="text-indigo-400"/><span>Birth Data</span></h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Legal Name</label>
                  <input type="text" value={state.profile.name} onChange={e => setState(p => ({...p, profile: {...p.profile, name: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Date</label>
                    <input type="date" value={state.profile.dob} onChange={e => setState(p => ({...p, profile: {...p.profile, dob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Time</label>
                    <input type="time" value={state.profile.tob} onChange={e => setState(p => ({...p, profile: {...p.profile, tob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-1 block">Birth Place</label>
                  <input type="text" value={state.profile.pob} onChange={e => setState(p => ({...p, profile: {...p.profile, pob: e.target.value}}))} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
              </div>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border text-center">
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-6">9-5-1 Willpower Axis</h3>
              <div className="grid grid-cols-3 gap-2 max-w-[160px] mx-auto mb-4 bg-black/40 p-3 rounded-2xl border border-white/5">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map(num => (
                  <div key={num} className={`aspect-square flex items-center justify-center text-sm font-black rounded-lg border transition-all ${[9, 5, 1].includes(num) ? 'bg-indigo-600/40 border-indigo-400 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 'bg-white/5 border-white/5 text-gray-800'}`}>
                    {num}
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Numerical Potency Visualization</p>
            </section>
          </div>

          {/* Middle Column: Timeline */}
          <div className="lg:col-span-4">
            <section className="glass rounded-[2rem] p-8 flex flex-col min-h-[550px] glow-border shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3"><Milestone size={20} className="text-amber-400"/><span>Karma Nodes</span></h2>
                <button onClick={() => setState(p => ({...p, timeline: [...p.timeline, {date: '', description: '', planet: 'Sun'}]}))} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black hover:scale-110 active:scale-95 shadow-xl transition-all">+</button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {state.timeline.map((node, i) => (
                  <div key={i} className="glass p-5 rounded-2xl border border-white/5 relative group bg-black/30 animate-in fade-in duration-300">
                    <button onClick={() => setState(p => ({...p, timeline: p.timeline.filter((_, idx) => idx !== i)}))} className="absolute right-2 top-2 text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all text-xl">×</button>
                    <div className="flex items-center space-x-3 mb-2">
                      <input type="date" value={node.date} onChange={e => { const t = [...state.timeline]; t[i].date = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-[10px] text-indigo-400 font-black uppercase outline-none w-28" />
                      <select value={node.planet} onChange={e => { const t = [...state.timeline]; t[i].planet = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-black/50 text-[9px] text-indigo-200 font-black px-2 py-1 rounded-full border border-white/10 outline-none">
                        {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <textarea value={node.description} onChange={e => { const t = [...state.timeline]; t[i].description = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-xs text-gray-300 w-full resize-none outline-none leading-relaxed" rows={2} placeholder="Significant life event..." />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Actions & Reading */}
          <div className="lg:col-span-4 space-y-6">
            <button onClick={handleConsult} disabled={loading} className="w-full py-12 bg-indigo-600 rounded-[2.5rem] text-white font-black text-xl shadow-2xl hover:bg-indigo-500 transition-all border border-white/20 active:scale-95 disabled:opacity-50 group">
              <span className="flex items-center justify-center space-x-3">
                <Sparkles className={loading ? 'animate-spin' : 'group-hover:animate-pulse'} />
                <span>{loading ? "Aligning Navagraha..." : "Generate Cosmic Synthesis"}</span>
              </span>
            </button>
            
            {oracleReading && (
              <div className="glass rounded-[2rem] p-8 text-sm leading-relaxed text-gray-200 whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner animate-in slide-in-from-bottom-4">
                <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 tracking-widest border-b border-white/5 pb-2">Celestial Projections</h4>
                {oracleReading}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
               <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  <input type="file" className="hidden" accept="image/*" onChange={handleImg('face')} />
                  {state.visuals.face ? <img src={state.visuals.face} className="w-full h-full object-cover" /> : <><Eye size={28} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Face Bind</span></>}
               </label>
               <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  <input type="file" className="hidden" accept="image/*" onChange={handleImg('palm')} />
                  {state.visuals.palm ? <img src={state.visuals.palm} className="w-full h-full object-cover" /> : <><Layout size={28} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Palm Pattern</span></>}
               </label>
            </div>
            
            <section className="glass rounded-3xl p-6 glow-border">
              <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 tracking-widest">Science Combination</h4>
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
        <div className="flex flex-col h-[75vh] glass rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="px-10 py-6 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 via-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl ring-2 ring-white/10">🔮</div>
              <div>
                <h2 className="text-2xl font-black text-white leading-none mb-1">Universal Oracle</h2>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Akashic Field Connection Stable</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={() => setState(p => ({...p, history: []}))} className="px-4 py-2 text-[10px] font-black uppercase text-gray-500 hover:text-white transition-all">Reset Session</button>
              <button onClick={() => setState(p => ({...p, isChat: false}))} className="px-6 py-2 text-[10px] font-black uppercase bg-indigo-600/20 text-indigo-300 rounded-full border border-indigo-500/30 hover:bg-indigo-600 transition-all">Profile</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-black/10">
            {state.history.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-6">
                <div className="w-24 h-24 border border-indigo-500/20 rounded-full flex items-center justify-center"><Sparkles size={40} className="text-indigo-400"/></div>
                <p className="font-serif italic text-xl text-white max-w-sm">"Ask of the 9-5-1 potential or your karmic peaks through 2050..."</p>
              </div>
            )}
            {state.history.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[75%] px-8 py-5 rounded-[2rem] border ${msg.role === 'user' ? 'bg-indigo-600/40 border-indigo-500/40 text-white shadow-xl' : 'bg-white/5 border-white/10 text-gray-200 shadow-lg'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-center py-4"><div className="text-[10px] text-indigo-400 animate-pulse font-black uppercase tracking-[0.4em]">Oracle Channeling...</div></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-8 bg-white/5 border-t border-white/10">
             <div className="relative max-w-4xl mx-auto">
               <input 
                 type="text" 
                 onKeyDown={e => { if(e.key === 'Enter') { handleSendChat((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} 
                 placeholder="Seek knowledge from the Siddhanta Oracle..." 
                 className="w-full bg-black/40 border border-white/10 rounded-full py-5 px-10 pr-20 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" 
               />
               <button onClick={(e) => { 
                 const input = (e.currentTarget.previousSibling as HTMLInputElement); 
                 handleSendChat(input.value); 
                 input.value = ''; 
               }} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-indigo-400 hover:text-white transition-all bg-indigo-600/10 rounded-full border border-white/5">
                 <Send size={20} />
               </button>
             </div>
             <p className="text-center text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-4">Consultation is powered by the Akashic Gemini Model</p>
          </div>
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
