// src/telegram/state.ts
// FIX: File content implemented. This file handles getting and setting user state in the KV store.

import { Env, UserState, User, Bet, Goal, BankTransaction } from './types';

/**
 * This function is crucial for data integrity. It ensures that whatever we load from KV,
 * we always return a valid UserState object, preventing crashes from corrupted or old data formats.
 * @param data The raw data retrieved from the KV store.
 * @returns A safe, normalized UserState object.
 */
export function normalizeState(data: any): UserState {
    const defaultUser: User | null = null;
    const defaultBets: Bet[] = [];
    const defaultGoals: Goal[] = [];
    const defaultHistory: BankTransaction[] = [];

    if (!data || typeof data !== 'object') {
        return { user: defaultUser, bets: defaultBets, bankroll: 10000, goals: defaultGoals, bankHistory: defaultHistory, dialog: null };
    }

    // Safely access and type-check each property, providing a default if it's missing or wrong.
    return {
        user: data.user && typeof data.user === 'object' ? data.user as User : defaultUser,
        bets: Array.isArray(data.bets) ? data.bets : defaultBets,
        bankroll: typeof data.bankroll === 'number' && !isNaN(data.bankroll) ? data.bankroll : 10000,
        goals: Array.isArray(data.goals) ? data.goals : defaultGoals,
        bankHistory: Array.isArray(data.bankHistory) ? data.bankHistory : defaultHistory,
        dialog: data.dialog && typeof data.dialog === 'object' ? data.dialog : null,
    };
}

/**
 * Retrieves the state for a given chat ID from the KV store.
 * @param chatId The user's Telegram chat ID.
 * @param env The Cloudflare environment object.
 * @returns A promise that resolves to the user's state.
 */
export async function getUserState(chatId: number, env: Env): Promise<UserState> {
    const key = `tgchat:${chatId}`;
    try {
        const data = await env.BOT_STATE.get(key, { type: 'json' });
        // Always normalize the data retrieved from KV.
        return normalizeState(data);
    } catch (e) {
        console.error(`Failed to parse state for chat ${chatId}, returning default. Error:`, e);
        // If JSON parsing fails, it's safer to start with a clean, default state
        // to prevent the bot from getting stuck on corrupted data.
        return normalizeState(null);
    }
}

/**
 * Saves the user's state to the KV store.
 * @param chatId The user's Telegram chat ID.
 * @param state The user state object to save.
 * @param env The Cloudflare environment object.
 */
export async function setUserState(chatId: number, state: UserState, env: Env): Promise<void> {
    const key = `tgchat:${chatId}`;
    await env.BOT_STATE.put(key, JSON.stringify(state));
}
