// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig } from '../telegram/types';

const CACHE_TTL_SECONDS = 7200; // 2 hours

const SPORT_API_CONFIG: SportApiConfig = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: 'league=12&season=2023' },
};

/**
 * Generates mock sports games for a given sport.
 * This is used as a fallback when the SPORT_API_KEY is not available.
 * @param sport - The key for the sport (e.g., 'hockey').
 * @returns An array of mock SportGame objects.
 */
function generateMockGames(sport: string): SportGame[] {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Helper to create a game object, simplifying mock data creation.
    const baseGame = (id: number, home: string, away: string, league: string, time: string, status: { long: string, short: string }): SportGame => {
        // Create a date object for today with the specified time in UTC.
        const gameDate = new Date(`${todayStr}T${time}:00Z`);
        const timestamp = Math.floor(gameDate.getTime() / 1000);

        return {
            id: id,
            date: gameDate.toISOString(),
            time: time, // Deprecated, but keeping for compatibility if used elsewhere
            timestamp: timestamp,
            timezone: 'UTC',
            status: status,
            league: { id: id * 10, name: league, country: 'World', logo: '', season: new Date().getFullYear() },
            teams: {
                home: { id: id * 100 + 1, name: home, logo: '' },
                away: { id: id * 100 + 2, name: away, logo: '' },
            },
        };
    };

    switch (sport) {
        case 'hockey':
            return [
                baseGame(101, 'CSKA Moscow', 'SKA St. Petersburg', 'KHL', '16:30', { long: 'Not Started', short: 'NS' }),
                baseGame(102, 'Toronto Maple Leafs', 'Boston Bruins', 'NHL', '23:00', { long: 'Not Started', short: 'NS' }),
                baseGame(103, 'Dynamo Moscow', 'Ak Bars Kazan', 'KHL', '13:00', { long: 'Finished', short: 'FT' }),
            ];
        case 'football':
            return [
                baseGame(201, 'Real Madrid', 'FC Barcelona', 'La Liga', '19:00', { long: 'Not Started', short: 'NS' }),
                baseGame(202, 'Manchester City', 'Liverpool', 'Premier League', '15:30', { long: 'Not Started', short: 'NS' }),
                baseGame(203, 'Bayern Munich', 'Dortmund', 'Bundesliga', '16:00', { long: 'First Half', short: '1H' }),
            ];
        case 'basketball':
             return [
                baseGame(301, 'Anadolu Efes', 'Real Madrid', 'Euroleague', '18:45', { long: 'Not Started', short: 'NS' }),
                baseGame(302, 'Olympiacos', 'FC Barcelona', 'Euroleague', '21:15', { long: 'Not Started', short: 'NS' }),
             ];
        case 'nba':
             return [
                baseGame(401, 'Los Angeles Lakers', 'Boston Celtics', 'NBA', '01:30', { long: 'Not Started', short: 'NS' }),
                baseGame(402, 'Golden State Warriors', 'Phoenix Suns', 'NBA', '03:00', { long: 'Not Started', short: 'NS' }),
             ];
        default:
            return [];
    }
}


/**
 * Fetches today's games for a given sport, utilizing a cache to minimize API calls.
 * If the SPORT_API_KEY is not available, it gracefully falls back to generating mock data.
 */
export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cache:${sport}:games:${today}`;

    // 1. Try to get from cache first
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (Array.isArray(cachedData)) {
        console.log(`[Cache HIT] Serving ${sport} games for ${today} from cache.`);
        return cachedData as SportGame[];
    }

    // 2. If API key is missing, use mock data. This is for environments without the key.
    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        const mockGames = generateMockGames(sport);
        // Do not cache mock data in production, but do so for local dev ease.
        await env.BOT_STATE.put(cacheKey, JSON.stringify(mockGames), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[Cache WRITE] Stored ${mockGames.length} mock ${sport} games for ${today}.`);
        return mockGames;
    }

    // 3. If key exists, fetch from the real API
    console.log(`[Cache MISS] Fetching ${sport} games for ${today} from API.`);
    const config = SPORT_API_CONFIG[sport];
    if (!config) {
        throw new Error(`Конфигурация для спорта "${sport}" не найдена.`);
    }
    
    const url = `${config.host}/${config.path}?date=${today}${config.params ? `&${config.params}` : ''}`;

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
        // Fallback to mock data on API error to keep the bot functional
        console.log(`[FALLBACK] Falling back to mock data for ${sport} due to API error.`);
        const mockGames = generateMockGames(sport);
        return mockGames;
    }

    const games = data.response || [];

    // 4. Store the real result in cache with a TTL
    if (games.length > 0) {
        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[Cache WRITE] Stored ${games.length} ${sport} games for ${today}.`);
    }

    return games;
}
