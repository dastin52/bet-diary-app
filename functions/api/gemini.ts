
import { GoogleGenAI, Type } from "@google/genai";

interface Env {
  GEMINI_API_KEY: string;
}

// Cloudflare Pages Function
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { endpoint, payload } = await context.request.json();
    const apiKey = context.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key is not configured on the server.' }), { status: 500 });
    }
    
    const ai = new GoogleGenAI({ apiKey });

    let responseData;

    switch (endpoint) {
      case 'generateContent':
        const genContentResponse = await ai.models.generateContent(payload);
        responseData = {
          text: genContentResponse.text,
          sources: genContentResponse.candidates?.[0]?.groundingMetadata?.groundingChunks
        };
        break;
      
      case 'findMatches':
         const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
         const today = new Date().toLocaleDateString('ru-RU', dateOptions);

         const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Найди 5-7 интересных предстоящих спортивных матчей на сегодня (${today}) или завтра. Включи популярные виды спорта, такие как футбол, теннис, баскетбол, хоккей, ММА. Укажи 1-2 "горячих" матча, которые вызывают наибольший интерес.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        events: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    sport: { type: Type.STRING },
                                    eventName: { type: Type.STRING },
                                    teams: { type: Type.STRING },
                                    date: { type: Type.STRING },
                                    time: { type: Type.STRING },
                                    isHotMatch: { type: Type.BOOLEAN },
                                }
                            }
                        }
                    }
                }
            },
        });
        
        // Trim and parse the JSON string from the model's response text.
        const jsonStr = response.text.trim();
        responseData = JSON.parse(jsonStr);
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }), { status: 400 });
    }

    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in Cloudflare function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred on the server.';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
};
