import { GoogleGenAI } from "@google/genai";

// This defines the expected structure of the incoming request from the frontend
interface ApiProxyRequest {
    endpoint: string;
    payload: any;
}

// This is the main function handler for Cloudflare Pages
// The env object contains environment variables set in the Cloudflare dashboard.
// FIX: Replaced 'PagesFunction' with an explicit type for the context object, as the 'PagesFunction' type was not found.
export const onRequestPost = async ({ request, env }: { request: Request; env: { API_KEY: string } }) => {
    try {
        // FIX: The default Request.json() method is not generic. Cast the result to the expected type.
        const body = await request.json() as ApiProxyRequest;
        const { endpoint, payload } = body;

        // Ensure the API key is available from Cloudflare's environment variables
        if (!env.API_KEY) {
            return new Response(JSON.stringify({ error: 'API Key for Gemini is not configured on the server.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const ai = new GoogleGenAI({ apiKey: env.API_KEY });
        
        let responseData;
        
        // Handle different endpoints the frontend might call
        switch (endpoint) {
            case 'findMatches':
                 // This is a mock response. A real implementation would involve more complex logic.
                 const mockMatches = [
                    { sport: 'Футбол', eventName: 'Лига Чемпионов', teams: 'Реал Мадрид vs. Бавария', date: new Date().toISOString().split('T')[0], time: '22:00', isHotMatch: true },
                    { sport: 'Теннис', eventName: 'ATP Finals', teams: 'Синнер vs. Алькарас', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], time: '18:00', isHotMatch: false },
                 ];
                responseData = { events: mockMatches };
                break;
                
            case 'generateContent':
            default:
                const result = await ai.models.generateContent(payload);
                responseData = { 
                    text: result.text, 
                    sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks 
                };
                break;
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Cloudflare Function error:', error);
        return new Response(JSON.stringify({ error: 'An error occurred in the serverless function.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
