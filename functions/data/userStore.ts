// functions/data/userStore.ts
import { User, UserState } from '../telegram/types';
import { Env } from '../telegram/types';
import { normalizeState } from '../telegram/state';

const USERS_LIST_KEY = 'tgusers:list';
const getBetDataKey = (email: string) => `betdata:${email}`;

// Helper to get the list of registered user emails
async function getUserEmailList(env: Env): Promise<string[]> {
    const list = await env.BOT_STATE.get(USERS_LIST_KEY, { type: 'json' });
    return Array.isArray(list) ? list : [];
}

// Helper to save the list of registered user emails
async function saveUserEmailList(emails: string[], env: Env): Promise<void> {
    await env.BOT_STATE.put(USERS_LIST_KEY, JSON.stringify(emails));
}

// Get all users with their full bet data
export async function getAllUsersWithBets(env: Env): Promise<{ user: User, bets: UserState['bets'] }[]> {
    const userEmails = await getUserEmailList(env);
    if (userEmails.length === 0) return [];

    const promises = userEmails.map(async email => {
        const key = getBetDataKey(email);
        const data = await env.BOT_STATE.get(key, { type: 'json' });
        const state = normalizeState(data);
        if (state.user) {
            return { user: state.user, bets: state.bets };
        }
        return null;
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is { user: User, bets: UserState['bets'] } => r !== null);
}

// Add a new user (just their email to the list)
export async function addUserEmailToList(email: string, env: Env) {
    const emails = await getUserEmailList(env);
    if (!emails.includes(email)) {
        emails.push(email);
        await saveUserEmailList(emails, env);
    }
}
