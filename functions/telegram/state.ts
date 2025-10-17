// functions/telegram/state.ts
import { Env, UserState, User, Bet, Goal, BankTransaction } from './types';

export function normalizeState(data: any): UserState {
    const defaultUser: User | null = null;
    const defaultBets: Bet[] = [];
    const defaultGoals: Goal[] = [];
    const defaultHistory: BankTransaction[] = [];

    if (!data || typeof data !== 'object') {
        return { user: defaultUser, bets: defaultBets, bankroll: 10000, goals: defaultGoals, bankHistory: defaultHistory, dialog: null };
    }

    return {
        user: data.user && typeof data.user === 'object' ? data.user as User : defaultUser,
        bets: Array.isArray(data.bets) ? data.bets : defaultBets,
        bankroll: typeof data.bankroll === 'number' && !isNaN(data.bankroll) ? data.bankroll : 10000,
        goals: Array.isArray(data.goals) ? data.goals : defaultGoals,
        bankHistory: Array.isArray(data.bankHistory) ? data.bankHistory : defaultHistory,
        dialog: data.dialog && typeof data.dialog === 'object' ? data.dialog : null,
    };
}

export async function getUserState(chatId: number, env: Env): Promise<UserState> {
    const key = `tgchat:${chatId}`;
    try {
        const data = await env.BOT_STATE.get<UserState>(key, 'json');
        return normalizeState(data);
    } catch (e) {
        console.error(`Failed to parse state for chat ${chatId}, returning default. Error:`, e);
        return normalizeState(null);
    }
}

export async function setUserState(chatId: number, state: UserState, env: Env): Promise<void> {
    const key = `tgchat:${chatId}`;
    await env.BOT_STATE.put(key, JSON.stringify(state));
}
