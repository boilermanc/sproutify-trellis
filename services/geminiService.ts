
import { GoogleGenAI } from "@google/genai";
import { Profile } from "../types";

/**
 * Generates personalized marketing email intro using Gemini 3 Flash.
 * Adheres to the initialization and response extraction guidelines.
 */
export const generateEmailCopy = async (profile: Profile) => {
  const prompt = `
    Generate a short, friendly 2-sentence marketing intro for an email.
    The customer is named ${profile.first_name}.
    They are interested in: ${profile.tags.join(', ')}.
    They are part of these segments: ${profile.segments.join(', ')}.
    The company is 'Sproutify', which has a garden store, a smart gardening app, and local events.
  `;

  try {
    // Fix: Initialize GoogleGenAI inside the function as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.8,
      },
    });

    // Fix: Access response.text property directly (not as a method)
    return response.text?.trim() || "Welcome back to Sproutify!";
  } catch (error) {
    console.error("Gemini Copy Gen Error:", error);
    return "Grow your world with Sproutify.";
  }
};
