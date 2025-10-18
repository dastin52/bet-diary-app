// functions/telegram/state.ts
import { Env, UserState, User, Bet, Goal, BankTransaction, BankTransactionType, BetStatus, GoalStatus } from './types';
import { calculateProfit, generateEventString } from '../utils/betUtils';

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
        const data = await env.BOT_STATE.get(key, { type: 'json' });
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

/**
 * Saves the user's state to both the session (tgchat:) and master (betdata:) stores.
 * This ensures data consistency across sessions. The dialog state is omitted from the master record.
 * @param chatId The user's Telegram chat ID.
 * @param state The complete user state object to save.
 * @param env The Cloudflare environment object.
 */
export async function updateAndSyncState(chatId: number, state: UserState, env: Env): Promise<void> {
    // 1. Save the session state (including the dialog)
    await setUserState(chatId, state, env);

    // 2. If the user is logged in, also sync the master record
    if (state.user?.email) {
        const key = `betdata:${state.user.email}`;
        // We save the state *without* the temporary dialog property to the master record.
        const { dialog, ...masterState } = state;
        await env.BOT_STATE.put(key, JSON.stringify(masterState));
    }
}


export function addBetToState(state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState {
    const newBet: Bet = {
        ...betData,
        id: new Date().toISOString() + Math.random(),
        createdAt: new Date().toISOString(),
        event: generateEventString(betData.legs, betData.betType, betData.sport),
    };
    
    const newState = { ...state };
    let newBankroll = state.bankroll;
    
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
        if(newBet.profit !== 0) {
            const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
            const newBalance = newBankroll + newBet.profit;
            const newTransaction = {
                id: new Date().toISOString() + Math.random(),
                timestamp: new Date().toISOString(),
                type,
                amount: newBet.profit,
                previousBalance: newBankroll,
                newBalance,
                description: `Ставка рассчитана: ${newBet.event}`,
                betId: newBet.id,
            };
            newState.bankHistory = [newTransaction, ...newState.bankHistory];
            newBankroll = newBalance;
        }
    }
    
    newState.bets = [newBet, ...state.bets].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    newState.bankroll = newBankroll;
    
    return newState;
}

export function addGoalToState(state: UserState, goalData: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'>): UserState {
    const newGoal: Goal = {
        ...goalData,
        id: new Date().toISOString() + Math.random(),
        createdAt: new Date().toISOString(),
        currentValue: 0,
        status: GoalStatus.InProgress,
        scope: goalData.scope || { type: 'all' }
    };
    const newState = { ...state };
    newState.goals = [newGoal, ...state.goals];
    return newState;
}

export function deleteGoalFromState(state: UserState, goalId: string): UserState {
    const newState = { ...state };
    newState.goals = newState.goals.filter(g => g.id !== goalId);
    return newState;
}