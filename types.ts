

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
}

export interface SpouseDetails {
  name: string;
  dob: string; 
}

export interface Visuals {
  face?: string;      // Base64 data URI
  leftHand?: string;  // Base64 data URI
  rightHand?: string; // Base64 data URI
}

export interface ApiResponse {
  reading: string;
  // Loosened type to any[] to accommodate the GroundingChunk structure from the Gemini API
  groundingSources?: any[];
}

export interface GeminiError {
  message: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}