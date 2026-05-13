
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, Visuals, ChatMessage } from "../types";

/**
 * Builds a "Grand Unified" prompt combining Vedic Jyotish, Lal Kitab, Numerology, Palmistry, Face Reading, 
 * and Modern Science/Psychology.
 */
function buildAstrologyPrompt(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  exSpouseDetails?: SpouseDetails,
  visuals?: Visuals,
  isChatContext: boolean = false,
  realAstrologyData?: any
): string {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // 1. Identity & Role Definition
  let prompt = isChatContext 
    ? `You are the "Maha-Rishi AI" (The Grand Unified Oracle). You do NOT rely on a single method. You synthesize ALL occult sciences: Vedic Jyotish, Lal Kitab, Western Astrology, Lo Shu Numerology, Palmistry, Face Reading, and Modern Psychology. You have no limits on time—project into 2030, 2040, and 2050.`
    : `Generate a Grand Unified Cosmic Analysis (Complete Synthesis of Science & Spirit). Date: ${dateString}.`;

  // 2. Language & Tone
  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use high-level Vedic vocabulary mixed with modern scientific terms.`;
  } else {
    prompt += ` Respond in English. Use a tone of "Supreme Authority" — mystical, direct, and scientifically grounded.`;
  }

  // 3. Subject Data
  prompt += `\n\n=== SUBJECT DATA ===
- Name: ${birthDetails.name}
- Birth: ${birthDetails.dob} at ${birthDetails.tob} in ${birthDetails.pob}
- Rashi: ${birthDetails.rashi || 'Calculate based on DOB'}
${exSpouseDetails ? `- Ex-Spouse: ${exSpouseDetails.name} (${exSpouseDetails.dob})` : ''}

${realAstrologyData ? `=== PRECISE ASTRONOMICAL DATA (GROUND TRUTH) ===
Use these exact planetary positions, degrees, and signs instead of calculating them yourself. This is real-time ephemeris data from AstrologyAPI:
${JSON.stringify(realAstrologyData, null, 2)}
` : ''}
=== VISUAL DATA INPUTS ===
${visuals?.face ? '- FACE IMAGE PROVIDED: Analyze physiognomy (forehead, eyes, jaw) to determine elemental balance (Fire/Water/Air/Earth) and confirm chart strength.' : '- No Face Image.'}
${visuals?.palm ? '- PALM IMAGE PROVIDED: Analyze lines (Life, Head, Heart, Fate) to validate planetary transits.' : '- No Palm Image.'}

=== LIFE TIMELINE (KARMIC FAL) ===
Analyze the cause-and-effect (Karma) of these specific events using planetary transits (Dasha/Gochar):
${lifeEvents.map(e => `- ${e.date}: ${e.description} [Assigned Node: ${e.planet || 'Auto-Detect'}]`).join('\n')}

=== MANDATORY ANALYSIS MODULES ===
You must use ALL of the following technologies and sciences to generate the answer:

1. **Vedic Jyotish (The Core)**:
   - Calculate Lagna (Ascendant) & Rashi.
   - Check for **Pitru Dosha** (Ancestral Debt) & Kaal Sarp Dosha.
   - Analyze Mahadasha/Antardasha for the current period.

2. **Lal Kitab (The Red Book)**:
   - Identify "Rina" (Karmic Debts).
   - Provide specific, practical "Upaya" (Remedies) for immediate relief.

3. **Advanced Numerology (The Matrix)**:
   - Do NOT limit to 9-5-1. Analyze the FULL Lo Shu Grid.
   - Discuss Missing Numbers and their impact.
   - Correlate Driver/Conductor with the Birth Chart.

4. **Samudrika Shastra (Body Reading)**:
   - If images are provided, cross-reference the Face/Palm features with the Horoscope. (e.g., "Weak Saturn in chart confirmed by break in Fate line").

5. **Modern Context & Psychology**:
   - Analyze the subject's career in Logistics/Tech/Driving within the context of **Global Migration** (Germany).
   - Assess psychological resilience based on the "Willpower" and "Action" planes.

6. **Karmic Fal (Result of Deeds)**:
   - Explain WHY specific negative events (accidents, theft) happened based on past planetary alignments.
   - Explain WHY positive events (marriage, promotion) happened.

7. **Future Projection (2025-2050)**:
   - Provide a high-level roadmap based on the slow-moving giants: Saturn (Shani), Jupiter (Guru), and Rahu/Ketu.

=== RESPONSE STRUCTURE ===
1. **Cosmic Executive Summary**: The "Big Picture" synthesis of Chart + Numbers + Hands.
2. **Dosha & Debt Analysis**: Pitru Dosha, Rina, and Blockages.
3. **The Timeline Decode**: Why did the past happen? (Connecting dots between events).
4. **Future Trajectory**: 2025-2030 (Detailed), 2030-2050 (High Level).
5. **Grand Remedial Measures**: Combine Mantra, Gemstone, Charity, and Lal Kitab tricks.

Format: Markdown. Use bold headers. Be specific.`;

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
  apiKey: string,
  model: string = 'gemini-3.1-pro-preview',
  realAstrologyData?: any
): Promise<ApiResponse> {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");
  
  const ai = new GoogleGenAI({ apiKey });
  const textPrompt = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, false, realAstrologyData);

  const parts: any[] = [{ text: textPrompt }];
  if (visuals?.face) parts.push(getPartFromImage(visuals.face));
  if (visuals?.leftHand) parts.push(getPartFromImage(visuals.leftHand));
  if (visuals?.rightHand) parts.push(getPartFromImage(visuals.rightHand));
  if (visuals?.palm) parts.push(getPartFromImage(visuals.palm));

  try {
    const config: any = { 
      temperature: 0.7
    };
    if (enableGoogleSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: { parts },
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
  apiKey: string,
  model: string = 'gemini-3.1-pro-preview',
  realAstrologyData?: any
): Promise<Chat> {
  if (!apiKey) throw new Error("API Key is missing. Please check your settings.");

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, true, realAstrologyData);

  const geminiHistory: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const config: any = {
    systemInstruction,
    temperature: 0.8
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
