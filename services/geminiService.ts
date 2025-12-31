
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, Visuals, ChatMessage } from "../types";

/**
 * Loshu Grid Logic
 */
const getLoshuGrid = (dob: string) => {
  if (!dob) return [];
  const digits = dob.replace(/[^0-9]/g, '').split('').map(Number);
  return Array.from(new Set(digits.filter(d => d > 0)));
};

/**
 * Builds a highly specific prompt for Navagraha (9 Planets), Loshu Grid, and Advanced Scientific Synthesis.
 */
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

/**
 * Prepares image data for the Gemini API.
 */
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

export async function getCombinedReading(
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
  model: string = 'gemini-1.5-flash'
): Promise<ApiResponse> {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");

  const genAI = new GoogleGenAI(apiKey.trim());
  const modelInstance = genAI.getGenerativeModel({
    model: model,
    tools: enableGoogleSearch ? [{ googleSearch: {} }] : []
  });

  const textPrompt = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, frontierParams, false);

  const parts: any[] = [{ text: textPrompt }];
  if (visuals?.face) parts.push(getPartFromImage(visuals.face));
  if (visuals?.leftHand) parts.push(getPartFromImage(visuals.leftHand));
  if (visuals?.rightHand) parts.push(getPartFromImage(visuals.rightHand));
  if (visuals?.palm) parts.push(getPartFromImage(visuals.palm));

  try {
    const result = await modelInstance.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.7 },
    });

    const response = result.response;
    return {
      reading: response.text() || "Cosmic signal lost.",
      groundingSources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const errString = error.toString();
    if (errString.includes("403") || errString.includes("PERMISSION_DENIED")) {
      throw new Error("Access Denied (403): Your Gemini API Key is invalid or not enabled. Ensure you are using a key from aistudio.google.com, not your Firebase API key.");
    }
    throw error;
  }
}

export async function initializeChatSession(
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
  model: string = 'gemini-1.5-flash'
): Promise<Chat> {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");

  const genAI = new GoogleGenAI(apiKey.trim());
  const systemInstruction = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, frontierParams, true);

  const geminiHistory: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const modelInstance = genAI.getGenerativeModel({
    model: model,
    systemInstruction,
    tools: enableGoogleSearch ? [{ googleSearch: {} }] : []
  });

  return modelInstance.startChat({
    history: geminiHistory,
    generationConfig: { temperature: 0.8 },
  });
}

/**
 * Streams chat responses from the Oracle.
 */
export async function* sendChatMessage(chatSession: Chat, message: string): AsyncGenerator<string, void, unknown> {
  const responseStream = await chatSession.sendMessageStream({ message });
  for await (const chunk of responseStream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) yield c.text;
  }
}
