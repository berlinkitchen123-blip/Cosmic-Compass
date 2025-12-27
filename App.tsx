
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, ChatMessage, Visuals } from './types';
import { getCombinedReading, initializeChatSession, sendChatMessage } from './services/geminiService';
import InputField from './components/InputField';
import CheckboxField from './components/CheckboxField';
import ChatInterface from './components/ChatInterface';
import { saveStateToLocalStorage, loadStateFromLocalStorage } from './utils/storage';
import { getOrGenerateUserId, syncToFirebase, loadFromFirebase } from './services/firebaseService';
import { Chat } from '@google/genai';

const MASTER_STORAGE_KEY = 'cosmic_compass_master_v2';

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
  lifeEvents: PLANETS.map((p, i) => ({
    planet: p,
    date: new Date(1995 + i * 4, 0, 1).toISOString().split('T')[0],
    description: `Karmic alignment for ${p}`
  })),
  outputLanguage: 'Gujarati',
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: true,
  chatHistory: [],
  visuals: {},
  specialNotes: 'Active 9-5-1 Willpower Axis'
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
          <select value={outputLanguage} onChange={e => updateAppState({ outputLanguage: e.target.value })} className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-[10px] font-bold text-indigo-300 uppercase tracking-widest focus:ring-0 outline-none">
            <option value="English">English</option>
            <option value="Gujarati">Gujarati</option>
          </select>
        </div>
      </header>

      {!isChatMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Birth Data & Willpower Axis */}
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl">
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
              </div>
            </section>

            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-amber-400">⧉</span>
                <span>9-5-1 Willpower Axis</span>
              </h2>
              <div className="grid grid-cols-3 gap-2 aspect-square max-w-[200px] mx-auto mb-6 p-2 bg-black/40 rounded-2xl border border-white/10">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map((num) => {
                  const isActive = [9, 5, 1].includes(num);
                  return (
                    <div key={num} className={`flex items-center justify-center text-sm font-black rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border-indigo-400 border' : 'bg-white/5 text-gray-700'}`}>
                      {num}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">Vertical Willpower Line Analysis Active</p>
            </section>
            
            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-purple-400">❂</span>
                <span>Configuration</span>
              </h2>
              <div className="space-y-4">
                <CheckboxField label="Enable Akashic Search" id="search" checked={enableGoogleSearch} onChange={e => updateAppState({ enableGoogleSearch: e.target.checked })} />
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
                    <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest leading-relaxed">Synthesis mode: 9 Planets (Navagraha) + 9-5-1 Axis Analysis.</p>
                </div>
              </div>
            </section>
          </div>

          {/* Middle Column: The 9 Navagraha Nodes */}
          <div className="lg:col-span-4 space-y-6">
            <section className="glass rounded-[2rem] p-8 glow-border overflow-hidden flex flex-col min-h-[700px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-2xl text-white flex items-center space-x-3">
                  <span className="text-amber-400">⏳</span>
                  <span>Navagraha Timeline</span>
                </h2>
                <button 
                  onClick={handleAddEvent}
                  className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-all shadow-xl"
                >
                  <span className="text-xl">+</span>
                </button>
              </div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Each node maps to one of the 9 Grahas</p>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 flex-1">
                {lifeEvents.map((event, i) => (
                  <div key={i} className="glass-dark p-5 rounded-2xl border border-white/5 flex flex-col relative group transition-all hover:border-indigo-500/30">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600/50 group-hover:bg-indigo-400"></div>
                    <div className="flex justify-between items-center mb-3">
                      <select 
                        value={event.planet || ''} 
                        onChange={(e) => handleUpdateEvent(i, 'planet', e.target.value)}
                        className="bg-indigo-900/40 text-indigo-300 text-[10px] font-black uppercase px-3 py-1 rounded-full outline-none border border-indigo-500/20"
                      >
                        <option value="">Select Graha</option>
                        {PLANETS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <button onClick={() => handleRemoveEvent(i)} className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    <div className="flex space-x-3 items-center mb-2">
                        <input 
                            type="date" 
                            value={event.date}
                            onChange={(e) => handleUpdateEvent(i, 'date', e.target.value)}
                            className="bg-transparent text-gray-400 text-[10px] font-bold focus:outline-none"
                        />
                    </div>
                    <textarea 
                      value={event.description}
                      onChange={(e) => handleUpdateEvent(i, 'description', e.target.value)}
                      placeholder="Event description..."
                      className="bg-transparent text-gray-200 text-xs leading-relaxed w-full resize-none focus:outline-none placeholder-gray-600"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Output & Action */}
          <div className="lg:col-span-4 space-y-6 flex flex-col">
            <button 
                onClick={handleGenerateReading} 
                disabled={loading} 
                className="w-full relative py-10 rounded-[2.5rem] bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-2xl transition-all active:scale-95 overflow-hidden border border-white/20 group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              {loading ? (
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white mb-3"></div>
                    <span className="text-[10px] uppercase tracking-widest">Invoking Navagraha Synthesis...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                    <span className="text-xl uppercase tracking-widest mb-1">Synthesize Path</span>
                    <span className="text-[9px] text-indigo-200 font-bold tracking-[0.2em] uppercase opacity-60">Full 9-Planet & Willpower Analysis</span>
                </div>
              )}
            </button>

            {reading ? (
              <div className="glass rounded-[2rem] p-10 border border-white/10 flex-1 overflow-y-auto max-h-[750px] custom-scrollbar shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="prose prose-invert max-w-none">
                    <div className="text-gray-200 text-sm leading-relaxed space-y-6 whitespace-pre-wrap font-medium">
                        {reading}
                    </div>
                </div>
                {groundingSources.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4">Astral Anchors</p>
                    <div className="flex flex-wrap gap-2">
                      {groundingSources.map((chunk, idx) => {
                        const s = chunk.web || chunk.maps;
                        if (!s) return null;
                        return (
                          <a key={idx} href={s.uri} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[9px] text-indigo-300 font-bold hover:bg-white/10 transition-all">
                            {s.title || 'Source'}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : !loading && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 opacity-20 text-center grayscale">
                  <div className="text-6xl mb-6">⧉</div>
                  <p className="font-serif text-xl italic leading-relaxed">The 9 planetary forces and the 9-5-1 axis await your command.</p>
              </div>
            )}

            <button 
              onClick={() => setIsChatMode(true)} 
              className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest border border-white/5 transition-all"
            >
              Open Universal Oracle
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
          onClearChat={() => { if(window.confirm("Purge Oracle history?")) { updateAppState({ chatHistory: [] }); setCurrentChatSession(undefined); }}} 
          suggestedQuestions={[
            "Analyze my 9-5-1 willpower potential vs world leaders?",
            "Detailed dasha roadmap for 2030, 2040, and 2050?",
            "How do my 9 planets impact my life in Germany?",
            "Spiritual meaning of my 1995 Cancer Moon and 9-5-1 axis?"
          ]}
          isSyncing={isSyncing}
        />
      )}

      <footer className="mt-24 pt-12 border-t border-white/5 text-center flex flex-col items-center pb-12">
        <p className="text-[10px] text-indigo-400/60 font-black uppercase tracking-[0.4em] mb-4">Soul Resonance ID</p>
        <div className="flex items-center space-x-3">
            <code className="bg-black/60 px-8 py-3 rounded-2xl text-indigo-300 text-[11px] border border-white/10 font-mono select-all">{userId}</code>
            <button 
                onClick={() => { const id = prompt("Enter Soul ID:"); if(id) { localStorage.setItem('cosmic_user_id', id); window.location.reload(); }}} 
                className="bg-indigo-600/10 hover:bg-indigo-600/20 px-6 py-3 rounded-2xl text-[10px] text-indigo-400 border border-indigo-500/20 uppercase font-black transition-all"
            >
                Connect Path
            </button>
        </div>
        <p className="mt-8 text-[9px] text-gray-700 font-bold uppercase tracking-widest">A synthesis of Navagraha (9 Planets) and the 9-5-1 Willpower Axis</p>
      </footer>
    </div>
  );
};

export default App;
