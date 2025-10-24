// functions/api/gemini.ts
import { GoogleGenAI } from "@google/genai";
import { Env } from '../telegram/types';

interface ApiProxyRequest {
    endpoint: string;
    payload: any;
}

interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    try {
        const body = await request.json() as ApiProxyRequest;
        const { endpoint, payload } = body;

        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'API Key for Gemini is not configured on the server.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        let responseData;
        
        switch (endpoint) {
             case 'getAllPredictions': {
                const cacheKey = 'central_predictions:all';
                const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });

                // Return cached data if available, otherwise an empty array.
                // This prevents timeouts by not generating data on-demand.
                responseData = cachedData || [];
                break;
            }
            case 'getMatchesWithPredictions': {
                const { sport } = payload;
                 if (!sport) {
                    return new Response(JSON.stringify({ error: 'Sport parameter is required' }), {
                        status: 400, headers: { 'Content-Type': 'application/json' },
                    });
                }
                const cacheKey = `central_predictions:${sport}`;
                const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });

                // Return cached data or empty array if not found.
                responseData = cachedData || [];
                break;
            }
            case 'generateContent':
            default:
                const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
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
