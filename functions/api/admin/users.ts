// functions/api/admin/users.ts

// This file is a new API endpoint to securely fetch all user data from the KV store.
// In a real application, this endpoint MUST be protected and only accessible by administrators.

import { User, UserState, KVNamespace } from '../../telegram/types';

// In-memory cache for the admin user list to reduce expensive 'list' operations
let adminUsersCache: { users: User[]; timestamp: number } | null = null;
const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000; // Cache for 5 minutes

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

const normalizeUser = (data: any): User | null => {
    if (!data || typeof data !== 'object') {
        return null;
    }
    // Check for user object at the top level (from UserState)
    const user = data.user || null;
    if (user && user.email && user.nickname) {
        return user;
    }
    return null;
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
    // Check cache first
    if (adminUsersCache && (Date.now() - adminUsersCache.timestamp < ADMIN_CACHE_TTL_MS)) {
        return new Response(JSON.stringify({ users: adminUsersCache.users }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
    }

    try {
        if (!env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Storage service is not configured.' }), {
                status: 500, headers: { 'Content-Type': 'application/json' },
            });
        }

        // --- Fetch keys from all known user prefixes ---
        const prefixes = ['tgstate:', 'betdata:'];
        const allKeysPromises = prefixes.map(prefix => listAllKeys(env.BOT_STATE, prefix));
        const allKeysNested = await Promise.all(allKeysPromises);
        const allKeys = allKeysNested.flat();
        
        // Remove duplicate keys
        const uniqueKeys = Array.from(new Set(allKeys.map(k => k.name))).map(name => ({name}));

        if (uniqueKeys.length === 0) {
            return new Response(JSON.stringify({ users: [] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const userPromises = uniqueKeys.map(async (key) => {
            const userData = await env.BOT_STATE.get(key.name, { type: 'json' });
            let user = normalizeUser(userData);

            if (user) {
                // If a full user object is found, use it
                return user;
            } 
            return null;
        });

        const usersRaw = (await Promise.all(userPromises)).filter((u): u is User => u !== null);

        // --- De-duplicate and merge users by email to create the most complete record ---
        const userMap = new Map<string, User>();
        for (const user of usersRaw) {
            const existingUser = userMap.get(user.email);
            if (!existingUser) {
                userMap.set(user.email, { ...user });
            } else {
                // Merge, prioritizing records that are more complete (e.g., have a real nickname)
                const isExistingMoreComplete = existingUser.nickname !== existingUser.email.split('@')[0] && existingUser.registeredAt !== new Date(0).toISOString();
                const isCurrentUserMoreComplete = user.nickname !== user.email.split('@')[0] && user.registeredAt !== new Date(0).toISOString();
                
                if (!isExistingMoreComplete && isCurrentUserMoreComplete) {
                     // Current user is better, so it becomes the base
                    userMap.set(user.email, { ...existingUser, ...user });
                } else {
                    // Existing user is better or they are equal, so it's the base
                    userMap.set(user.email, { ...user, ...existingUser });
                }
            }
        }
        
        const uniqueUsers = Array.from(userMap.values());
        
        // Cache the result before returning
        adminUsersCache = { users: uniqueUsers, timestamp: Date.now() };

        return new Response(JSON.stringify({ users: uniqueUsers }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        });

    } catch (error) {
        console.error('Error fetching admin users:', error);
        return new Response(JSON.stringify({ error: 'An error occurred while fetching users.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};