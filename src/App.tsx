
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, ChatMessage, Visuals } from '../types';
import { getCombinedReading, initializeChatSession, sendChatMessage } from '../services/geminiService';
import { fetchPlanetaryData } from '../services/astrologyService';
import InputField from '../components/InputField';
import CheckboxField from '../components/CheckboxField';
import ChatInterface from '../components/ChatInterface';
import CameraCapture from '../components/CameraCapture';
// Removed CHAT_HISTORY_KEY related imports and logic, added saveChatToFirebase
import { saveStateToLocalStorage, loadStateFromLocalStorage, removeFromLocalStorage } from '../utils/storage';
import { getOrGenerateUserId, syncToFirebase, loadFromFirebase, saveChatToFirebase } from '../services/firebaseService';
import { Chat } from '@google/genai';
import { Settings, X, Cpu, Search, Eye, Layout, RefreshCw, Key, AlertTriangle, ExternalLink, Globe, Sparkles, Fingerprint } from 'lucide-react';

// VERSION 14.4 - GRAND UNIFIED SCIENCE UPGRADE
const MASTER_STORAGE_KEY = 'cosmic_compass_master_v14_4';

// Known Firebase Key Signature to detect user error
const KNOWN_FIREBASE_KEY_PART = "AIzaSyDrFjYv2";

