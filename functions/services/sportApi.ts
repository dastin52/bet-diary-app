// functions/services/sportApi.ts
import { Env, HockeyApiResponse, HockeyGame } from '../telegram/types';

const API_HOST = 'https://v1.hockey.api-sports.io';
const CACHE_TTL_SECONDS = 7200; // 2 hours

/**
 * Fetches today's hockey games, utilizing a cache to minimize API calls.
 */
export async function getTodaysHockeyGames(env: Env): Promise<HockeyGame[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cache:hockey:games:${today}`;

    // 1. Try to get from cache first
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' }) as HockeyGame[] | null;
    if (cachedData) {
        console.log(`[Cache HIT] Serving hockey games for ${today} from cache.`);
        return cachedData;
    }

    console.log(`[Cache MISS] Fetching hockey games for ${today} from API.`);
    // 2. If not in cache, fetch from API
    if (!env.SPORT_API_KEY) {
        console.error("SPORT_API_KEY is not configured.");
        throw new Error("API для спорта не настроена на сервере.");
    }
    
    const response = await fetch(`${API_HOST}/games?date=${today}`, {
        method: 'GET',
        headers: {
            'x-apisports-key': env.SPORT_API_KEY,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Sports API error: ${response.status} ${response.statusText}. Body: ${errorBody}`);
        throw new Error(`Ошибка API (${response.status}): ${errorBody}`);
    }

    const data: HockeyApiResponse = await response.json();

    // CRITICAL FIX: Check for logical errors within the API's JSON response,
    // as it can return 200 OK even for auth failures.
    const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
    if (hasErrors) {
        const errorString = JSON.stringify(data.errors);
        console.error(`Sports API returned logical error: ${errorString}`);
        throw new Error(`Ошибка от API спорта: ${errorString}`);
    }


    const games = data.response || [];

    // 3. Store the result in cache with a TTL
    if (games.length > 0) {
        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[Cache WRITE] Stored ${games.length} hockey games for ${today}.`);
    }

    return games;
}