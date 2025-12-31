import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import {
  User, Milestone, Sparkles, Globe,
  MessageSquare, History, Zap, Compass, RefreshCw,
  Sun, Moon, Star, Send, Trash2, ArrowLeft,
  Camera, Eye, Layout, Info, MapPin, Clock, Share2, BookOpen, Settings, X, Key, Search, Cpu
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore
import { getDatabase, ref, set, get } from 'firebase/database';

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------

export interface BirthDetails {
  name: string;
  dob: string; // YYYY-MM-DD
  tob: string; // HH:MM
  pob: string; // Place of Birth (city, country)
  rashi?: string;
}

export interface ReadingOptions {
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

export interface AdvancedReadingOptions {
  culturalContext: string;
  includeScientificPerspective: boolean;
}

export interface LifeEvent {
  description: string;
  date: string; // YYYY-MM-DD
  planet?: string; // Associated Graha (Sun, Moon, Mars, etc.)
}

export interface SpouseDetails {
  name: string;
  dob: string;
}

export interface Visuals {
  face?: string;      // Base64 data URI
  leftHand?: string;  // Base64 data URI
  rightHand?: string; // Base64 data URI
  palm?: string;      // For Palmistry
}

export interface ApiResponse {
  reading: string;
  groundingSources?: any[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------

const MASTER_STORAGE_KEY = 'cosmic_compass_master_v3';
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// --- LOSHU GRID LOGIC ---
const getLoshuGrid = (dob: string) => {
  if (!dob) return [];
  const digits = dob.replace(/[^0-9]/g, '').split('').map(Number);
  // Loshu Grid positions: 4 9 2 / 3 5 7 / 8 1 6
  return Array.from(new Set(digits.filter(d => d > 0)));
};

const saveStateToLocalStorage = <T,>(key: string, state: T): boolean => {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem(key, serializedState);
    return true;
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.warn("LocalStorage quota exceeded. Attempting to save without large visual data...");
      if (typeof state === 'object' && state !== null && 'visuals' in state) {
        try {
          // @ts-ignore
          const fallbackState = { ...state, visuals: {} };
          localStorage.setItem(key, JSON.stringify(fallbackState));
          return true;
        } catch (innerError: any) {
          console.error("Critical storage failure:", innerError);
        }
      }
    }
    console.error("Error saving state to localStorage:", error);
    return false;
  }
};

const loadStateFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const serializedState = localStorage.getItem(key);
    if (serializedState === null) {
      return defaultValue;
    }
    return JSON.parse(serializedState) as T;
  } catch (error) {
    console.error("Error loading state from localStorage:", error);
    return defaultValue;
  }
};

// Safe way to check for environment variable without crashing if 'process' is undefined
const getSafeEnvApiKey = (): string => {
  try {
    // @ts-ignore
    const env = import.meta.env || {};
    if (env.VITE_GEMINI_API_KEY) return env.VITE_GEMINI_API_KEY;
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;

    // @ts-ignore
    if (typeof process !== 'undefined' && process?.env) {
      // @ts-ignore
      return process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    }
  } catch (e) {
    // Ignore ReferenceError
  }
  return '';
};

// -----------------------------------------------------------------------------
// FIREBASE SERVICE
// -----------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyD36DpN2xIGnGhIAXOGTNNjX5ic0XKAc0M",
  authDomain: "cosmic-compass-c381e.firebaseapp.com",
  projectId: "cosmic-compass-c381e",
  storageBucket: "cosmic-compass-c381e.firebasestorage.app",
  messagingSenderId: "128465536584",
  appId: "1:128465536584:web:ff7d978f8abf43dff67a7d"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);

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
    await set(userRef, {
      ...data,
      lastUpdated: new Date().toISOString()
    });
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
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error("Firebase Load Error:", error);
    return null;
  }
};

// -----------------------------------------------------------------------------
// GEMINI SERVICE
// -----------------------------------------------------------------------------

