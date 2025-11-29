
import { Env } from '../../telegram/types';

interface EventContext<E> {
    request: Request;
    env: E;
}

export const onRequestPost = async ({ request, env }: EventContext<Env>) => {
    try {
        const body = await request.json();
        const logsKey = 'twa_debug_logs';
        
        let logs: any[] = [];
        try {
            logs = await env.BOT_STATE.get(logsKey, { type: 'json' }) || [];
        } catch {}

        // Add new log to the beginning
        logs.unshift(body);
        
        // Keep last 50 logs
        logs = logs.slice(0, 50);

        await env.BOT_STATE.put(logsKey, JSON.stringify(logs));

        return new Response('Logged', { status: 200 });
    } catch (e) {
        return new Response('Error logging', { status: 500 });
    }
};

export const onRequestGet = async ({ env }: EventContext<Env>) => {
    const logsKey = 'twa_debug_logs';
    const logs = await env.BOT_STATE.get(logsKey, { type: 'json' }) || [];
    return new Response(JSON.stringify(logs), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
