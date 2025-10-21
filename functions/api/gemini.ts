// functions/api/gemini.ts

import { GoogleGenAI } from "@google/genai";

// This defines the expected structure of the incoming request from the frontend
interface ApiProxyRequest {
    endpoint: string;
    payload: any;
}

// Define the environment variables and bindings expected by this function
interface Env {
    GEMINI_API_KEY: string;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


// This is the main function handler for Cloudflare Pages
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const body = await request.json() as ApiProxyRequest;
        const { endpoint, payload } = body;

        // Ensure the API key is available from Cloudflare's environment variables
        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'API Key for Gemini is not configured on the server.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        
        let responseData;
        
        // Handle different endpoints the frontend might call
        switch (endpoint) {
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