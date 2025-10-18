// functions/data/userStore.ts
import { Env, User, Bet } from '../telegram/types';

// A mock hashing function. In a real app, use a library like bcrypt on the server.
export const mockHash = (password: string) => `hashed_${password}`;

// This function is required by competition.ts and is specific to the serverless environment.
export async function getAllUsersWithBets(env: Env): Promise<{ user: User; bets: Bet[] }[]> {
    const list = await env.BOT_STATE.list({ prefix: 'betdata:' });
    const userKeys = list.keys.map(key => key.name);

    if (userKeys.length === 0) return [];
    
    // Batch KV GET requests for performance
    const userPromises = userKeys.map(key => env.BOT_STATE.get(key, { type: 'json' }));
    const results = await Promise.all(userPromises);

    return results
        .filter(data => data && data.user && Array.isArray(data.bets))
        .map(data => ({ user: data.user, bets: data.bets }));
}


// Below are serverless adaptations of user management functions.

export async function getUsers(env: Env): Promise<User[]> {
    const list = await env.BOT_STATE.list({ prefix: 'betdata:' });
    const userKeys = list.keys.map(key => key.name);

    if (userKeys.length === 0) return [];

    const userPromises = userKeys.map(key => env.BOT_STATE.get(key, { type: 'json' }));
    const results = await Promise.all(userPromises);

    return results
        .filter(data => data && data.user)
        .map(data => data.user);
}

export async function findUserBy(predicate: (user: User) => boolean, env: Env): Promise<User | undefined> {
  const allUsers = await getUsers(env);
  return allUsers.find(predicate);
};