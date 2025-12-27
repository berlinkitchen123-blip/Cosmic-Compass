import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, Visuals, ChatMessage } from "../types";

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
    ? `You are the "Universal Siddhanta Oracle", a master of synthesizing Western Astrology, Vedic Jyotish, Chaldean Numerology, and daily Rashifal transitions. You have access to physical Samudrika Shastra artifacts (face/palm images). Respond with deep spiritual resonance and practical clarity.`
    : `Generate a Comprehensive Cosmic Synthesis Report. Current Date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use sophisticated terminology from the Vedas and Puranas.`;
  } else {
    prompt += ` Respond in English.`;
  }

  prompt += `\n\nSUBJECT DATA:
- Name: ${birthDetails.name}
- Birth: ${birthDetails.dob} at ${birthDetails.tob} in ${birthDetails.pob}
- Current Rashi: ${birthDetails.rashi || 'Calculate based on TOB/DOB'}
${exSpouseDetails?.name ? `- Former Karmic Partner: ${exSpouseDetails.name} (Born ${exSpouseDetails.dob})` : ''}

SPECIAL ATTRIBUTES:
- User observes a "9, 5, 1" numerology system (Willpower Line). Compare this to the high-achievement charts of leaders like Narendra Modi or Mukesh Ambani. Analyze the dominance of Mars (9), Mercury (5), and Sun (1).

PHYSICAL ARTIFACTS:
${visuals?.face ? "- Face Analysis: Present. Focus on the 12 Houses of the Face and spiritual aura." : "- Face: Not provided."}
${visuals?.leftHand ? "- Left Palm: Present. Analyze the Mount of Moon and Heart Line." : "- Left Palm: Not provided."}
${visuals?.rightHand ? "- Right Palm: Present. Analyze the Life Line and Fate Line." : "- Right Palm: Not provided."}

LIFE TIMELINE (Karmic Anchors):
${lifeEvents.map(e => `- ${e.date}: ${e.description}`).join('\n')}

REQUIRED STRUCTURE:
1. **VEDIC JYOTISH & LONG-TERM DASHAS**: Analyze current Mahadasha. Project significant shifts into 2030, 2035, and 2040. Do not limit to near-term.
2. **THE 9-5-1 WILLPOWER LINE**: Deeply analyze the numerological impact of the 9-5-1 combination. How does this drive authority, communication, and resilience?
3. **ASTROLOGY (Western & Planetary)**: Synthesis of outer planetary transits (Pluto, Neptune, Uranus) over the next 15 years.
4. **RASHIFAL & REMEDIES**: Strategic remedies for long-term obstacles identified in the dashas.

Tone: Authoritative, mystical, and visionary. Format: Use Markdown.`;

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

const LATEST_FLASH_MODEL = 'gemini-3-flash-preview';

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
      model: LATEST_FLASH_MODEL,
      contents: { parts },
      config: { 
        temperature: 0.7, 
        topP: 0.95,
        tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
      },
    });
    return { 
      reading: response.text || "The cosmic silence is absolute. Try again.", 
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

  if (visuals && (visuals.face || visuals.leftHand || visuals.rightHand)) {
    const visionParts: any[] = [{ text: "Context: These are my physical signs for your Samudrika analysis." }];
    if (visuals.face) visionParts.push(getPartFromImage(visuals.face));
    if (visuals.leftHand) visionParts.push(getPartFromImage(visuals.leftHand));
    if (visuals.rightHand) visionParts.push(getPartFromImage(visuals.rightHand));
    
    geminiHistory.unshift(
      { role: 'user', parts: visionParts },
      { role: 'model', parts: [{ text: "I have observed your physical manifestations. My vision is now aligned with your path." }] }
    );
  }

  return ai.chats.create({
    model: LATEST_FLASH_MODEL,
    history: geminiHistory,
    config: {
      systemInstruction,
      temperature: 0.8,
      tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
    },
  });
}

export async function* sendChatMessage(chatSession: Chat, message: string): AsyncGenerator<string, void, unknown> {
  const responseStream = await chatSession.sendMessageStream({ message });
  for await (const chunk of responseStream) {
    const c = chunk as GenerateContentResponse;
    if (c.text) yield c.text;
  }
}