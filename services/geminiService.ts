
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
    They are active on: ${profile.branches.join(', ')}.
    Their lifetime value is $${profile.ltv.toFixed(2)}.
    Their engagement level: ${profile.churn_risk === 'minimal' ? 'highly engaged' : profile.churn_risk === 'moderate' ? 'moderately engaged' : 'at risk of churning'}.
    The company is 'Sproutify', which has a garden store (atlurbanfarms.com), a smart gardening app (farm.sproutify.app), educational programs (school.sproutify.app), and community events (letsrejoice.app).
    Tailor the message based on which sites they're active on.
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
