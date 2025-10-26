// functions/api/health.ts
import { Env } from '../telegram/types';

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    const healthStatus = {
        status: "ok",
        timestamp: new Date().toISOString(),
        apiKeys: {
            gemini: env.GEMINI_API_KEY ? 'CONFIGURED' : 'MISSING',
            sportsApi: env.SPORT_API_KEY ? 'CONFIGURED' : 'MISSING',
        },
        kvBinding: env.BOT_STATE ? 'BOUND' : 'MISSING',
    };

    return new Response(JSON.stringify(healthStatus), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
