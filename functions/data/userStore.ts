import { Env, User, UserState } from '../telegram/types';
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

// FIX: Implement getUsers to fetch all users for leaderboards.
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
    const