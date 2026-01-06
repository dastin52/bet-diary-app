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
            const existing = await env.BOT_STATE.get(logsKey, { type: 'json' });
            logs = Array.isArray(existing) ? existing : [];
        } catch (e) {
            console.error("KV Read Error:", e);
        }

        // Добавляем новый лог в начало
        logs.unshift(body);
        
        // Ограничиваем историю 100 записями
        logs = logs.slice(0, 100);

        await env.BOT_STATE.put(logsKey, JSON.stringify(logs));

        return new Response(JSON.stringify({ status: 'ok' }), { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
};

export const onRequestGet = async ({ env }: EventContext<Env>) => {
    try {
        const logsKey = 'twa_debug_logs';
        const logs = await env.BOT_STATE.get(logsKey, { type: 'json' }) || [];
        return new Response(JSON.stringify(logs), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify([]), { status: 200 });
    }
};