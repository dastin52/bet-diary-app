// functions/telegram/state.ts
import { UserState, Env, Goal, BankTransactionType } from './types';
import { addUserEmailToList } from '../data/userStore';

const getStateKey = (chatId: number) => `tgstate:${chatId}`;
const getUserKey = (email: string) => `betdata:${email}`;

const defaultState: UserState = {
    user: null,
    bets: [],
    bankroll: 10000,
    goals: [],
    bankHistory: [],
    dialog: null,
};

// Ensures that state loaded from KV has all required fields.
export function normalizeState(data: any): UserState {
    if (!data || typeof data !== 'object') {
        return { ...defaultState };
    }
    return {
        user: data.user || null,
        bets: Array.isArray(data.bets) ? data.bets : [],
        bankroll: typeof data.bankroll === 'number' ? data.bankroll : 10000,
        goals: Array.isArray(data.goals) ? data.goals : [],
        bankHistory: Array.isArray(data.bankHistory) ? data.bankHistory : [],
        dialog: data.dialog || null,
    };
}

export async function getUserState(chatId: number, env: Env): Promise<UserState> {
    const stateJson = await env.BOT_STATE.get(getStateKey(chatId), { type: 'json' });
    return normalizeState(stateJson);
}

export async function setUserState(chatId: number, state: UserState, env: Env): Promise<void> {
    await env.BOT_STATE.put(getStateKey(chatId), JSON.stringify(state));
}

// This function is crucial for syncing data between the web app and the bot.
// When a user authenticates, their web data is copied to the bot's state.
// When the bot updates the state, it also updates the shared user record.
export async function updateAndSyncState(chatId: number, newState: UserState, env: Env): Promise<void> {
    // 1. Save the state for the current chat ID (the bot's primary state)
    await setUserState(chatId, newState, env);

    // 2. If a user is logged in, also update the shared record keyed by their email.
    // This allows the web app (and other bot sessions) to see the changes.
    if (newState.user && newState.user.email) {
        // We only store bet-related data in the shared user record.
        const sharedUserData = {
            user: newState.user,
            bets: newState.bets,
            bankroll: newState.bankroll,
            goals: newState.goals,
            bankHistory: newState.bankHistory,
            // We do NOT store the `dialog` state in the shared record.
        };
        await env.BOT_STATE.put(getUserKey(newState.user.email), JSON.stringify(sharedUserData));
        await addUserEmailToList(newState.user.email, env);
    }
}

export function deleteGoalFromState(state: UserState, goalId: string): UserState {
    return {
        ...state,
        goals: state.goals.filter(g => g.id !== goalId),
    };
}