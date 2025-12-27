
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, Visuals, ChatMessage } from "../types";

/**
 * Builds a highly specific prompt for Navagraha (9 Planets) and 9-5-1 Willpower Axis analysis.
 */
function buildAstrologyPrompt(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  exSpouseDetails?: SpouseDetails,
  visuals?: Visuals,
  isChatContext: boolean = false
): string {
  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = isChatContext 
    ? `You are the "Siddhanta Oracle". You analyze the 9 Planets (Navagraha) and the 9-5-1 Willpower Axis (Mars-Mercury-Sun) as found in charts of leaders like Narendra Modi. You have no limits on time—project into 2030, 2040, and 2050.`
    : `Generate a Full Navagraha Synthesis & Willpower Analysis. Date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use high-level Vedic vocabulary.`;
  } else {
    prompt += ` Respond in English. Use a mystical yet professional tone.`;
  }

  prompt += `\n\nCORE SUBJECT:
- Name: ${birthDetails.name}
- Birth: ${birthDetails.dob} at ${birthDetails.tob} in ${birthDetails.pob}
- Rashi: ${birthDetails.rashi || 'Calculate'}

THE 9-5-1 WILLPOWER LINE (NUMEROLOGY):
- This subject has a 9-5-1 structure. 9 (Mars - Action), 5 (Mercury - Intellect), 1 (Sun - Soul/Power). This is the "Willpower Line" of top achievers. Analyze the resilience and manifestation power of this axis.

NAVAGRAHA MAPPING (9 PLANETS):
Analyze the interaction of these 9 Graha nodes from the subject's timeline:
${lifeEvents.map(e => `- ${e.planet || 'Unspecified Graha'} Node (${e.date}): ${e.description}`).join('\n')}

TEMPORAL PROJECTION:
- Do not restrict analysis to the current year. Provide a roadmap for 2030, 2040, and 2050 based on Shani (Saturn) and Guru (Jupiter) transits.

REQUIREMENTS:
1. **Navagraha Synthesis**: Deep dive into all 9 planets.
2. **Willpower Analysis**: Specific section on the 9-5-1 combination.
3. **Decadal Roadmap**: Future peaks in 2030, 2040, 2050.
4. **Remedies**: For afflicted grahas among the 9.

Format: Markdown. Tone: Visionary.`;

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

// Upgrade to gemini-3-pro-preview for complex reasoning tasks like Navagraha synthesis
const LATEST_PRO_MODEL = 'gemini-3-pro-preview';

export async function getCombinedReading(
  birthDetails: BirthDetails,
  options: ReadingOptions,
  advancedOptions: AdvancedReadingOptions,
  lifeEvents: LifeEvent[],
  outputLanguage: string,
  exSpouseDetails?: SpouseDetails,
  enableGoogleSearch: boolean = false,
  visuals?: Visuals
): Promise<ApiResponse> {
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  const textPrompt = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, false);

  const parts: any[] = [{ text: textPrompt }];
  if (visuals?.face) parts.push(getPartFromImage(visuals.face));
  if (visuals?.leftHand) parts.push(getPartFromImage(visuals.leftHand));
  if (visuals?.rightHand) parts.push(getPartFromImage(visuals.rightHand));

  try {
    const response = await ai.models.generateContent({
      model: LATEST_PRO_MODEL,
      contents: { parts },
      config: { 
        temperature: 0.7, 
        tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
      },
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
  exSpouseDetails?: SpouseDetails,
  enableGoogleSearch: boolean = false,
  visuals?: Visuals
): Promise<Chat> {
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  const systemInstruction = buildAstrologyPrompt(birthDetails, options, advancedOptions, lifeEvents, outputLanguage, exSpouseDetails, visuals, true);

  const geminiHistory: any[] = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  return ai.chats.create({
    model: LATEST_PRO_MODEL,
    history: geminiHistory,
    config: {
      systemInstruction,
      temperature: 0.8,
      tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
    },
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
