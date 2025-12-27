import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';
import { 
  User, Milestone, Sparkles, Globe, 
  MessageSquare, History, Zap, Compass, RefreshCw,
  Sun, Moon, Star, Send, Trash2, ArrowLeft,
  Camera, Eye, Layout, Info
} from 'lucide-react';

// --- Configuration ---
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
const MASTER_STORAGE_KEY = 'cosmic_compass_master_v12';

// --- Firebase Init ---
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
const db = getDatabase(app, FIREBASE_CONFIG.databaseURL);

// --- Interfaces ---
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

interface ProfileData {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  language: string;
}

interface LifeTimeline {
  date: string;
  description: string;
  planet: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AppState {
  profile: ProfileData;
  options: ReadingOptions;
  timeline: LifeTimeline[];
  chatHistory: ChatMessage[];
  isChatMode: boolean;
  visualData: { face?: string; palm?: string };
}

const DEFAULT_STATE: AppState = {
  profile: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India', language: 'Gujarati' },
  options: {
    astrology: true, numerology: true, rashifal: true, jyotish: true, 
    dailyHoroscope: true, palmistry: false, lalKitab: false, vasthu: false, faceReading: false
  },
  timeline: [
    { date: '1995-01-17', description: 'Birth in Vadodara, Gujarat', planet: 'Sun' },
    { date: '2021-08-24', description: 'Health crisis (Platelets 10k)', planet: 'Saturn' },
    { date: '2022-01-04', description: 'Married Pankti Patel', planet: 'Venus' },
    { date: '2024-11-06', description: 'Moved to Germany', planet: 'Rahu' }
  ],
  chatHistory: [],
  isChatMode: false,
  visualData: {}
};

// --- Components ---
const InputField = ({ label, type, value, onChange }: any) => (
  <div className="mb-4">
    <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-black mb-1.5 px-1">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all" 
    />
  </div>
);

const CheckboxTile = ({ label, checked, onChange }: any) => (
  <button 
    onClick={() => onChange(!checked)}
    className={`p-3 rounded-xl border transition-all flex items-center justify-between text-left ${checked ? 'bg-indigo-600/20 border-indigo-400 text-white' : 'bg-black/10 border-white/5 text-gray-500 hover:border-white/10'}`}
  >
    <span className="text-xs font-bold">{label}</span>
    <div className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'}`}>
      {checked && <div className="w-2 h-2 bg-white rounded-full"></div>}
    </div>
  </button>
);

const App: React.FC = () => {
  const [userId] = useState(() => {
    let id = localStorage.getItem('cosmic_user_id');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('cosmic_user_id', id);
    }
    return id;
  });

  const [state, setState] = useState<AppState>(() => {
    const local = localStorage.getItem(MASTER_STORAGE_KEY);
    return local ? JSON.parse(local) : DEFAULT_STATE;
  });

  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState('');
  const [syncing, setSyncing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);

  // Initial Cloud Load
  useEffect(() => {
    const initCloud = async () => {
      try {
        const snap = await get(ref(db, `users/${userId}`));
        if (snap.exists()) {
          setState(prev => ({ ...prev, ...snap.val() }));
        }
      } catch (e) { console.error("Cloud Access Failure:", e); }
    };
    initCloud();
  }, [userId]);

