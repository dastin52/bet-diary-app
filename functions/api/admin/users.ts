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

// Helper function to handle paginated listing of KV keys
async function listAllKeys(kv: KVNamespace, prefix: string): Promise<{ name: string }[]> {
    let allKeys: { name: string }[] = [];
    let cursor: string | undefined = undefined;
    let listComplete = false;

    while (!listComplete) {
        const result = await kv.list({ prefix, cursor });
        allKeys = allKeys.concat(result.keys);
        listComplete = result.list_complete;
        if (!listComplete) {
            cursor = result.cursor;
        }
    }
    return allKeys;
}


export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
    try {
        if (!env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Storage service is not configured.' }), {
                status: 500, headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Fetch keys from both prefixes with pagination ---
        const tgchatKeys = await listAllKeys(env.BOT_STATE, 'tgchat:');
        const betdataKeys = await listAllKeys(env.BOT_STATE, 'betdata:');
        
        const allKeys = [...tgchatKeys, ...betdataKeys];
        // Remove duplicate keys that might exist if a user has both tgchat and betdata records
        const uniqueKeys = Array.from(new Set(allKeys.map(k => k.name))).map(name => ({name}));


        if (uniqueKeys.length === 0) {
            return new Response(JSON.stringify({ users: [] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const userPromises = uniqueKeys.map(async (key) => {
            const userData = await env.BOT_STATE.get(key.name, { type: 'json' });
            const state = normalizeState(userData);
            return state?.user || null;
        });

        const usersRaw = (await Promise.all(userPromises)).filter((u): u is User => u !== null);

        // --- De-duplicate users by email ---
        const userMap = new Map<string, User>();
        for (const user of usersRaw) {
            if (user.email && !userMap.has(user.email)) {
                userMap.set(user.email, user);
            } else if (user.email) {
                // If user exists, merge to get the most complete record (e.g., with telegram details)
                const existingUser = userMap.get(user.email)!;
                userMap.set(user.email, { ...existingUser, ...user });
            }
        }
        const uniqueUsers = Array.from(userMap.values());
        
        const usersWithSource = uniqueUsers.map(u => ({ ...u, source: 'telegram' as const }));

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