function isFirebaseKey(key: string) {
    if (!key) return false;
    const cleanKey = key.trim();
    // Check if it matches the pattern of the firebase key used in config
    return cleanKey.includes(KNOWN_FIREBASE_KEY_PART);
}

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
  realAstrologyData?: any;
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
    { date: '2021-08-24', description: 'Admitted: Platelets down to 10,000 (Health Crisis)', planet: 'Saturn' },
    { date: '2021-12-10', description: 'Engagement ceremony with Pankti Patel', planet: 'Venus' },
    { date: '2022-01-04', description: 'Married to Pankti Patel', planet: 'Venus' },
    { date: '2023-05-15', description: 'Significant career advancement/promotion', planet: 'Mercury' },
    { date: '2023-10-20', description: 'Admitted: Excess lead level 269ug/ml (Toxicology)', planet: 'Rahu' },
    { date: '2024-06-20', description: 'Preparation for International Migration', planet: 'Rahu' },
    { date: '2024-11-06', description: 'Moved to Germany (Transcontinental Transit)', planet: 'Rahu' },
    { date: '2024-12-04', description: 'Joined Amazon as a driver', planet: 'Saturn' },
    { date: '2025-01-04', description: 'Left Amazon job (Small Accident)', planet: 'Ketu' },
    { date: '2025-01-17', description: 'Driving trial at Bellabona', planet: 'Mercury' },
    { date: '2025-01-20', description: 'Joined Bellabona as driver', planet: 'Saturn' },
    { date: '2025-01-21', description: 'Theft: Bag stolen with Passport/DL', planet: 'Rahu' },
    { date: '2025-05-05', description: 'Logistics Manager at Bellabona (Management Role)', planet: 'Sun' },
    { date: '2025-08-08', description: 'Shifted to new rental house', planet: 'Moon' },
    { date: '2025-10-17', description: 'Divorce from Pankti finalized', planet: 'Ketu' },
    { date: '2025-11-17', description: 'Visa extended till May 2027', planet: 'Jupiter' },
    { date: '2025-12-20', description: 'MacBook purchase (Tax paid by company)', planet: 'Venus' }
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  outputLanguage: 'Gujarati',
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: true,
  chatHistory: [],
  visuals: {},
  specialNotes: 'Active 9-5-1 Willpower Axis',
  realAstrologyData: null
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [cloudLockReleased, setCloudLockReleased] = useState(false);

  // Settings & API Key State
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('cosmic_selected_model') || 'gemini-3.1-pro-preview');
  
  // Initialize API Key from LocalStorage
  const [apiKey, setApiKey] = useState(() => {
    // Priority: LocalStorage -> Process Env (if valid)
    const stored = localStorage.getItem('cosmic_api_key');
    if (stored) return stored;
    return process.env.GEMINI_API_KEY_1 && !isFirebaseKey(process.env.GEMINI_API_KEY_1) ? process.env.GEMINI_API_KEY_1 : '';
  });
  const [keyError, setKeyError] = useState<string | null>(null);

  // Load App State
  const [appState, setAppState] = useState<AppState>(() => {
    const mainState = loadStateFromLocalStorage(MASTER_STORAGE_KEY, DEFAULT_STATE);
    // FORCE EMPTY CHAT ON INIT - We now rely strictly on Cloud/Firebase for chat history
    // This prevents stale local data and respects "not local storage" request
    return { ...mainState, chatHistory: [] };
  });

  const { birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, chatHistory, visuals, specialNotes, realAstrologyData } = appState;

  const [reading, setReading] = useState<string>('');
  const [groundingSources, setGroundingSources] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isChatMode, setIsChatMode] = useState<boolean>(false);
  const [currentChatSession, setCurrentChatSession] = useState<Chat | undefined>(undefined);
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [activeCamera, setActiveCamera] = useState<'face' | 'palm' | null>(null);

  // 1. API Key Validation Effect
  useEffect(() => {
    if (apiKey && isFirebaseKey(apiKey)) {
        setKeyError("CRITICAL ERROR: You entered the Firebase API Key. This will not work with Gemini AI. Please enter a valid Gemini API Key starting with 'AIza' (but not the Firebase one).");
        setShowSettings(true);
    } else {
        setKeyError(null);
    }
  }, [apiKey]);

  // 2. Recovery from Firebase (This is where chat history is loaded)
  useEffect(() => {
    const recoverData = async () => {
      try {
        const remoteData = await loadFromFirebase(userId);
        if (remoteData) {
          const isDefaultUser = remoteData.birthDetails?.name?.toLowerCase().includes('harshkumar');
          let resolvedLifeEvents = isDefaultUser ? DEFAULT_STATE.lifeEvents : (remoteData.lifeEvents || DEFAULT_STATE.lifeEvents);

          setAppState(prev => ({
            ...prev,
            ...remoteData,
            lifeEvents: resolvedLifeEvents,
            // Ensure we use the remote chat history
            chatHistory: remoteData.chatHistory || [],
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

  // 3. Robust Auto-Save (EXCLUDING CHAT FROM LOCAL STORAGE)
  useEffect(() => {
    // Create a copy of state but with empty chat history for local storage persistence
    // This satisfies the "not local storage" requirement for chat
    const stateToPersist = { ...appState, chatHistory: [] };
    saveStateToLocalStorage(MASTER_STORAGE_KEY, stateToPersist);
    
    // Clean up old local storage key if it exists
    removeFromLocalStorage('cosmic_compass_chat_archive');

    if (cloudLockReleased) {
        const timer = setTimeout(() => triggerSync(appState), 2000);
        return () => clearTimeout(timer);
    }
  }, [appState, triggerSync, cloudLockReleased]);

  const saveSettings = () => {
    if (isFirebaseKey(apiKey)) {
        setKeyError("Cannot save settings: Invalid API Key detected.");
        return;
    }
    localStorage.setItem('cosmic_selected_model', selectedModel);
    localStorage.setItem('cosmic_api_key', apiKey); // Persist API key
    setShowSettings(false);
    setCurrentChatSession(undefined); // Reset chat session to force re-init with new key
  };

  const handleSendMessage = async (message: string) => {
    // Validation before sending
    if (!apiKey || isFirebaseKey(apiKey)) {
        setChatError("Invalid or Missing API Key. Please configure in Settings.");
        setShowSettings(true);
        return;
    }

    let session = currentChatSession;
    if (!session) {
      setChatLoading(true);
      try {
        let astroData = realAstrologyData;
        if (!astroData) {
          astroData = await fetchPlanetaryData(birthDetails, apiKey);
          updateAppState({ realAstrologyData: astroData });
        }

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
            apiKey, // Use state apiKey
            selectedModel,
            astroData
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
    setChatError(null);
    
    // 1. Optimistic Update Local State
    const updatedHistoryWithUser = [...chatHistory, newUserMsg];
    // 2. Save User Message to Firebase Immediately (Cloud Persistence)
    saveChatToFirebase(userId, updatedHistoryWithUser);

    setAppState(prev => ({ ...prev, chatHistory: [...updatedHistoryWithUser, { role: 'model' as const, text: '' }] }));
    
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
      
      const finalChatHistory = [...chatHistory, newUserMsg, { role: 'model' as const, text: fullText }];
      
      // 3. Save Final Model Response to Firebase Immediately (Cloud Persistence)
      // This bypasses the debounced triggerSync for immediate reliability
      saveChatToFirebase(userId, finalChatHistory);
      
      // Also trigger full sync to ensure consistency
      const finalChatState = { ...appState, chatHistory: finalChatHistory };
      triggerSync(finalChatState);

    } catch (err: any) { 
      setChatError(err.message); 
      // If error implies permission, open settings
      if (err.message && (err.message.includes('403') || err.message.includes('API key'))) {
          setShowSettings(true);
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

  const handleResetEvents = () => {
    if (window.confirm("Reset timeline to the full Master Timeline? This will restore all 23 historical and future events.")) {
        updateAppState({ lifeEvents: DEFAULT_STATE.lifeEvents });
    }
  };

  const handleGenerateReading = async () => {
    if (!apiKey || isFirebaseKey(apiKey)) {
        setError("Invalid or Missing API Key. Please configure in Settings.");
        setShowSettings(true);
        return;
    }

    setLoading(true);
    setError(null);
    setGroundingSources([]);
    try {
      let astroData = realAstrologyData;
      if (!astroData) {
        astroData = await fetchPlanetaryData(birthDetails, apiKey);
        updateAppState({ realAstrologyData: astroData });
      }

      const res = await getCombinedReading(
          birthDetails, 
          readingOptions, 
          advancedReadingOptions, 
          lifeEvents, 
          outputLanguage, 
          exSpouseDetails, 
          enableGoogleSearch, 
          visuals,
          apiKey, // Use state apiKey
          selectedModel,
          astroData
      );
      setReading(res.reading);
      setGroundingSources(res.groundingSources || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24 relative">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass bg-[#0f172a] rounded-3xl p-8 max-w-md w-full border border-white/20 shadow-2xl relative">
             <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 text-gray-400 hover:text-white"><X size={24}/></button>
             <h3 className="text-xl font-serif text-white mb-6 flex items-center gap-2"><Settings size={20} className="text-indigo-400"/> System Configuration</h3>
             
             <div className="space-y-6">
                
                {/* API Key Section */}
                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Key size={12}/> Gemini API Key</label>
                   {keyError && (
                     <div className="bg-red-900/40 border border-red-500/50 p-3 rounded-xl mb-3 flex items-start gap-2">
                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={14}/>
                        <p className="text-[10px] text-red-200 leading-snug">{keyError}</p>
                     </div>
                   )}
                   <input 
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste Gemini API Key (AIza...)"
                      className={`w-full bg-black/40 border rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 transition-all ${keyError ? 'border-red-500 focus:ring-red-500/50' : 'border-white/10 focus:ring-indigo-500/50'}`}
                   />
                   <div className="mt-2 flex justify-between items-center">
                     <p className="text-[9px] text-gray-500">Key is stored locally on your device.</p>
                     <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="flex items-center text-[9px] text-indigo-400 hover:text-indigo-300 font-bold">
                        Get Key <ExternalLink size={10} className="ml-1"/>
                     </a>
                   </div>
                </div>

                <div>
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Cpu size={12}/> AI Core</label>
                   <select 
                      value={selectedModel} 
                      onChange={e => setSelectedModel(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                   >
                      <option value="gemini-3.1-8b-preview">Gemini 3.1 8B (Fast Inference)</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Deep Reasoning)</option>
                   </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <div>
                       <label className="text-[12px] font-bold text-gray-200 block flex items-center gap-2"><Search size={12}/> Global Data Uplink</label>
                       <p className="text-[10px] text-gray-500 mt-1">Connects to live web data (NASA/News).</p>
                    </div>
                    <button 
                        onClick={() => updateAppState({ enableGoogleSearch: !enableGoogleSearch })} 
                        className={`w-10 h-6 rounded-full relative transition-all ${enableGoogleSearch ? 'bg-indigo-600' : 'bg-gray-600'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enableGoogleSearch ? 'left-5' : 'left-1'}`}></div>
                    </button>
                </div>

                <button 
                    onClick={saveSettings} 
                    disabled={!!keyError || !apiKey}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl text-white font-bold text-sm shadow-lg transition-all"
                >
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
              <p className="text-indigo-400 font-bold uppercase tracking-[0.4em] text-xs">Calibrating Reality Engine...</p>
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
          <button onClick={() => setShowSettings(true)} className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all ${!apiKey ? 'bg-red-500/20 border-red-500 text-red-200 animate-pulse' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-indigo-500/20'}`}>
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
                <span>Multi-Dimensional Matrix</span>
              </h2>
              <div className="grid grid-cols-3 gap-2 aspect-square max-w-[180px] mx-auto mb-6 p-2 bg-black/40 rounded-2xl border border-white/10">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map((num) => {
                  const isActive = [9, 5, 1].includes(num); // Keep highlighting specific Willpower line but show full grid context
                  return (
                    <div key={num} className={`flex items-center justify-center text-sm font-black rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border-indigo-400 border' : 'bg-white/5 text-gray-700'}`}>
                      {num}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">Lo Shu & Numerology Grid</p>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border flex flex-col min-h-[600px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3">
                  <span className="text-amber-400">⏳</span>
                  <span>Karmic Timeline</span>
                </h2>
                <div className="flex gap-2">
                    <button 
                        onClick={handleResetEvents} 
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/20 text-gray-300 flex items-center justify-center transition-all"
                        title="Reset to Original 14 Events"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={handleAddEvent} className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-all shadow-xl">+</button>
                </div>
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
                    <input 
                        type="date" 
                        value={event.date} 
                        onChange={(e) => handleUpdateEvent(i, 'date', e.target.value)} 
                        className="bg-transparent text-[9px] text-indigo-400 font-black mt-1 outline-none border-none p-0 focus:ring-0 cursor-pointer w-full" 
                        style={{ colorScheme: 'dark' }}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <button 
                onClick={handleGenerateReading} 
                disabled={loading} 
                className="w-full relative py-12 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-2xl transition-all border border-white/20 overflow-hidden group"
            >
               <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-gradient-x"></div>
               <span className="relative z-10 flex items-center justify-center gap-2">
                 {loading ? <RefreshCw className="animate-spin" size={20}/> : <Sparkles size={20}/>}
                 {loading ? "Synthesizing All Sciences..." : "Grand Unified Analysis"}
               </span>
            </button>
            {reading && (
              <div className="glass rounded-[2rem] p-8 border border-white/10 overflow-y-auto max-h-[600px] custom-scrollbar">
                <div className="text-white text-base leading-relaxed whitespace-pre-wrap mb-6 font-medium">{reading}</div>
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
               <div className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  {visuals?.face ? (
                    <div className="relative w-full h-full">
                      <img src={visuals.face} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setActiveCamera('face')}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <RefreshCw size={24} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setActiveCamera('face')}
                      className="w-full h-full flex flex-col items-center justify-center"
                    >
                      <Eye size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Face Reading</span>
                    </button>
                  )}
               </div>
               <div className="aspect-square glass rounded-3xl flex flex-col items-center justify-center cursor-pointer border-white/10 hover:border-indigo-500/50 transition-all overflow-hidden relative group">
                  {visuals?.palm ? (
                    <div className="relative w-full h-full">
                      <img src={visuals.palm} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setActiveCamera('palm')}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <RefreshCw size={24} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setActiveCamera('palm')}
                      className="w-full h-full flex flex-col items-center justify-center"
                    >
                      <Fingerprint size={32} className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform"/>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Palm Reading</span>
                    </button>
                  )}
               </div>
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
          onClearChat={() => { if(window.confirm("Clear Oracle data?")) { updateAppState({ chatHistory: [] }); setCurrentChatSession(undefined); saveChatToFirebase(userId, []); }}} 
          suggestedQuestions={["Do I have Pitru Dosha?", "Explain my Lal Kitab Rina?", "My Career path in 2030 (Logistics)?"]}
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

      {activeCamera && (
        <CameraCapture 
          title={activeCamera === 'face' ? 'Face Scan' : 'Palm Scan'}
          onClose={() => setActiveCamera(null)}
          onCapture={(img) => {
            const newVisuals = { ...visuals, [activeCamera]: img };
            updateAppState({ visuals: newVisuals });
          }}
        />
      )}
    </div>
  );
};

export default App;
