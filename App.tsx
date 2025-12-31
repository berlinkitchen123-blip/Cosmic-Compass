
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, ChatMessage, Visuals } from './types';
import { getCombinedReading, initializeChatSession, sendChatMessage } from './services/geminiService';
import InputField from './components/InputField';
import CheckboxField from './components/CheckboxField';
import ChatInterface from './components/ChatInterface';
import { saveStateToLocalStorage, loadStateFromLocalStorage } from './utils/storage';
import { getOrGenerateUserId, syncToFirebase, loadFromFirebase } from './services/firebaseService';
import { Chat } from '@google/genai';
import { Settings, X, Cpu, Search, Eye, Layout, Key } from 'lucide-react';

const MASTER_STORAGE_KEY = 'cosmic_compass_master_v3';

interface AppState {
  birthDetails: BirthDetails;
  readingOptions: ReadingOptions;
  advancedReadingOptions: AdvancedReadingOptions;
  lifeEvents: LifeEvent[];
  outputLanguage: string;
  exSpouseDetails?: SpouseDetails;
  enableGoogleSearch: boolean;
  chatHistory: ChatMessage[];
  visuals: Visuals;
  specialNotes: string;
}

const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

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
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: false, // Default to FALSE to save quota tokens
  chatHistory: [],
  visuals: {},
  specialNotes: 'Active 9-5-1 Willpower Axis'
};

