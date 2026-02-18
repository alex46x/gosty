import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini Client
// In a real production app, this check would happen on the backend.
// We are doing it here to demonstrate the "Ethical Safeguards" phase using AI.
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key missing. AI features disabled.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * analyzes text for toxicity/abuse before allowing a post.
 * This aligns with Phase 8: Abuse Prevention & Ethics.
 */
export const analyzeContentSafety = async (text: string): Promise<{ safe: boolean; reason?: string; score: number }> => {
  const ai = getClient();
  if (!ai) return { safe: true, score: 0 }; // Fail open if no API key for MVP demo

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze the following social media post for harmful content (hate speech, doxxing, severe threats, explicit violence). 
      
      Post: "${text}"
      
      Return a JSON object with:
      - safe: boolean
      - reason: string (short explanation if unsafe)
      - score: number (0 to 100, where 100 is extremely toxic)
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            score: { type: Type.NUMBER },
          },
          required: ["safe", "score"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      safe: result.safe ?? true,
      reason: result.reason,
      score: result.score ?? 0
    };

  } catch (error) {
    console.error("AI Moderation failed:", error);
    // In production, you might block posts if moderation fails, 
    // or flag them for manual review. For MVP, we allow.
    return { safe: true, score: 0 };
  }
};