function buildAstrologyPrompt(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  exSpouseDetails?: SpouseDetails,
  visuals?: Visuals,
  frontierParams?: any,
  isChatContext: boolean = false
): string {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const activeNums = getLoshuGrid(birthDetails.dob);

  let prompt = isChatContext
    ? `You are the "Unified Reality Oracle". You synthesize ancient Navagraha (9 Planets) wisdom with modern Frontier Science (Astrophysics, Quantum Mechanics, and Epigenetics).`
    : `Generate a Unified Frontier Synthesis. Hybridizing Navagraha Mythology with NASA JPL Orbital Mechanics. Date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati using advanced technical and Vedic vocabulary.`;
  } else {
    prompt += ` Respond in English. Use a "Techno-Mystical" tone—integrating scientific terminology with spiritual insight.`;
  }

  prompt += `\n\nCORE SUBJECT DATASET:
- Name: ${birthDetails.name}
- Temporal Node: ${birthDetails.dob} @ ${birthDetails.tob}
- Geolocation: ${birthDetails.pob}
- Frontier Bio-Parameters: ${frontierParams ? JSON.stringify(frontierParams) : 'Default (Standard Human)'}
- Rashi/Luna-Lunar Node: ${birthDetails.rashi || 'Auto-Calculate'}

SCIENTIFIC & TECHNICAL OVERLAYS:
1. **Orbital Mechanics (NASA JPL Reference)**: Correlate the positions of the 9 Grahas with actual astronomical coordinates. Analyze the gravitational tidal forces at the moment of the temporal node.
2. **Neutrino Flux Analysis**: Analyze how solar and cosmic neutrino streams interacted with the biological system during gestation and at the moment of birth.
3. **Geomagnetic Resonance**: Cross-reference the birth location (${birthDetails.pob}) with Earth's Magnetic Field (Schumann Resonance) and the K-index (Geomagnetic Storm activity) for that period.
4. **Epigenetic Signaling**: Analyze how the environmental conditions of the birth location influenced the initial epigenetic methylation patterns of the subject.
5. **Quantum Wavefunction**: Treat the subject's life events as a collapsed wavefunction from a field of infinite probability.

NUMEROLOGY (LOSHU GRID - 3x3 MATRIX):
- Active Vibrations: ${activeNums.join(', ')}
${activeNums.includes(9) && activeNums.includes(5) && activeNums.includes(1)
      ? "- 9-5-1 WILLPOWER VECTOR: Extreme manifestation potential detected. This is a high-energy kinetic axis."
      : "- Analyze available digits as sub-quantum resonance points in the subject's energetic field."}

NAVAGRAHA TEMPORAL MAPPING:
Analyze these 9 planetary nodes as significant perturbations in the subject's timeline:
${lifeEvents.map(e => `- ${e.planet || 'Unknown Graha'} Perturbation (${e.date}): ${e.description}`).join('\n')}

OUTPUT REQUIREMENTS:
- **Technical Synthesis**: Use terms like "Synaptic Plasticity", "Stellar Nucleosynthesis", "Quantum Entanglement", and "Karmic Feedback Loops".
- **Decadal Projection**: Roadmap for 2030, 2040, and 2050 based on Shani (Saturn) and Guru (Jupiter) orbital cycles.
- **Grounding**: If Google Search is enabled, find actual space weather data or NASA news for the subject's current phase.

Format: Advanced Markdown with technical headers. Tone: Visionary, Precise, and Scientific.`;

  return prompt;
}

function getPartFromImage(dataUri: string) {
  const [header, data] = dataUri.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  return {
    inlineData: {
      mimeType,
      data
    }
  };
}

