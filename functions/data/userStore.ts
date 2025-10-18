// functions/data/userStore.ts
import { Env, User, Bet } from '../telegram/types';

// This function is required by competition.ts and is specific to the serverless environment.
export async function getAllUsersWithBets(env: Env): Promise<{ user: User; bets: Bet[] }[]> {
    const list = await env.BOT_STATE.list({ prefix: 'betdata:' });
    const usersWithBets: { user: User; bets: Bet[] }[] = [];

    for (const key of list.keys) {
        try {
            const data = await env.BOT_STATE.get(key.name, { type: 'json' });
            if (data && data.user && Array.isArray(data.bets)) {
                usersWithBets.push({ user: data.user, bets: data.bets });
            }
        } catch (e) {
            console.error(`Failed to parse data for key ${key.name}:`, e);
        }
    }
    return usersWithBets;
}

// Below are serverless adaptations of user management functions.

export async function getUsers(env: Env): Promise<User[]> {
    const list = await env.BOT_STATE.list({ prefix: 'betdata:' });
    const users: User[] = [];
    for (const key of list.keys) {
        try {
            const data = await env.BOT_STATE.get(key.name, { type: 'json' });
            if (data && data.user) {
                users.push(data.user);
            }
        } catch (e) {
            console.error(`Failed to parse user data for key ${key.name}:`, e);
        }
    }
    return users;
}

export async function findUserBy(predicate: (user: User) => boolean, env: Env): Promise<User | undefined> {
  const allUsers = await getUsers(env);
  return allUsers.find(predicate);
};
