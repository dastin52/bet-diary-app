// functions/api/admin/users.ts

// This file is a new API endpoint to securely fetch all user data from the KV store.
// In a real application, this endpoint MUST be protected and only accessible by administrators.

import { User, UserState, KVNamespace } from '../../telegram/types';

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
    // We only need the user object for this function, so a minimal normalization is fine.
    return {
        user: data.user || null,
        // The rest can be defaulted as they are not used here.
        bets: [],
        bankroll: 0,
        goals: [],
        bankHistory: [],
        dialog: null,
    };
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        if (!env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Storage service is not configured.' }), {
                status: 500, headers: { 'Content-Type': 'application/json' },
            });
        }

        // List all keys with the prefix for individual bot user states
        const list = await env.BOT_STATE.list({ prefix: 'tgchat:' });
        const userStateKeys = list.keys;
        
        if (userStateKeys.length === 0) {
            return new Response(JSON.stringify({ users: [] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const userPromises = userStateKeys.map(async (key) => {
            const userData = await env.BOT_STATE.get(key.name, { type: 'json' });
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