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
        headers: {
            'x-apisports-key': env.SPORT_API_KEY,
        },
    });

    if (!response.ok) {
        console.error(`Sports API error: ${response.status} ${response.statusText}`);
        const errorBody = await response.text();
        console.error('Error Body:', errorBody);
        throw new Error('Не удалось получить данные о матчах от провайдера.');
    }

    const data: HockeyApiResponse = await response.json();
    const games = data.response || [];

    // 3. Store the result in cache with a TTL
    await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
    
    console.log(`[Cache WRITE] Stored ${games.length} hockey games for ${today}.`);

    return games;
}