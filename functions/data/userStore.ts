// functions/data/userStore.ts
import { Env, User } from '../telegram/types';

const USERS_LIST_KEY = 'users_list';

async function getUserEmailList(env: Env): Promise<string[]> {
    return (await env.BOT_STATE.get<string[]>(USERS_LIST_KEY, 'json')) || [];
}

async function saveUserEmailList(emails: string[], env: Env): Promise<void> {
    await env.BOT_STATE.put(USERS_LIST_KEY, JSON.stringify(emails));
}

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

export async function addUser(newUser: User, env: Env): Promise<void> {
    const emails = await getUserEmailList(env);
    if (!emails.includes(newUser.email)) {
        emails.push(newUser.email);
        await saveUserEmailList(emails, env);
    }
    await env.BOT_STATE.put(`user:${newUser.email}`, JSON.stringify(newUser));
}

export async function updateUser(updatedUser: User, env: Env): Promise<void> {
    await env.BOT_STATE.put(`user:${updatedUser.email}`, JSON.stringify(updatedUser));
}
