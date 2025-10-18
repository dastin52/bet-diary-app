// functions/data/userStore.ts
import { Env, User, UserState, BankTransactionType } from '../telegram/types';
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
