// functions/api/admin/activity.ts
import { Env, ApiActivityLog } from '../../telegram/types';

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        if (!env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Storage service is not configured.' }), {
                status: 500, headers: { 'Content-Type': 'application/json' },
            });
        }
        const logsJson = await env.BOT_STATE.get('api_activity_log');
        const logs = logsJson ? JSON.parse(logsJson) : [];
        
        return new Response(JSON.stringify(logs), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error fetching API activity:', error);
        return new Response(JSON.stringify({ error: 'An error occurred while fetching activity logs.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};