
// App.tsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, ChatMessage, Visuals } from './types';
import { getCombinedReading, initializeChatSession, sendChatMessage } from './services/geminiService';
import InputField from './components/InputField';
import CheckboxField from './components/CheckboxField';
import ChatInterface from './components/ChatInterface';
import { saveStateToLocalStorage, loadStateFromLocalStorage } from './utils/storage';
import { getOrGenerateUserId, syncToFirebase, loadFromFirebase } from './services/firebaseService';
import { Chat } from '@google/genai';

const MASTER_STORAGE_KEY = 'cosmic_compass_master_v1';

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
}

const DEFAULT_STATE: AppState = {
  birthDetails: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India', rashi: 'Cancer' },
  readingOptions: { astrology: true, numerology: true, rashifal: true, jyotish: true, dailyHoroscope: true, palmistry: true, lalKitab: true, vasthu: true, faceReading: true },
  advancedReadingOptions: { culturalContext: 'Vedic', includeScientificPerspective: true },
  lifeEvents: [
    { description: 'Admitted: Platelets down to 10,000', date: '2021-08-24' },
    { description: 'Married to Pankti Patel', date: '2022-01-04' },
    { description: 'Admitted: Excess lead level 269ug/ml', date: '2023-10-20' },
    { description: 'Moved to Germany', date: '2024-11-06' },
    { description: 'Joined Amazon as a driver', date: '2024-12-04' },
    { description: 'Left Amazon job (Small Accident)', date: '2025-01-04' },
    { description: 'Driving trial at Bellabona', date: '2025-01-17' },
    { description: 'Joined Bellabona as driver', date: '2025-01-20' },
    { description: 'Theft: Bag stolen from car', date: '2025-01-21' },
    { description: 'Logistic Manager at Bellabona', date: '2025-05-05' },
    { description: 'Shifted to new rental house', date: '2025-08-08' },
    { description: 'Divorce finalized', date: '2025-10-17' },
    { description: 'Visa extended till 2027', date: '2025-11-17' },
    { description: 'MacBook purchase', date: '2025-12-20' },
  ],
  outputLanguage: 'Gujarati',
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: false,
  chatHistory: [],
  visuals: {}
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [cloudLockReleased, setCloudLockReleased] = useState(false);

  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventDate, setNewEventDate] = useState('');

  const [appState, setAppState] = useState<AppState>(() => {
    return loadStateFromLocalStorage(MASTER_STORAGE_KEY, DEFAULT_STATE);
  });

  const { birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, chatHistory, visuals } = appState;

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

  // CRITICAL RECOVERY PHASE: Load remote data before allowing any writes
  useEffect(() => {
    const recoverSoulHistory = async () => {
      try {
        const remoteData = await loadFromFirebase(userId);
        if (remoteData) {
          setAppState(prev => {
            const remoteHistory = remoteData.chatHistory || [];
            const localHistory = prev.chatHistory || [];
            const finalHistory = remoteHistory.length >= localHistory.length ? remoteHistory : localHistory;
            
            return {
              ...prev,
              ...remoteData,
              chatHistory: finalHistory,
              visuals: remoteData.visuals || prev.visuals
            };
          });
          setIsFirebaseSynced(true);
        }
      } catch (e) {
        console.error("Cloud Access Failure:", e);
      } finally {
        setIsRecovering(false);
        setCloudLockReleased(true);
      }
    };
    recoverSoulHistory();
  }, [userId]);

  const triggerSync = useCallback(async (data: AppState) => {
    if (!cloudLockReleased) return false;
    setIsSyncing(true);
    const success = await syncToFirebase(userId, data);
    setIsFirebaseSynced(success);
    setIsSyncing(false);
    return success;
  }, [userId, cloudLockReleased]);

  useEffect(() => {
    saveStateToLocalStorage(MASTER_STORAGE_KEY, appState);
    if (cloudLockReleased) {
        const timer = setTimeout(() => triggerSync(appState), 10000);
        return () => clearTimeout(timer);
    }
  }, [appState, triggerSync, cloudLockReleased]);

  const handleSendMessage = async (message: string) => {
    let session = currentChatSession;
    if (!session) {
      setChatLoading(true);
      try {
        session = await initializeChatSession(birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, chatHistory, exSpouseDetails, enableGoogleSearch, visuals);
        setCurrentChatSession(session);
      } catch (err: any) { 
        setChatError(err.message); 
        setChatLoading(false); 
        return; 
      }
    }
    
    const newUserMsg: ChatMessage = { role: 'user', text: message };
    setChatLoading(true);
    setAppState(prev => ({ ...prev, chatHistory: [...prev.chatHistory, newUserMsg, { role: 'model', text: '' }] }));
    
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
      
      setAppState(prev => {
        const newState = { ...prev };
        triggerSync(newState);
        return newState;
      });
    } catch (err: any) { 
      setChatError(err.message); 
    } finally { 
      setChatLoading(false); 
    }
  };

  const updateAppState = useCallback((updates: Partial<AppState>) => {
    setAppState((prev) => ({ ...prev, ...updates }));
    setIsFirebaseSynced(false);
  }, []);

  const handleGenerateReading = async () => {
    setLoading(true);
    setError(null);
    setGroundingSources([]);
    try {
      const res = await getCombinedReading(birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, visuals);
      setReading(res.reading);
      setGroundingSources(res.groundingSources || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 pb-24">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file && activeUploadSlot) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const newVisuals = { ...visuals, [activeUploadSlot]: reader.result as string };
                updateAppState({ visuals: newVisuals });
            };
            reader.readAsDataURL(file);
        }
      }} />

      {isRecovering && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl">
           <div className="text-center animate-pulse">
              <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-indigo-400 font-black uppercase tracking-[0.3em] text-[10px]">Restoring Cosmic Data...</p>
           </div>
        </div>
      )}

      <header className="flex flex-col items-center mb-10">
        <h1 className="font-serif text-4xl md:text-5xl text-white mb-2 text-center bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-500 font-bold tracking-tight">Cosmic Compass</h1>
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border transition-all ${isFirebaseSynced ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isFirebaseSynced ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></span>
            <span className="text-[9px] uppercase tracking-tighter text-gray-300 font-black">
              {isSyncing ? 'Writing to Stars...' : isFirebaseSynced ? 'Synced to Cloud' : 'Offline Mode'}
            </span>
          </div>
          <select value={outputLanguage} onChange={e => updateAppState({ outputLanguage: e.target.value })} className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[10px] font-bold text-blue-300">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
        </div>
      </header>

      <div className="flex justify-center mb-10">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl">
          <button onClick={() => setIsChatMode(false)} className={`px-8 py-2.5 rounded-xl font-bold transition-all ${!isChatMode ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Insights</button>
          <button 
            onClick={() => { setIsChatMode(true); }} 
            className={`px-8 py-2.5 rounded-xl font-bold transition-all relative ${isChatMode ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            Oracle Chat {chatHistory.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[8px] flex items-center justify-center border border-white font-black">{chatHistory.length}</span>}
          </button>
        </div>
      </div>

      {!isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-3xl p-6 border border-white/5">
              <h2 className="font-serif text-xl text-white mb-6">Identity</h2>
              <div className="space-y-4">
                <InputField label="Name" id="name" type="text" value={birthDetails.name} onChange={e => updateAppState({ birthDetails: { ...birthDetails, name: e.target.value } })} />
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="DOB" id="dob" type="date" value={birthDetails.dob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, dob: e.target.value } })} />
                  <InputField label="TOB" id="tob" type="time" value={birthDetails.tob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, tob: e.target.value } })} />
                </div>
                <InputField label="Birth Place" id="pob" type="text" value={birthDetails.pob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, pob: e.target.value } })} />
              </div>
            </section>
            
            <section className="glass rounded-3xl p-6 border border-white/5">
              <h2 className="font-serif text-xl text-white mb-4">Oracle Config</h2>
              <CheckboxField label="Enable Cosmic Search" id="search" checked={enableGoogleSearch} onChange={e => updateAppState({ enableGoogleSearch: e.target.checked })} />
              <p className="mt-2 text-[9px] text-gray-500 font-black uppercase tracking-tighter px-2 italic">Uses the latest Gemini Flash with web-grounding.</p>
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-3xl p-6 border border-white/5">
              <h2 className="font-serif text-xl text-white mb-4">Timeline</h2>
              <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                {lifeEvents.map((event, i) => (
                  <div key={i} className="glass-dark p-2.5 rounded-lg border border-white/5 flex justify-between items-center group">
                    <div className="overflow-hidden">
                      <div className="text-white text-[11px] font-semibold truncate">{event.description}</div>
                      <div className="text-blue-400 text-[9px] font-black">{event.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="lg:col-span-4 flex flex-col h-full">
            <button onClick={handleGenerateReading} disabled={loading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-6 rounded-3xl shadow-2xl transition-all disabled:opacity-50 mb-6 border border-white/10">
              {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto"></div> : <span>Get Reading</span>}
            </button>
            {reading && (
              <div className="glass rounded-3xl p-6 border border-white/10 flex-1 overflow-y-auto max-h-[600px] custom-scrollbar shadow-2xl">
                <div className="text-gray-200 text-sm leading-relaxed space-y-4 whitespace-pre-wrap font-medium">{reading}</div>
                {groundingSources.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-white/10">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-3">Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {groundingSources.map((chunk, idx) => {
                        const source = chunk.web || chunk.maps;
                        if (!source) return null;
                        return (
                          <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] text-blue-300 font-bold transition-all">
                            {source.title || 'Source'}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-xs text-center">{error}</div>}
          </div>
        </div>
      ) : (
        <ChatInterface 
          chatHistory={chatHistory} 
          onSendMessage={handleSendMessage} 
          loading={chatLoading} 
          error={chatError} 
          onBackToForm={() => setIsChatMode(false)} 
          onClearChat={() => { if(window.confirm("Purge Oracle Archive?")) { updateAppState({ chatHistory: [] }); setCurrentChatSession(undefined); }}} 
          suggestedQuestions={["Summarize our past discussion?", "Analyze my timeline for 2026?"]}
          isSyncing={isSyncing}
        />
      )}

      <footer className="mt-12 pt-8 border-t border-white/5 text-center flex flex-col items-center">
        <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">Your Stable Soul ID</p>
        <div className="flex items-center space-x-2">
            <code className="bg-black/40 px-5 py-2 rounded-xl text-blue-400 text-[11px] border border-white/10 font-mono select-all">{userId}</code>
            <button onClick={() => { const id = prompt("Enter ID to Restore History:"); if(id) { localStorage.setItem('cosmic_user_id', id); window.location.reload(); }}} className="bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl text-[9px] text-gray-400 border border-white/5 uppercase font-black transition-all">Restore</button>
        </div>
      </footer>
    </div>
  );
};

export default App;
