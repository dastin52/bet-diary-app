// functions/data/userStore.ts
import { Env, User, UserState, BankTransactionType, Bet } from '../telegram/types';
import { normalizeState } from '../telegram/state';

const USER_INDEX_KEY = 'user_index'; // A key to store a set of all user emails

export async function findUserByEmail(email: string, env: Env): Promise<UserState | null> {
    if (!email) return null;
    const data = await env.BOT_STATE.get(`betdata:${email.toLowerCase()}`, { type: 'json' });
    return data ? normalizeState(data) : null;
}

export async function getUsers(env: Env): Promise<User[]> {
    const userIndex: string[] = await env.BOT_STATE.get(USER_INDEX_KEY, { type: 'json' }) || [];
    const userPromises = userIndex.map(async (email) => {
        const state = await findUserByEmail(email, env);
        return state?.user;
    });
    const users = await Promise.all(userPromises);
    return users.filter((u): u is User => !!u);
}

/**
 * Efficiently fetches all user states (user and bets) in a single parallel batch.
 * This prevents timeouts that occur when fetching user data one by one.
 */
export async function getAllUsersWithBets(env: Env): Promise<{ user: User, bets: Bet[] }[]> {
    const userIndex: string[] = await env.BOT_STATE.get(USER_INDEX_KEY, { type: 'json' }) || [];
    if (userIndex.length === 0) {
        return [];
    }

    const userStatePromises = userIndex.map(email => 
        env.BOT_STATE.get(`betdata:${email.toLowerCase()}`, { type: 'json' })
    );

    const allStatesRaw = await Promise.all(userStatePromises);

    return allStatesRaw
        .map(stateRaw => normalizeState(stateRaw)) // Sanitize each state
        .filter(state => state.user && Array.isArray(state.bets)) // Ensure user and bets exist
        .map(state => ({ user: state.user!, bets: state.bets }));
}


export async function addUser(newUser: User, env: Env): Promise<void> {
    const emailKey = `betdata:${newUser.email.toLowerCase()}`;
    
    const initialBankroll = 10000;
    const initialHistory = {
        id: new Date().toISOString() + Math.random(),
        timestamp: new Date().toISOString(),
        type: BankTransactionType.Deposit,
        amount: initialBankroll,
        previousBalance: 0,
        newBalance: initialBankroll,
        description: 'Начальный банк',
    };

    const userState: UserState = {
        user: newUser,
        bets: [],
        bankroll: initialBankroll,
        goals: [],
        bankHistory: [initialHistory],
        dialog: null,
    };
    
    await env.BOT_STATE.put(emailKey, JSON.stringify(userState));

    const userIndex: string[] = await env.BOT_STATE.get(USER_INDEX_KEY, { type: 'json' }) || [];
    const lowercasedEmail = newUser.email.toLowerCase();
    if (!userIndex.includes(lowercasedEmail)) {
        userIndex.push(lowercasedEmail);
        await env.BOT_STATE.put(USER_INDEX_KEY, JSON.stringify(userIndex));
    }
}