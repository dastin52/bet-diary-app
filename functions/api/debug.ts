import { Env } from '../telegram/types';

export const onRequestGet = async ({ env }: { env: Env }) => {
    const debugInfo = {
        timestamp: new Date().toISOString(),
        env: {
            hasBotToken: !!env.TELEGRAM_BOT_TOKEN,
            hasGeminiKey: !!env.GEMINI_API_KEY,
            hasKv: !!env.BOT_STATE,
            nodeEnv: process.env.NODE_ENV || 'unknown',
            webappUrl: env.WEBAPP_URL || 'not_set'
        },
        headers: {
            // Полезно для отладки CORS и защиты TG
        }
    };

    return new Response(JSON.stringify(debugInfo), {
        status: 200,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
    });
};