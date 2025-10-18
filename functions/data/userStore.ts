// functions/data/userStore.ts
import { Env, User, UserState, BankTransactionType } from '../telegram/types';
import { normalizeState } from '../telegram/state';

const USER_INDEX_KEY = 'user_index'; // A key to store a set of all user emails

/**
 * Finds a user's full data payload by their email.
 * This is the primary method for retrieving user data.
 * @param email The user's email.
 * @param env The Cloudflare environment object.
 * @returns The full UserState or null if not found.
 */
export async function findUserByEmail(email: string, env: Env): Promise<UserState | null> {
    if (!email) return null;
    const data = await env.BOT_STATE.get(`betdata:${email.toLowerCase()}`, { type: 'json' });
    return data ? normalizeState(data) : null;
}

/**
 * Finds a user object by a predicate.
 * WARNING: This is inefficient as it fetches all users. Use only for checks like nickname uniqueness.
 * @param predicate A function to test each user.
 * @param env The Cloudflare environment object.
 * @returns A User object or undefined.
 */
export async function findUserBy(predicate: (user: User) => boolean, env: Env): Promise<User | undefined> {
    // This is a fallback and should be used sparingly.
    // In a real large-scale app, you'd want secondary indexes.
    console.warn("findUserBy is performing an inefficient full scan of users.");
    const userIndex: string[] = await env.BOT_STATE.get(USER_INDEX_KEY, { type: 'json' }) || [];
    for (const email of userIndex) {
        const state = await findUserByEmail(email, env);
        if (state && state.user && predicate(state.user)) {
            return state.user;
        }
    }
    return undefined;
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
 * Adds a new user to the system.
 * It saves both the user's main data and updates the email index.
 * @param newUser The new User object.
 * @param env The Cloudflare environment object.
 */
export async function addUser(newUser: User, env: Env): Promise<void> {
    const emailKey = `betdata:${newUser.email.toLowerCase()}`;
    
    // Create a default initial state for the new user.
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
    
    // Save the main user data payload
    await env.BOT_STATE.put(emailKey, JSON.stringify(userState));

    // Update the user index
    const userIndex: string[] = await env.BOT_STATE.get(USER_INDEX_KEY, { type: 'json' }) || [];
    const lowercasedEmail = newUser.email.toLowerCase();
    if (!userIndex.includes(lowercasedEmail)) {
        userIndex.push(lowercasedEmail);
        await env.BOT_STATE.put(USER_INDEX_KEY, JSON.stringify(userIndex));
    }
}