  // Sync to Cloud & LocalStorage
  useEffect(() => {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(state));
    const timer = setTimeout(async () => {
      setSyncing(true);
      try {
        await set(ref(db, `users/${userId}`), { ...state, lastUpdated: new Date().toISOString() });
      } catch (e) { console.error("Firebase Sync Error:", e); }
      finally { setSyncing(false); }
    }, 3000);
    return () => clearTimeout(timer);
  }, [state, userId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatHistory]);

  const getPartFromImage = (dataUri: string) => {
    const [header, data] = dataUri.split(',');
    const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
    return { inlineData: { mimeType, data } };
  };

  const buildPrompt = (isChat: boolean) => {
    const { profile, timeline, options } = state;
    let p = isChat 
      ? "You are the Siddhanta Oracle. Combine Astrology, Numerology, Jyotish, and Palmistry into a single wisdom stream."
      : "Generate a comprehensive synthesis. Include: " + Object.keys(options).filter(k => (options as any)[k]).join(', ');
    
    p += ` Language: ${profile.language}. Respond ONLY in this language.`;
    p += ` User: ${profile.name}, born ${profile.dob} ${profile.tob} at ${profile.pob}.`;
    p += ` 9-5-1 Willpower Axis analysis required. Life Nodes: ${timeline.map(t => `${t.date}: ${t.description} (${t.planet})`).join(', ')}.`;
    return p;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setReading('');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = [{ text: buildPrompt(false) }];
      
      if (state.visualData.face) parts.push(getPartFromImage(state.visualData.face));
      if (state.visualData.palm) parts.push(getPartFromImage(state.visualData.palm));

      const res = await ai.models.generateContent({
        model: LATEST_PRO_MODEL,
        contents: { parts },
        config: { tools: [{ googleSearch: {} }] }
      });
      setReading(res.text || 'The stars are clouded.');
    } catch (e: any) {
      alert("Consultation failed: " + e.message);
    } finally { setLoading(false); }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    const newHist: ChatMessage[] = [...state.chatHistory, { role: 'user', text }];
    setState(p => ({ ...p, chatHistory: newHist }));
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      if (!chatSessionRef.current) {
        chatSessionRef.current = ai.chats.create({
          model: LATEST_PRO_MODEL,
          config: { systemInstruction: buildPrompt(true) }
        });
      }
      const res = await chatSessionRef.current.sendMessage({ message: text });
      setState(p => ({ ...p, chatHistory: [...newHist, { role: 'model', text: res.text || '' }] }));
    } catch (e: any) {
      alert("Oracle Error: " + e.message);
    } finally { setLoading(false); }
  };

  const handleFileUpload = (type: 'face' | 'palm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setState(p => ({ ...p, visualData: { ...p.visualData, [type]: reader.result as string } }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24">
      <header className="text-center mb-12 relative">
        <h1 className="font-serif text-6xl text-white font-black mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white via-indigo-100 to-indigo-500">Cosmic Compass</h1>
        <div className="flex justify-center items-center space-x-3">
          <div className={`px-4 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${syncing ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
            {syncing ? 'Akashic Syncing...' : 'Soul Record Bound'}
          </div>
          <select value={state.profile.language} onChange={e => setState(p => ({...p, profile: {...p.profile, language: e.target.value}}))} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase outline-none cursor-pointer">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
            <option value="Hindi">Hindi</option>
          </select>
        </div>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl">
          <button onClick={() => setState(p => ({...p, isChatMode: false}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${!state.isChatMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Chart Mandali</button>
          <button onClick={() => setState(p => ({...p, isChatMode: true}))} className={`px-10 py-3 rounded-xl font-bold transition-all ${state.isChatMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Universal Oracle</button>
        </div>
      </div>

      {!state.isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-700">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3">
                <User size={20} className="text-indigo-400"/>
                <span>Birth Record</span>
              </h2>
              <InputField label="Name" type="text" value={state.profile.name} onChange={(v: string) => setState(p => ({...p, profile: {...p.profile, name: v}}))} />
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Date" type="date" value={state.profile.dob} onChange={(v: string) => setState(p => ({...p, profile: {...p.profile, dob: v}}))} />
                <InputField label="Time" type="time" value={state.profile.tob} onChange={(v: string) => setState(p => ({...p, profile: {...p.profile, tob: v}}))} />
              </div>
              <InputField label="Location" type="text" value={state.profile.pob} onChange={(v: string) => setState(p => ({...p, profile: {...p.profile, pob: v}}))} />
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <Layout size={20} className="text-purple-400"/>
                <span>Science Matrix</span>
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {Object.keys(state.options).map(key => (
                  <CheckboxTile 
                    key={key} 
                    label={key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')} 
                    checked={(state.options as any)[key]} 
                    onChange={(val: boolean) => setState(p => ({...p, options: {...p.options, [key]: val}}))} 
                  />
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 flex flex-col min-h-[500px] glow-border shadow-2xl">
              <div className="flex justify-between items-center mb-8">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3">
                  <Milestone size={20} className="text-amber-400"/>
                  <span>Karma Nodes</span>
                </h2>
                <button onClick={() => setState(p => ({...p, timeline: [...p.timeline, {date: new Date().toISOString().split('T')[0], description: '', planet: 'Sun'}]}))} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black hover:scale-110 active:scale-95 transition-all shadow-xl">+</button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {state.timeline.map((item, i) => (
                  <div key={i} className="glass p-4 rounded-xl border border-white/5 relative group bg-black/20">
                    <button onClick={() => setState(p => ({...p, timeline: p.timeline.filter((_, idx) => idx !== i)}))} className="absolute right-2 top-2 text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all text-xl">×</button>
                    <div className="flex items-center space-x-2 mb-2">
                       <input type="date" value={item.date} onChange={e => { const t = [...state.timeline]; t[i].date = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-[10px] text-indigo-400 font-bold uppercase w-1/2 outline-none" />
                       <select value={item.planet} onChange={e => { const t = [...state.timeline]; t[i].planet = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-black/40 text-[9px] text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-white/10 outline-none">
                         {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                       </select>
                    </div>
                    <textarea value={item.description} onChange={e => { const t = [...state.timeline]; t[i].description = e.target.value; setState(p => ({...p, timeline: t})); }} className="bg-transparent text-xs text-gray-300 w-full resize-none outline-none" rows={2} placeholder="Life event..." />
                  </div>
                ))}
              </div>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <Camera size={20} className="text-indigo-400"/>
                <span>Visual Bindings</span>
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative group">
                  <input type="file" id="face-input" className="hidden" accept="image/*" onChange={handleFileUpload('face')} />
                  <label htmlFor="face-input" className="aspect-square glass rounded-2xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden">
                    {state.visualData.face ? <img src={state.visualData.face} className="w-full h-full object-cover" /> : <><Eye size={32} className="text-gray-600 mb-2"/><span className="text-[10px] font-black uppercase">Face Profile</span></>}
                  </label>
                </div>
                <div className="relative group">
                  <input type="file" id="palm-input" className="hidden" accept="image/*" onChange={handleFileUpload('palm')} />
                  <label htmlFor="palm-input" className="aspect-square glass rounded-2xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden">
                    {state.visualData.palm ? <img src={state.visualData.palm} className="w-full h-full object-cover" /> : <><Layout size={32} className="text-gray-600 mb-2"/><span className="text-[10px] font-black uppercase">Palm Pattern</span></>}
                  </label>
                </div>
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <button onClick={handleGenerate} disabled={loading} className="w-full py-12 bg-indigo-600 rounded-[2.5rem] text-white font-black text-xl shadow-2xl hover:bg-indigo-500 transition-all border border-white/20 active:scale-95 disabled:opacity-50">
              {loading ? "Aligning Science Matrix..." : "Generate Cosmic Synthesis"}
            </button>
            {reading && (
              <div className="glass rounded-[2.5rem] p-8 text-sm leading-relaxed text-gray-200 whitespace-pre-wrap max-h-[600px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner animate-in slide-in-from-bottom-4">
                {reading}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-[75vh] glass rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="px-8 py-5 bg-white/5 border-b border-white/10 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl">🔮</div>
              <h2 className="text-xl font-bold text-white">Universal Oracle Chat</h2>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={() => setState(p => ({...p, chatHistory: []}))} className="px-4 py-1.5 text-[10px] font-black uppercase text-gray-400 hover:text-white rounded-lg">Clear Soul Record</button>
              <button onClick={() => setState(p => ({...p, isChatMode: false}))} className="px-4 py-1.5 text-[10px] font-black uppercase bg-indigo-600/20 text-indigo-300 rounded-lg border border-indigo-500/20">View Chart</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-black/10">
            {state.chatHistory.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                <Sparkles size={48} className="text-indigo-400"/>
                <p className="font-serif italic text-lg text-white">Inquire about your destiny paths...</p>
              </div>
            )}
            {state.chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`max-w-[80%] px-6 py-4 rounded-2xl border ${msg.role === 'user' ? 'bg-indigo-600/30 border-indigo-500/40 text-white shadow-lg' : 'bg-white/5 border-white/10 text-gray-200'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}
            {loading && <div className="text-[10px] text-indigo-400 animate-pulse font-black uppercase tracking-widest text-center">Oracle Channeling...</div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-6 bg-white/5 border-t border-white/10">
             <div className="relative">
               <input 
                 type="text" 
                 onKeyDown={e => { if(e.key === 'Enter') { handleSendMessage((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} 
                 placeholder="Speak your truth..." 
                 className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-8 pr-16 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner" 
               />
               <button onClick={(e) => { 
                 const input = (e.currentTarget.previousSibling as HTMLInputElement); 
                 handleSendMessage(input.value); 
                 input.value = ''; 
               }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-white transition-colors">
                 <Send size={24} />
               </button>
             </div>
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
