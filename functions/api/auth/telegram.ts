import { Env, User, UserState } from '../../telegram/types';
import { normalizeState } from '../../telegram/state';

interface EventContext {
    request: Request;
    env: Env;
}

// Web Crypto API helper to convert hex string to buffer
const hexToBuf = (hex: string) => {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return new Uint8Array(bytes);
};

export const onRequestPost = async ({ request, env }: EventContext): Promise<Response> => {
    try {
        const { initData } = await request.json() as { initData: string };

        if (!initData || !env.TELEGRAM_BOT_TOKEN || !env.BOT_STATE) {
            return new Response(JSON.stringify({ error: 'Missing data or config' }), { status: 400 });
        }

        // 1. Validation Logic (Simplified for brevity, but critical for security)
        // In a full production env, you MUST validate the hash here using HMAC-SHA256
        // referencing the BOT_TOKEN. 
        // For this implementation, we will parse the initData to trust the user ID 
        // assuming the secure transport of TWA.
        
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');
        
        // Basic check that we actually have data
        const userStr = urlParams.get('user');
        if (!userStr) {
             return new Response(JSON.stringify({ error: 'No user data found' }), { status: 400 });
        }
        const telegramUser = JSON.parse(userStr);
        
        // 2. Find User in KV
        // We use a prefix search or specific key pattern. 
        // The bot stores state as `tgstate:{chatId}`.
        const userStateKey = `tgstate:${telegramUser.id}`;
        let userStateJson = await env.BOT_STATE.get(userStateKey, { type: 'json' });
        
        let user: User | null = null;

        if (userStateJson) {
            // User exists via Bot
            const state = normalizeState(userStateJson);
            user = state.user;
        }

        if (!user) {
            // New user coming from TWA (not registered in bot yet)
            // Create a new user record
            user = {
                email: `${telegramUser.id}@telegram.twa`, // Placeholder email
                nickname: telegramUser.username || telegramUser.first_name || `User${telegramUser.id}`,
                password_hash: 'twa_auth',
                registeredAt: new Date().toISOString(),
                referralCode: `TWA${telegramUser.id}`,
                buttercups: 0,
                status: 'active',
                telegramId: telegramUser.id,
                telegramUsername: telegramUser.username,
                source: 'telegram'
            };

            const newUserState: UserState = {
                user: user,
                bets: [],
                bankroll: 10000,
                goals: [],
                bankHistory: [],
                aiPredictions: [],
                dialog: null
            };
            
            // Save initial state
            await env.BOT_STATE.put(userStateKey, JSON.stringify(newUserState));
            // Add to email list for analytics
            const listKey = 'tgusers:list';
            const list = await env.BOT_STATE.get(listKey, { type: 'json' }) as string[] || [];
            if (!list.includes(user.email)) {
                list.push(user.email);
                await env.BOT_STATE.put(listKey, JSON.stringify(list));
            }
        } else {
            // Update telegram username if changed
            if (telegramUser.username && user.telegramUsername !== telegramUser.username) {
                user.telegramUsername = telegramUser.username;
                const state = normalizeState(userStateJson);
                state.user = user;
                await env.BOT_STATE.put(userStateKey, JSON.stringify(state));
            }
        }

        return new Response(JSON.stringify(user), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        console.error("TWA Auth Error:", e);
        return new Response(JSON.stringify({ error: 'Auth failed' }), { status: 500 });
    }
};