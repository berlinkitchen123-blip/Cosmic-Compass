import { BirthDetails } from '../types';
import { GoogleGenAI } from '@google/genai';

// Helper to get geo coordinates using Gemini (since we need lat/lon/tzone for AstrologyAPI)
async function getGeoDetails(pob: string, date: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Provide the latitude, longitude, and timezone offset (in hours) for the location: "${pob}" on the date "${date}". 
  Respond ONLY with a valid JSON object in this exact format: {"lat": 22.3072, "lon": 73.1812, "tzone": 5.5}`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
    });

    const text = response.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
  } catch (e) {
    console.error("Failed to parse geo details", e);
    return { lat: 28.6139, lon: 77.2090, tzone: 5.5 }; // Default to New Delhi
  }
}

export async function fetchPlanetaryData(birthDetails: BirthDetails, geminiApiKey: string) {
  try {
    const [year, month, day] = birthDetails.dob.split('-').map(Number);
    const [hour, min] = birthDetails.tob.split(':').map(Number);
    
    const geo = await getGeoDetails(birthDetails.pob, birthDetails.dob, geminiApiKey);

    const payload = {
      day, month, year, hour, min,
      lat: geo.lat,
      lon: geo.lon,
      tzone: geo.tzone
    };

    const response = await fetch('/api/astrology', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'planets/extended', data: payload })
    });

    if (!response.ok) {
      const err = await response.json();
      console.warn('AstrologyAPI fetch failed, falling back to AI calculation:', err);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("AstrologyAPI Error:", error);
    return null;
  }
}
