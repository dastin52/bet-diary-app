// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig } from '../telegram/types';

const CACHE_TTL_SECONDS = 7200; // 2 hours

const SPORT_API_CONFIG: SportApiConfig = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
};

/**
 * Fetches today's games for a given sport, utilizing a cache to minimize API calls.
 */
export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cache:${sport}:games:${today}`;

    // 1. Try to get from cache first
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' }) as SportGame[] | null;
    if (cachedData) {
        console.log(`[Cache HIT] Serving ${sport} games for ${today} from cache.`);
        return cachedData;
    }

    console.log(`[Cache MISS] Fetching ${sport} games for ${today} from API.`);
    
    // 2. If not in cache, fetch from API
    const config = SPORT_API_CONFIG[sport];
    if (!config) {
        throw new Error(`Конфигурация для спорта "${sport}" не найдена.`);
    }
    if (!env.SPORT_API_KEY) {
        console.error("SPORT_API_KEY is not configured.");
        throw new Error("API для спорта не настроена на сервере.");
    }
    
    const url = `${config.host}/${config.path}?date=${today}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            [config.keyName]: env.SPORT_API_KEY,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Sports API error: ${response.status} ${response.statusText}. Body: ${errorBody}`);
        throw new Error(`Ошибка API (${response.status}): ${errorBody}`);
    }

    const data: SportApiResponse = await response.json();
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
        console.log(`[Cache WRITE] Stored ${games.length} ${sport} games for ${today}.`);
    }

    return games;
}