// functions/api/admin/users.ts

// This file is a new API endpoint to securely fetch all user data from the KV store.
// In a real application, this endpoint MUST be protected and only accessible by administrators.

import { User, UserState } from '../../telegram/types';

interface KVNamespace {
    get(key: string, options?: { type?: 'json' }): Promise<any | null>;
}

interface Env {
    BOT_STATE: KVNamespace;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;

const normalizeState = (data: any): UserState | null => {
    if (!data || typeof data !== 'object') {
        return null;
    }
    return {
        user: data.user || null,
        bets: Array.isArray(data.bets) ? data.bets : [],
        bankroll: typeof data.bankroll === 'number' ? data.bankroll : 10000,
        goals: Array.isArray(data.goals) ? data.goals : [],
        bankHistory: Array.isArray(data.bankHistory) ? data.bankHistory : [],
        dialog: data.dialog || null,
    };
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        if (!env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Storage service is not configured.' }), {
                status: 500, headers: { 'Content-Type': 'application/json' },
            });
        }

        const userEmails: string[] = await env.BOT_STATE.get('tgusers:list', { type: 'json' }) || [];
        
        if (userEmails.length === 0) {
            return new Response(JSON.stringify({ users: [] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const userPromises = userEmails.map(async (email) => {
            const userData = await env.BOT_STATE.get(`betdata:${email}`, { type: 'json' });
            const state = normalizeState(userData);
            return state?.user || null;
        });

        const users = (await Promise.all(userPromises)).filter((u): u is User => u !== null);

        // Add source for clarity
        const usersWithSource = users.map(u => ({ ...u, source: 'telegram' as const }));

        return new Response(JSON.stringify({ users: usersWithSource }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error fetching admin users:', error);
        return new Response(JSON.stringify({ error: 'An error occurred while fetching users.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
