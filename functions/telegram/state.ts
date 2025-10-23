// functions/telegram/state.ts
import { UserState, Env, Goal, BankTransactionType, User, AIPrediction } from './types';
import { addUserEmailToList, getAllUsersWithBets } from '../data/userStore';

const getStateKey = (chatId: number) => `tgstate:${chatId}`;
const getUserKey = (email: string) => `betdata:${email}`;

const defaultState: UserState = {
    user: null,
    bets: [],
    bankroll: 10000,
    goals: [],
    bankHistory: [],
    aiPredictions: [],
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
        aiPredictions: Array.isArray(data.aiPredictions) ? data.aiPredictions : [],
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
            aiPredictions: newState.aiPredictions,
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


// --- USER MANAGEMENT FUNCTIONS ---

export const mockHash = (password: string) => `hashed_${password}`;

export async function findUserByEmail(email: string, env: Env): Promise<UserState | null> {
    const key = getUserKey(email);
    const data = await env.BOT_STATE.get(key, { type: 'json' });
    if (!data) return null;
    return normalizeState(data);
}

export async function isNicknameTaken(nickname: string, env: Env): Promise<boolean> {
    const allUsers = await getAllUsersWithBets(env);
    return allUsers.some(u => u.user.nickname.toLowerCase() === nickname.toLowerCase());
}

export async function createUser(chatId: number, from: { username?: string }, email: string, nickname: string, password_hash: string, env: Env): Promise<UserState> {
    const newUser: User = {
        email,
        nickname,
        password_hash: mockHash(password_hash),
        registeredAt: new Date().toISOString(),
        referralCode: `${nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
        buttercups: 0,
        status: 'active',
        telegramId: chatId,
        telegramUsername: from.username,
        source: 'telegram',
    };

    const initialBankroll = 10000;
    const initialTransaction = {
        id: new Date().toISOString() + Math.random(),
        timestamp: new Date().toISOString(),
        type: BankTransactionType.Deposit as BankTransactionType,
        amount: initialBankroll,
        previousBalance: 0,
        newBalance: initialBankroll,
        description: 'Начальный банк',
    };

    const newUserState: UserState = {
        user: newUser,
        bets: [],
        bankroll: initialBankroll,
        goals: [],
        bankHistory: [initialTransaction],
        aiPredictions: [],
        dialog: null
    };
    
    await updateAndSyncState(chatId, newUserState, env);
    return newUserState;
}