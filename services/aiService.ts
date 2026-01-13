
import { GoogleGenAI } from "@google/genai";
import { Profile, ChatMessage, LlmProvider, Ticket } from "../types";

/**
 * Strips PII (Credit Cards, SSNs, Tokens) from raw transcripts before storage.
 */
export const sanitizePII = (text: string): string => {
  // Regex for common CC formats (Luhn-like patterns)
  const ccRegex = /\b(?:\d{4}[ -]?){3}(?=\d{4}\b)\d{4}\b/g;
  // Regex for potential SSNs or sensitive ID patterns
  const idRegex = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g;
  // Regex for high-entropy tokens or long keys
  const tokenRegex = /\b[A-Za-z0-9_-]{32,}\b/g;

  return text
    .replace(ccRegex, '[REDACTED_CC]')
    .replace(idRegex, '[REDACTED_ID]')
    .replace(tokenRegex, '[REDACTED_TOKEN]');
};

/**
 * Orchestrates a strategic conversation with Sage using Gemini 3 Pro.
 * Optimized for production with thinking budgets and error resilience.
 */
export const chatWithSage = async (
  history: ChatMessage[], 
  message: string, 
  provider: LlmProvider = 'gemini', 
  context?: { tickets: Ticket[], brandName: string, profilesCount?: number }
) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const supportContext = context?.tickets.length 
      ? `Ecosystem Load: ${context.tickets.length} open tickets. Profiles: ${context?.profilesCount || 'Unknown'}.`
      : "";

    const systemInstruction = `You are Sage, the Strategic Intelligence for Sproutify Trellis. 
    You manage 5 spokes: atlurbanfarms.com, micro.sproutify.app, farm.sproutify.app, school.sproutify.app, and letsrejoice.app.
    Always provide advice that links site behaviors for cross-selling. 
    Tone: Sophisticated, data-driven, yet earthy. 
    ${supportContext}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: message,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 2000 } 
      }
    });

    return response.text?.trim() || "The orchestration engine is calibrating cross-site data. Please retry.";
  } catch (error) {
    console.error("Sage Strategic Engine Offline:", error);
    return `The ${provider} synchronization loop is interrupted. Please check your vault credentials.`;
  }
};

/**
 * Generates personalized marketing email intro with fallback safety.
 */
export const generateEmailCopy = async (profile: Profile, brandName: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Craft a 2-sentence marketing intro for ${profile.first_name} at ${brandName}. 
    Active on: ${profile.source_sites.join(', ')}. Interests: ${profile.tags.join(', ')}. 
    Highlight cross-spoke benefits.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 } 
      },
    });

    return response.text?.trim() || `Welcome back to the unified ${brandName} ecosystem, ${profile.first_name}!`;
  } catch (error) {
    return `Discover new ways to grow with ${brandName}.`;
  }
};
