// functions/data/userStore.ts
import { Env, User } from '../telegram/types';

const USERS_LIST_KEY = 'users_list';

// Helper to manage the list of user emails for iteration
async function getUserEmailList(env: Env): Promise<string[]> {
    return (await env.BOT_STATE.get<string[]>(USERS_LIST_KEY, 'json')) || [];
}

async function saveUserEmailList(emails: string[], env: Env): Promise<void> {
    await env.BOT_STATE.put(USERS_LIST_KEY, JSON.stringify(emails));
}

/**
 * Finds a user by a predicate function. Iterates through all users.
 * @param predicate - A function that returns true if the user matches.
 * @param env - The Cloudflare environment.
 * @returns The found user or undefined.
 */
export async function findUserBy(predicate: (user: User) => boolean, env: Env): Promise<User | undefined> {
    const emails = await getUserEmailList(env);
    for (const email of emails) {
        const user = await env.BOT_STATE.get<User>(`user:${email}`, 'json');
        if (user && predicate(user)) {
            return user;
        }
    }
    return undefined;
}

/**
 * Adds a new user to the store.
 * @param newUser - The user object to add.
 * @param env - The Cloudflare environment.
 */
export async function addUser(newUser: User, env: Env): Promise<void> {
    const emails = await getUserEmailList(env);
    if (!emails.includes(newUser.email)) {
        emails.push(newUser.email);
        await saveUserEmailList(emails, env);
    }
    await env.BOT_STATE.put(`user:${newUser.email}`, JSON.stringify(newUser));
}

/**
 * Updates an existing user's data.
 * @param updatedUser - The full user object with updated data.
 * @param env - The Cloudflare environment.
 */
export async function updateUser(updatedUser: User, env: Env): Promise<void> {
    await env.BOT_STATE.put(`user:${updatedUser.email}`, JSON.stringify(updatedUser));
}
