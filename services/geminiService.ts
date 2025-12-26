
// services/geminiService.ts

import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { BirthDetails, ReadingOptions, AdvancedReadingOptions, LifeEvent, SpouseDetails, ApiResponse, Visuals, ChatMessage } from "../types.ts";

// Helper to build the astrology prompt for both static readings and chat sessions.
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
    ? `You are an Omni-Esoteric Master with "Cosmic Vision". You have been granted access to the user's facial features and palm prints. You must provide readings that synthesize visual evidence with planetary data. Respond to user queries with deep spiritual insight.`
    : `Generate a holistic esoteric reading. You have visual artifacts (face/palms) and a detailed life timeline. Perform a deep-dive analysis. Current date: ${dateString}.`;

  if (outputLanguage === 'Gujarati') {
    prompt += ` Respond ONLY in Gujarati. Use heavy spiritual and technical terms from Vedic Jyotish and Samudrika Shastra.`;
  }

  prompt += `\n\nIdentity: ${birthDetails.name} (Born: ${birthDetails.dob}, ${birthDetails.tob}, ${birthDetails.pob})`;
  
  if (exSpouseDetails?.name) {
    prompt += `\nKarmic Link: ${exSpouseDetails.name} (Separation/Divorce events included in timeline).`;
  }

  prompt += `\n\nVision Data Status:`;
  if (visuals?.face) prompt += `\n- FACE IMAGE: PROVIDED. Analyze the 12 Palaces, the forehead (wisdom), and the eyes (spirit).`;
  if (visuals?.leftHand || visuals?.rightHand) prompt += `\n- PALM IMAGES: PROVIDED. Analyze the Fate Line, Heart Line, and Mount of Saturn. Look for the "Girdle of Venus" or "Mystic Cross".`;

  if (lifeEvents.length > 0) {
    prompt += `\n\nChronological Anchors (Timeline):`;
    lifeEvents.forEach(e => prompt += `\n- ${e.description} (${e.date})`);
  }

  prompt += `\n\nYour Task:
1. Cross-reference the timeline with visual signs in the palm/face and planetary dashas.
2. Provide a "Vision Insight" section specifically detailing what you see in the images.
3. Offer Lal Kitab remedies based on the "Blind Planets" identified from their birth chart and facial features.
4. Forecast the 2025-2027 period based on current planetary transitions.`;

  return prompt;
}

// Helper to convert base64 data URI to the part structure required by Gemini API.
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

// Using gemini-3-flash-preview as the default latest flash model.
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
        temperature: 0.75, 
        topP: 0.95,
        tools: enableGoogleSearch ? [{ googleSearch: {} }] : undefined
      },
    });
    return { 
      reading: response.text || "Cosmic silence.", 
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
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  if (visuals && (visuals.face || visuals.leftHand || visuals.rightHand)) {
    const visionParts: any[] = [{ text: "Context: These are my visual artifacts (face/palms) for your synthesis." }];
    if (visuals.face) visionParts.push(getPartFromImage(visuals.face));
    if (visuals.leftHand) visionParts.push(getPartFromImage(visuals.leftHand));
    if (visuals.rightHand) visionParts.push(getPartFromImage(visuals.rightHand));
    
    geminiHistory.unshift(
      { role: 'user', parts: visionParts },
      { role: 'model', parts: [{ text: "I have received and integrated your visual artifacts. I am ready to provide your synthesis based on these physical signs and your astrological data." }] }
    );
  }

  return ai.chats.create({
    model: LATEST_FLASH_MODEL,
    history: geminiHistory,
    config: {
      systemInstruction,
      temperature: 0.85,
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