async function getCombinedReading(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  exSpouseDetails: SpouseDetails | undefined,
  enableGoogleSearch: boolean = false,
  visuals: Visuals | undefined,
  frontierParams: any,
  apiKey: string,
  model: string = 'gemini-3-flash-preview'
): Promise<ApiResponse> {
  if (!apiKey) throw new Error("API Key is missing. Please add it in Settings.");

  const ai = new GoogleGenAI({ apiKey });
  const textPrompt = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, frontierParams, false);

  const parts: any[] = [{ text: textPrompt }];
  if (visuals?.face) parts.push(getPartFromImage(visuals.face));
  if (visuals?.palm) parts.push(getPartFromImage(visuals.palm));

  try {
    const config: any = { temperature: 0.7 };
    if (enableGoogleSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts }],
      config: config,
    });
    return {
      reading: response.text || "Cosmic signal lost.",
      groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

async function initializeChatSession(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  history: ChatMessage[] = [],
  exSpouseDetails: SpouseDetails | undefined,
  enableGoogleSearch: boolean = false,
  visuals: Visuals | undefined,
  frontierParams: any,
  apiKey: string,
  model: string = 'gemini-3-flash-preview'
): Promise<Chat> {
  if (!apiKey) throw new Error("API Key is missing. Please add it in Settings.");

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, frontierParams, true);

  const geminiHistory: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const config: any = {
    systemInstruction,
    temperature: 0.8,
  };

  if (enableGoogleSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  return ai.chats.create({
    model: model,
    history: geminiHistory,
    config: config,
  });
}

async function* sendChatMessage(chatSession: Chat, message: string): AsyncGenerator<string, void, unknown> {
  const responseStream = await chatSession.sendMessageStream({ message });
  for await (const chunk of responseStream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) yield c.text;
  }
}

// -----------------------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------------------

