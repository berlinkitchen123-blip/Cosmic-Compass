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
  specialNotes: string;
}

const DEFAULT_STATE: AppState = {
  birthDetails: { name: 'Harshkumar Panubhai Patel', dob: '1995-01-17', tob: '15:58', pob: 'Vadodara, Gujarat, India', rashi: 'Cancer' },
  readingOptions: { astrology: true, numerology: true, rashifal: true, jyotish: true, dailyHoroscope: true, palmistry: true, lalKitab: true, vasthu: true, faceReading: true },
  advancedReadingOptions: { culturalContext: 'Vedic', includeScientificPerspective: true },
  lifeEvents: [
    { description: 'Admitted: Platelets down to 10,000', date: '2021-08-24' },
    { description: 'Married to Pankti Patel', date: '2022-01-04' },
    { description: 'Moved to Germany', date: '2024-11-06' },
    { description: 'Logistic Manager at Bellabona', date: '2025-05-05' },
    { description: 'Divorce finalized', date: '2025-10-17' },
  ],
  outputLanguage: 'Gujarati',
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: true,
  chatHistory: [],
  visuals: {},
  specialNotes: '9, 5, 1 system (Willpower Line)'
};

const App: React.FC = () => {
  const [userId] = useState(() => getOrGenerateUserId());
  const [isFirebaseSynced, setIsFirebaseSynced] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(true);
  const [cloudLockReleased, setCloudLockReleased] = useState(false);

  const [appState, setAppState] = useState<AppState>(() => {
    return loadStateFromLocalStorage(MASTER_STORAGE_KEY, DEFAULT_STATE);
  });

  const { birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, chatHistory, visuals, specialNotes } = appState;

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

  const handleUploadClick = (slot: keyof Visuals) => {
    setActiveUploadSlot(slot);
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-6 pb-24 relative">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl">
           <div className="text-center">
              <div className="w-16 h-16 border-t-4 border-indigo-500 rounded-full animate-spin mx-auto mb-6"></div>
              <p className="text-indigo-400 font-bold uppercase tracking-[0.4em] text-xs">Aligning the Stars...</p>
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
              {isSyncing ? 'Synchronizing Soul Data...' : isFirebaseSynced ? 'Akashic Sync Active' : 'Offline Orbit'}
            </span>
          </div>
          <select value={outputLanguage} onChange={e => updateAppState({ outputLanguage: e.target.value })} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase tracking-widest focus:ring-0">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
        </div>
      </header>

      <div className="flex justify-center mb-12">
        <div className="glass p-1.5 rounded-2xl flex space-x-2 shadow-2xl border border-white/10">
          <button onClick={() => setIsChatMode(false)} className={`px-10 py-3 rounded-xl font-bold transition-all ${!isChatMode ? 'bg-indigo-600 text-white shadow-indigo-500/20 shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>Profile Synthesis</button>
          <button 
            onClick={() => { setIsChatMode(true); }} 
            className={`px-10 py-3 rounded-xl font-bold transition-all relative ${isChatMode ? 'bg-purple-600 text-white shadow-purple-500/20 shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            Universal Oracle {chatHistory.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[9px] flex items-center justify-center border-2 border-[#020617] font-black">{chatHistory.length}</span>}
          </button>
        </div>
      </div>

      {!isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Data Input */}
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3">
                <span className="text-indigo-400">✧</span>
                <span>Birth Mandali</span>
              </h2>
              <div className="space-y-5">
                <InputField label="Name" id="name" type="text" value={birthDetails.name} onChange={e => updateAppState({ birthDetails: { ...birthDetails, name: e.target.value } })} />
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Date of Birth" id="dob" type="date" value={birthDetails.dob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, dob: e.target.value } })} />
                  <InputField label="Time of Birth" id="tob" type="time" value={birthDetails.tob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, tob: e.target.value } })} />
                </div>
                <InputField label="Birth Place" id="pob" type="text" value={birthDetails.pob} onChange={e => updateAppState({ birthDetails: { ...birthDetails, pob: e.target.value } })} />
                <InputField label="Rashi (Optional)" id="rashi" type="text" value={birthDetails.rashi || ''} placeholder="e.g. Cancer / Kark" onChange={e => updateAppState({ birthDetails: { ...birthDetails, rashi: e.target.value } })} />
                <div className="mt-4">
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5 px-1">Special Observations</label>
                  <textarea 
                    value={specialNotes} 
                    onChange={e => updateAppState({ specialNotes: e.target.value })} 
                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all h-24 resize-none"
                    placeholder="e.g. 9-5-1 Willpower line, Shani Mahadasha starting 2029..."
                  />
                </div>
              </div>
            </section>
            
            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-purple-400">❂</span>
                <span>Oracle Configuration</span>
              </h2>
              <div className="space-y-4">
                <CheckboxField label="Enable Akashic Web Search" id="search" checked={enableGoogleSearch} onChange={e => updateAppState({ enableGoogleSearch: e.target.checked })} />
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest leading-relaxed">Synthesized analysis of Jyotish, Numerology (9-5-1 Line), and long-term transits.</p>
                </div>
              </div>
            </section>
          </div>

          {/* Middle Column: Visuals & Timeline */}
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3">
                <span className="text-emerald-400">👁</span>
                <span>Physical Signs</span>
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {(['face', 'leftHand', 'rightHand'] as const).map(slot => (
                  <button key={slot} onClick={() => handleUploadClick(slot)} className="relative group aspect-square rounded-2xl overflow-hidden glass-dark border border-white/10 flex flex-col items-center justify-center transition-all hover:bg-white/5">
                    {visuals[slot] ? (
                        <>
                            <img src={visuals[slot]} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" alt={slot} />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-all">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white">Replace</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="text-xl mb-1">{slot === 'face' ? '👤' : slot === 'leftHand' ? '✋' : '✋'}</span>
                            <span className="text-[9px] font-black uppercase tracking-tighter text-gray-500 group-hover:text-indigo-400">{slot}</span>
                        </>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[9px] text-gray-500 font-black uppercase tracking-widest text-center">Samudrika Shastra integration via Vision Models</p>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border overflow-hidden">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-amber-400">⏳</span>
                <span>Karmic Timeline</span>
              </h2>
              <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                {lifeEvents.map((event, i) => (
                  <div key={i} className="glass-dark p-4 rounded-2xl border border-white/5 flex flex-col relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50 group-hover:bg-indigo-400 transition-all"></div>
                    <span className="text-indigo-400 text-[10px] font-black uppercase mb-1">{event.date}</span>
                    <span className="text-gray-200 text-xs font-semibold leading-relaxed">{event.description}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-4 flex flex-col h-full">
            <button 
                onClick={handleGenerateReading} 
                disabled={loading} 
                className="w-full group relative overflow-hidden bg-indigo-600 text-white font-bold py-8 rounded-[2rem] shadow-2xl transition-all disabled:opacity-50 mb-6 border border-white/10 hover:bg-indigo-500 active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              {loading ? (
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-3"></div>
                    <span className="text-[10px] uppercase tracking-[0.3em]">Channeling Long-Term Synthesis...</span>
                </div>
              ) : <span className="text-lg uppercase tracking-widest">Invoke Synthesis</span>}
            </button>
            
            {reading && (
              <div className="glass rounded-[2rem] p-10 border border-white/10 flex-1 overflow-y-auto max-h-[700px] custom-scrollbar shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="prose prose-invert max-w-none">
                    <div className="text-gray-200 text-sm leading-relaxed space-y-6 whitespace-pre-wrap font-medium selection:bg-indigo-500/50">
                        {reading}
                    </div>
                </div>
                {groundingSources.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-4">Astral Anchors (Sources)</p>
                    <div className="flex flex-wrap gap-2">
                      {groundingSources.map((chunk, idx) => {
                        const source = chunk.web || chunk.maps;
                        if (!source) return null;
                        return (
                          <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] text-indigo-300 font-bold transition-all flex items-center space-x-2">
                            <span>{source.title || 'Nexus Point'}</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-6 bg-red-500/10 border border-red-500/30 rounded-[1.5rem] text-red-400 text-xs text-center font-bold tracking-widest uppercase">
                {error}
              </div>
            )}
            
            {!reading && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-30 text-center">
                    <div className="text-5xl mb-4">✨</div>
                    <p className="font-serif text-xl italic">The cosmic pattern extends far into your future.</p>
                </div>
            )}
          </div>
        </div>
      ) : (
        <ChatInterface 
          chatHistory={chatHistory} 
          onSendMessage={handleSendMessage} 
          loading={chatLoading} 
          error={chatError} 
          onBackToForm={() => setIsChatMode(false)} 
          onClearChat={() => { if(window.confirm("Purge Cosmic Memories?")) { updateAppState({ chatHistory: [] }); setCurrentChatSession(undefined); }}} 
          suggestedQuestions={["Explain my 9-5-1 Willpower Line success potential?", "Project my career and financial status in 2030 and 2040?", "Compare my chart configuration with successful global leaders?", "When is my next major Mahadasha shift after 2030?"]}
          isSyncing={isSyncing}
        />
      )}

      <footer className="mt-24 pt-12 border-t border-white/5 text-center flex flex-col items-center pb-12">
        <p className="text-[10px] text-indigo-400/60 font-black uppercase tracking-[0.4em] mb-4">Stable Soul Resonance ID</p>
        <div className="flex items-center space-x-3">
            <code className="bg-black/60 px-8 py-3 rounded-2xl text-indigo-300 text-[11px] border border-white/10 font-mono select-all shadow-inner">{userId}</code>
            <button 
                onClick={() => { const id = prompt("Enter Soul ID to Restore Continuity:"); if(id) { localStorage.setItem('cosmic_user_id', id); window.location.reload(); }}} 
                className="bg-indigo-600/10 hover:bg-indigo-600/20 px-6 py-3 rounded-2xl text-[10px] text-indigo-400 border border-indigo-500/20 uppercase font-black transition-all"
            >
                Restore Path
            </button>
        </div>
        <p className="mt-8 text-[9px] text-gray-600 font-bold uppercase tracking-widest">A convergence of Astrology, Numerology (9-5-1 Line), and Long-Term Projections</p>
      </footer>
    </div>
  );
};

export default App;