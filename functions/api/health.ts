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
    const lastTriggered = await env.BOT_STATE.get('last_run_triggered_timestamp') || null;
    const lastRun = await env.BOT_STATE.get('last_successful_run_timestamp') || null;
    const lastError = await env.BOT_STATE.get('last_run_error', { type: 'json' }) || null;
    const healthStatus = {
        status: "ok",
        timestamp: new Date().toISOString(),
        apiKeys: {
            gemini: env.GEMINI_API_KEY ? 'CONFIGURED' : 'MISSING',
            sportsApi: env.SPORT_API_KEY ? 'CONFIGURED' : 'MISSING',
        },
        kvBinding: env.BOT_STATE ? 'BOUND' : 'MISSING',
        lastTriggered,
        lastSuccessfulUpdate: lastRun,
        lastUpdateError: lastError,
    };

    return new Response(JSON.stringify(healthStatus), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