interface InputFieldProps {
  label: string;
  id: string;
  type: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  min?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  id,
  type,
  value,
  onChange,
  placeholder,
  required = false,
  min,
}) => {
  return (
    <div className="mb-1">
      <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5 px-1">
        {label} {required && <span className="text-blue-400">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
      />
    </div>
  );
};

interface CheckboxFieldProps {
  label: string;
  id: string;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({ label, id, checked, onChange }) => {
  return (
    <label className="flex items-center p-2.5 rounded-xl border border-white/5 hover:bg-white/5 transition-all cursor-pointer">
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={id}
          name={id}
          checked={checked}
          onChange={onChange}
          className="peer appearance-none h-4 w-4 bg-black/20 border border-white/20 rounded focus:ring-0 focus:ring-offset-0 transition-all"
        />
        <svg
          className="absolute w-4 h-4 text-blue-500 hidden peer-checked:block pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className={`ml-3 text-xs transition-all ${checked ? 'text-white font-semibold' : 'text-gray-400'}`}>
        {label}
      </span>
    </label>
  );
};

interface ChatInterfaceProps {
  chatHistory: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading: boolean;
  error: string | null;
  onBackToForm: () => void;
  onClearChat: () => void;
  suggestedQuestions: string[];
  isSyncing?: boolean;
  isFirebaseSynced?: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  chatHistory,
  onSendMessage,
  loading,
  error,
  onBackToForm,
  onClearChat,
  suggestedQuestions,
  isSyncing,
  isFirebaseSynced,
}) => {
  const [currentInput, setCurrentInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [chatHistory]);

  const handleSend = () => {
    if (currentInput.trim()) {
      onSendMessage(currentInput);
      setCurrentInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[75vh] md:h-[80vh] glass rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-300">
      <div className="px-6 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg">
            <span className="text-xl">✨</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Cosmic Oracle Chat</h2>
            <div className="flex items-center text-[10px] font-black uppercase tracking-tighter">
              {isSyncing ? (
                <span className="text-blue-400 animate-pulse flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5"></span>
                  Saving to Cloud...
                </span>
              ) : isFirebaseSynced ? (
                <div className="flex items-center text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5"></span>
                  Synced to Akashic Record
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-500 mr-1.5"></span>
                  Modified
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onClearChat}
            className="px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            Clear History
          </button>
          <button
            onClick={onBackToForm}
            className="px-4 py-1.5 text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg transition-all border border-indigo-500/20"
          >
            ← View Chart
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {chatHistory.length <= 1 && suggestedQuestions.length > 0 && (
            <div className="p-4 bg-white/5 border-b border-white/5 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-2 px-1">Deep Inquiries</p>
              <div className="flex space-x-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => onSendMessage(q)}
                    className="px-4 py-2 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-full text-indigo-200 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/10">
            {chatHistory.length === 0 && !loading && (
              <div className="h-full flex flex-col items-center justify-center opacity-20 text-center space-y-4">
                <span className="text-6xl">🔮</span>
                <p className="font-serif italic text-lg">Speak your truth to the Oracle.</p>
              </div>
            )}
            {chatHistory.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                <div
                  className={`max-w-[85%] px-5 py-4 rounded-2xl shadow-lg border ${msg.role === 'user'
                    ? 'bg-indigo-600/30 border-indigo-500/40 text-indigo-50'
                    : 'bg-white/5 border-white/10 text-gray-200'
                    }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.text || (loading && index === chatHistory.length - 1 ? '...' : '')}</p>
                </div>
              </div>
            ))}
            {loading && chatHistory.length > 0 && chatHistory[chatHistory.length - 1].text === '' && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 px-5 py-3 rounded-2xl flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                  <span className="text-[10px] text-indigo-300/70 font-black uppercase">Channeling...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="mx-auto max-w-sm text-center p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white/5 border-t border-white/10">
            <div className="relative flex items-center">
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your destiny, 9-5-1 potential, or 2030 projections..."
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || !currentInput.trim()}
                className="absolute right-2 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition-all disabled:opacity-50 active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] text-gray-600 uppercase font-bold tracking-widest">Akashic Cloud Sync Enabled</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// MAIN APP COMPONENT
// -----------------------------------------------------------------------------

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
  frontierParams?: {
    bloodType: string;
    circadianRhythm: string;
    environmentType: string;
    biologicalAge: string;
  };
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
  exSpouseDetails: { name: 'Pankti Patel', dob: '1998-10-17' },
  enableGoogleSearch: true,
  frontierParams: {
    bloodType: 'A+',
    circadianRhythm: 'Morning Lark',
    environmentType: 'Urban',
    biologicalAge: '30'
  },
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

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('cosmic_selected_model') || 'gemini-3-flash-preview');

  // SAFE API KEY HANDLING for Static Hosts
  const [apiKey, setApiKey] = useState(() => {
    const stored = localStorage.getItem('cosmic_api_key');
    if (stored) return stored;
    return getSafeEnvApiKey();
  });

  const [appState, setAppState] = useState<AppState>(() => {
    return loadStateFromLocalStorage(MASTER_STORAGE_KEY, DEFAULT_STATE);
  });

  const { birthDetails, readingOptions, advancedReadingOptions, lifeEvents, outputLanguage, exSpouseDetails, enableGoogleSearch, frontierParams, chatHistory, visuals, specialNotes } = appState;

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
    setCurrentChatSession(undefined); // Reset chat to use new config
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
          frontierParams,
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
    setChatError(null);

    // Update local state first using functional update to ensure we have the latest state
    setAppState(prev => ({
      ...prev,
      chatHistory: [...prev.chatHistory, newUserMsg, { role: 'model' as const, text: '' }]
    }));

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (type: 'face' | 'palm') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newVisuals = { ...visuals, [type]: reader.result as string };
        updateAppState({ visuals: newVisuals });
      };
      reader.readAsDataURL(file);
    }
  };

  const activeDigits = getLoshuGrid(birthDetails.dob);

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
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Key size={12} /> Gemini API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key here"
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 mb-1"
                />
                <p className="text-[9px] text-gray-500">Required for deployment. Your key is stored locally in your browser.</p>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2"><Cpu size={12} /> Intelligence Model</label>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Faster, Standard)</option>
                  <option value="gemini-3-pro-preview">Gemini 3 Pro (Higher Reasoning)</option>
                </select>
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

            <section className="glass rounded-[2rem] p-8 glow-border shadow-2xl">
              <h2 className="font-serif text-2xl text-white mb-8 flex items-center space-x-3">
                <span className="text-cyan-400">🧬</span>
                <span>Bio-Frontier Parameters</span>
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Blood Type" id="bloodType" type="text" value={frontierParams?.bloodType || ''} onChange={e => updateAppState({ frontierParams: { ...frontierParams, bloodType: e.target.value } })} placeholder="e.g. A+" />
                  <InputField label="Bio-Age" id="bioAge" type="number" value={frontierParams?.biologicalAge || ''} onChange={e => updateAppState({ frontierParams: { ...frontierParams, biologicalAge: e.target.value } })} />
                </div>
                <div className="mb-1">
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-black mb-1.5 px-1">Circadian Mode</label>
                  <select value={frontierParams?.circadianRhythm || 'Balanced'} onChange={e => updateAppState({ frontierParams: { ...frontierParams, circadianRhythm: e.target.value } })} className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white outline-none focus:border-cyan-500/50 transition-all">
                    <option value="Morning Lark">Morning Lark</option>
                    <option value="Night Owl">Night Owl</option>
                    <option value="Balanced">Balanced</option>
                  </select>
                </div>
                <div className="mb-1">
                  <label className="block text-[10px] uppercase tracking-widest text-gray-400 font-black mb-1.5 px-1">Environment Signal</label>
                  <select value={frontierParams?.environmentType || 'Urban'} onChange={e => updateAppState({ frontierParams: { ...frontierParams, environmentType: e.target.value } })} className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white outline-none focus:border-cyan-500/50 transition-all">
                    <option value="Urban">Urban</option>
                    <option value="Rural">Rural</option>
                    <option value="Coastal">Coastal</option>
                    <option value="High Altitude">High Altitude</option>
                  </select>
                </div>
              </div>
            </section>
            <section className="glass rounded-[2rem] p-8 glow-border">
              <h2 className="font-serif text-2xl text-white mb-6 flex items-center space-x-3">
                <span className="text-amber-400">⧉</span>
                <span>Loshu Grid Analysis</span>
              </h2>
              <div className="grid grid-cols-3 gap-2 aspect-square max-w-[180px] mx-auto mb-6 p-2 bg-black/40 rounded-2xl border border-white/10">
                {[4, 9, 2, 3, 5, 7, 8, 1, 6].map((num) => {
                  const isActive = activeDigits.includes(num);
                  return (
                    <div key={num} className={`flex items-center justify-center text-sm font-black rounded-lg transition-all ${isActive ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)] border-indigo-400 border' : 'bg-white/5 text-gray-800'}`}>
                      {num}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
                {activeDigits.includes(9) && activeDigits.includes(5) && activeDigits.includes(1) ? "Willpower Plane: ACTIVE" : "Numerological Resonance"}
              </p>
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
                    <textarea value={event.description} onChange={(e) => handleUpdateEvent(i, 'description', e.target.value)} className="bg-transparent text-gray-200 text-xs w-full resize-none outline-none mb-2" rows={2} placeholder="Karmic event..." />
                    <input type="date" value={event.date} onChange={(e) => handleUpdateEvent(i, 'date', e.target.value)} className="bg-black/20 text-[9px] text-indigo-400 font-bold uppercase py-1 px-2 rounded-lg border border-white/5 outline-none max-w-fit" />
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
          suggestedQuestions={["Explain my Loshu Grid potential?", "My career roadmap 2030-2050?", "How do the 9 planets affect me in Germany?"]}
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

// -----------------------------------------------------------------------------
// RENDER
// -----------------------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);