// Safe way to check for environment variable
const getSafeEnvApiKey = (): string => {
  try {
    // @ts-ignore
    const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
    if (env.VITE_GEMINI_API_KEY) return env.VITE_GEMINI_API_KEY;
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;

    // @ts-ignore
    if (typeof process !== 'undefined' && process?.env) {
      // @ts-ignore
      return process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    }
  } catch (e) { }
  return '';
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [cloudLockReleased, setCloudLockReleased] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('cosmic_selected_model') || 'gemini-1.5-flash');

  // SAFE API KEY HANDLING for Static Hosts
  const [apiKey, setApiKey] = useState(() => {
    const stored = localStorage.getItem('cosmic_api_key');
    if (stored) return stored;
    return getSafeEnvApiKey();
  });

  const [appState, setAppState] = useState<AppState>(() => {
    return loadStateFromLocalStorage(MASTER_STORAGE_KEY, DEFAULT_STATE);
  });

  const { birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, chatHistory, visuals, specialNotes, frontierParams } = appState;

  const [reading, setReading] = useState<string>('');
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState<boolean>(false);
  const [currentChatSession, setCurrentChatSession] = useState<Chat | undefined>(undefined);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadSlot, setActiveUploadSlot] = useState<keyof Visuals | null>(null);

  // Recovery effect from cloud
  useEffect(() => {
    const recoverData = async () => {
      try {
        const remoteData = await loadFromFirebase(userId);
        if (remoteData) {
          setAppState(prev => ({
            ...prev,
            ...remoteData,
            chatHistory: remoteData.chatHistory || prev.chatHistory,
            visuals: remoteData.visuals || prev.visuals
          }));
          setIsFirebaseSynced(true);
        }
      } catch (e) {
        console.error("Cloud Access Failure:", e);
      } finally {
        setIsRecovering(false);
        setCloudLockReleased(true);
      }
    };
    recoverData();
  }, [userId]);

  const triggerSync = useCallback(async (data: AppState) => {
    if (!cloudLockReleased) return false;
    setIsSyncing(true);
    const success = await syncToFirebase(userId, data);
    setIsFirebaseSynced(success);
    setIsSyncing(false);
    return success;
  }, [userId, cloudLockReleased]);

  // Regular auto-sync debounce (2s)
  useEffect(() => {
    saveStateToLocalStorage(MASTER_STORAGE_KEY, appState);
    if (cloudLockReleased) {
      const timer = setTimeout(() => triggerSync(appState), 2000);
      return () => clearTimeout(timer);
    }
  }, [appState, triggerSync, cloudLockReleased]);

  const saveSettings = () => {
    localStorage.setItem('cosmic_selected_model', selectedModel);
    localStorage.setItem('cosmic_api_key', apiKey); // Persist API key
    setShowSettings(false);
    setCurrentChatSession(undefined); // Reset chat
  };

  const handleSendMessage = async (message: string) => {
    let session = currentChatSession;
    if (!session) {
      setChatLoading(true);
      try {
        session = await initializeChatSession(
          birthDetails,
          readingOptions,
          advancedReadingOptions,
          lifeEvents,
          outputLanguage,
          chatHistory,
          exSpouseDetails,
          enableGoogleSearch,
          visuals,
          frontierParams, // Pass frontierParams
          apiKey,
          selectedModel
        );
        setCurrentChatSession(session);
      } catch (err: any) {
        setChatError(err.message);
        setChatLoading(false);
        return;
      }
    }

    const newUserMsg: ChatMessage = { role: 'user', text: message };
    setChatLoading(true);

    // Update local state first
    const updatedHistory = [...chatHistory, newUserMsg, { role: 'model' as const, text: '' }];
    setAppState(prev => ({ ...prev, chatHistory: updatedHistory }));

    let fullText = '';
    try {
      const stream = sendChatMessage(session, message);
      for await (const chunk of stream) {
        fullText += chunk;
        setAppState(prev => {
          const hist = [...prev.chatHistory];
          if (hist.length > 0) hist[hist.length - 1].text = fullText;
          return { ...prev, chatHistory: hist };
        });
      }

      // Force sync after message completes
      const finalChatHistory = [...chatHistory, newUserMsg, { role: 'model' as const, text: fullText }];
      const finalChatState = { ...appState, chatHistory: finalChatHistory };
      triggerSync(finalChatState);

    } catch (err: any) {
      const errStr = err.toString();
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
        setChatError("Quota Exhausted (429): Please wait 60 seconds or disable Google Search in Settings.");
      } else {
        setChatError(err.message);
      }
    } finally {
      setChatLoading(false);
    }
  };

  const updateAppState = useCallback((updates: Partial<AppState>) => {
    setAppState((prev) => ({ ...prev, ...updates }));
    setIsFirebaseSynced(false);
  }, []);

  const handleAddEvent = () => {
    const newEvents = [...lifeEvents, { description: '', date: new Date().toISOString().split('T')[0], planet: 'Mars' }];
    updateAppState({ lifeEvents: newEvents });
  };

  const handleRemoveEvent = (index: number) => {
    const newEvents = lifeEvents.filter((_, i) => i !== index);
    updateAppState({ lifeEvents: newEvents });
  };

  const handleUpdateEvent = (index: number, field: keyof LifeEvent, value: string) => {
    const newEvents = [...lifeEvents];
    newEvents[index] = { ...newEvents[index], [field]: value };
    updateAppState({ lifeEvents: newEvents });
  };

  const handleGenerateReading = async () => {
    setLoading(true);
    setError(null);
    setGroundingSources([]);
    try {
      const res = await getCombinedReading(
        birthDetails,
        readingOptions,
        advancedReadingOptions,
        lifeEvents,
        outputLanguage,
        exSpouseDetails,
        enableGoogleSearch,
        visuals,
        frontierParams,
        apiKey,
        selectedModel
      );
      setReading(res.reading);
      setGroundingSources(res.groundingSources || []);
    } catch (err: any) {
      const errStr = err.toString();
      if (errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
        setError("Quota Exhausted (429): Please wait 60s or disable Google Search in Settings.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (type: 'face' | 'palm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedData = canvas.toDataURL('image/jpeg', 0.7);
          const newVisuals = { ...visuals, [type]: compressedData };
          updateAppState({ visuals: newVisuals });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24 relative">

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass bg-[#0f172a] rounded-3xl p-8 max-w-md w-full border border-white/20 shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 text-gray-400 hover:text-white"><X size={24} /></button>
            <h3 className="text-xl font-serif text-white mb-6 flex items-center gap-2"><Settings size={20} className="text-indigo-400" /> Oracle Configuration</h3>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Cpu size={12} /> Intelligence Model</label>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="gemini-1.5-flash">Gemini 3 Flash (Faster, Standard)</option>
                  <option value="gemini-3-pro-preview">Gemini 3 Pro (Higher Reasoning)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Key size={12} /> Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Enter your AI Studio API Key..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <p className="text-[9px] text-gray-500 mt-2">Get your key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-indigo-400 underline">AI Studio</a>. Avoid Firebase keys.</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div>
                  <label className="text-[12px] font-bold text-gray-200 block flex items-center gap-2"><Search size={12} /> Google Search Grounding</label>
                  <p className="text-[10px] text-gray-500 mt-1">Enhances answers with web data.</p>
                </div>
                <button
                  onClick={() => updateAppState({ enableGoogleSearch: !enableGoogleSearch })}
                  className={`w-10 h-6 rounded-full relative transition-all ${enableGoogleSearch ? 'bg-indigo-600' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enableGoogleSearch ? 'left-5' : 'left-1'}`}></div>
                </button>
              </div>

              <button onClick={saveSettings} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-sm shadow-lg transition-all">
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {isRecovering && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl">
          <div className="text-center">
            <div className="w-16 h-16 border-t-4 border-indigo-500 rounded-full animate-spin mx-auto mb-6"></div>
            <p className="text-indigo-400 font-bold uppercase tracking-[0.4em] text-xs">Accessing Akashic Cloud...</p>
          </div>
        </div>
      )}

      <header className="flex flex-col items-center mb-12">
        <div className="relative mb-4">
          <div className="absolute inset-0 blur-2xl bg-indigo-500/20 rounded-full"></div>
          <h1 className="relative font-serif text-5xl md:text-6xl text-white text-center bg-clip-text text-transparent bg-gradient-to-b from-white via-indigo-200 to-indigo-500 font-bold tracking-tight py-2">Cosmic Compass</h1>
        </div>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center space-x-2 px-4 py-1.5 rounded-full border transition-all ${isFirebaseSynced ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
            <div className={`w-2 h-2 rounded-full ${isFirebaseSynced ? 'bg-indigo-500' : 'bg-amber-500 animate-pulse'}`}></div>
            <span className="text-[10px] uppercase tracking-widest text-gray-300 font-black">
              {isSyncing ? 'Syncing...' : isFirebaseSynced ? 'Cloud Synced' : 'Sync Pending'}
            </span>
          </div>
          <select value={outputLanguage} onChange={e => updateAppState({ outputLanguage: e.target.value })} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase tracking-widest outline-none">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
          <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-indigo-500/20 transition-all">
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl border border-white/10">
          <button onClick={() => setIsChatMode(false)} className={`px-10 py-3 rounded-xl font-bold transition-all ${!isChatMode ? 'bg-indigo-600 text-white shadow-indigo-500/20 shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Profile Mandali</button>
          <button
            onClick={() => setIsChatMode(true)}
            className={`px-10 py-3 rounded-xl font-bold transition-all relative ${isChatMode ? 'bg-purple-600 text-white shadow-purple-500/20 shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            Universal Oracle Chat {chatHistory.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[9px] flex items-center justify-center border-2 border-[#020617] font-black">{chatHistory.length}</span>}
          </button>
        </div>
      </div>

      {!isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3">
                <span className="text-indigo-400">✧</span>
                <span>Birth Data</span>
              </h2>
              <div className="space-y-5">
                <InputField label="Name" id="name" type="text" value={birthDetails.name} onChange={e => updateAppState({ birthDetails: { ...birthDetails, name: e.target.value } })} />
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Date of Birth" id="dob" type="date" value={birthDetails.dob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, dob: e.target.value } })} />
                  <InputField label="Time of Birth" id="tob" type="time" value={birthDetails.tob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, tob: e.target.value } })} />
                </div>
                <InputField label="Birth Place" id="pob" type="text" value={birthDetails.pob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, pob: e.target.value } })} />
              </div>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-amber-400">⧉</span>
                <span>9-5-1 Axis Analysis</span>
              </h2>
              <div className="grid grid-cols-3 gap-2 aspect-square max-w-[180px] mx-auto mb-6 p-2 bg-black/40 rounded-2xl border border-white/10">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map((num) => {
                  const isActive = [9, 5, 1].includes(num);
                  return (
                    <div key={num} className={`flex items-center justify-center text-sm font-black rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border-indigo-400 border' : 'bg-white/5 text-gray-700'}`}>
                      {num}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">Willpower Line Visualization</p>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border flex flex-col min-h-[600px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3">
                  <span className="text-amber-400">⏳</span>
                  <span>Navagraha Nodes</span>
                </h2>
                <button onClick={handleAddEvent} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-all shadow-xl">+</button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 flex-1">
                {lifeEvents.map((event, i) => (
                  <div key={i} className="glass-dark p-4 rounded-2xl border border-white/5 flex flex-col relative group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600/50"></div>
                    <div className="flex justify-between items-center mb-2">
                      <select value={event.planet || ''} onChange={(e) => handleUpdateEvent(i, 'planet', e.target.value)} className="bg-indigo-900/40 text-indigo-300 text-[9px] font-black uppercase px-2 py-1 rounded-full outline-none">
                        <option value="">Select Planet</option>
                        {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={() => handleRemoveEvent(i)} className="text-gray-600 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100">×</button>
                    </div>
                    <textarea value={event.description} onChange={(e) => handleUpdateEvent(i, 'description', e.target.value)} className="bg-transparent text-gray-200 text-xs w-full resize-none outline-none" rows={2} placeholder="Karmic event..." />
                    <div className="text-[9px] text-indigo-400/60 font-black mt-1">{event.date}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <button
              onClick={handleGenerateReading}
              disabled={loading}
              className="w-full relative py-12 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-2xl transition-all border border-white/20"
            >
              {loading ? "Aligning Navagraha..." : "Generate Cosmic Synthesis"}
            </button>
            {reading && (
              <div className="glass rounded-[2rem] p-8 border border-white/10 overflow-y-auto max-h-[600px] custom-scrollbar">
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap mb-6">{reading}</div>
                {groundingSources.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <p className="text-[10px] uppercase tracking-widest text-indigo-400 font-black mb-4">Grounding Sources</p>
                    <ul className="space-y-4">
                      {groundingSources.map((source, idx) => (
                        <li key={idx} className="flex items-start flex-col">
                          {source.web && (
                            <div className="flex items-start mb-1">
                              <span className="text-indigo-500 mr-2">🔗</span>
                              <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200 transition-all underline decoration-indigo-500/30">
                                {source.web.title || source.web.uri}
                              </a>
                            </div>
                          )}
                          {source.maps && (
                            <div className="flex items-start flex-col mb-1">
                              <div className="flex items-start mb-1">
                                <span className="text-amber-500 mr-2">📍</span>
                                <a href={source.maps.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-300 hover:text-amber-200 transition-all underline decoration-amber-500/30">
                                  {source.maps.title || "View Location on Google Maps"}
                                </a>
                              </div>
                              {source.maps.placeAnswerSources?.reviewSnippets?.map((snippet: string, sIdx: number) => (
                                <p key={sIdx} className="ml-6 text-[10px] text-gray-500 italic leading-snug">"{snippet}"</p>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload('face')} />
                {visuals?.face ? <img src={visuals.face} className="w-full h-full object-cover" /> : <><Eye size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform" /><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Face Scan</span></>}
              </label>
              <label className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload('palm')} />
                {visuals?.palm ? <img src={visuals.palm} className="w-full h-full object-cover" /> : <><Layout size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform" /><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Palm Pattern</span></>}
              </label>
            </div>

            <button
              onClick={() => setIsChatMode(true)}
              className="w-full py-5 rounded-2xl bg-white/5 hover:bg-white/10 text-indigo-400 font-bold text-xs uppercase tracking-widest border border-indigo-500/20 transition-all shadow-xl"
            >
              Consult Universal Oracle Chat
            </button>
          </div>
        </div>
      ) : (
        <ChatInterface
          chatHistory={chatHistory}
          onSendMessage={handleSendMessage}
          loading={chatLoading}
          error={chatError}
          onBackToForm={() => setIsChatMode(false)}
          onClearChat={() => { if (window.confirm("Clear Oracle data?")) { updateAppState({ chatHistory: [] }); setCurrentChatSession(undefined); } }}
          suggestedQuestions={["Explain my 9-5-1 potential?", "My career roadmap 2030-2050?", "How do the 9 planets affect me in Germany?"]}
          isSyncing={isSyncing}
          isFirebaseSynced={isFirebaseSynced}
        />
      )}

      {/* Persistent Floating Chat FAB */}
      {!isChatMode && (
        <button
          onClick={() => setIsChatMode(true)}
          className="fixed bottom-10 right-10 w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all z-50 group"
        >
          <div className="absolute -top-12 right-0 bg-indigo-900 text-white text-[10px] font-bold px-3 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">Ask the Oracle</div>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        </button>
      )}
    </div>
  );
};

export default App;
