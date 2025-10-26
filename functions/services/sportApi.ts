// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig, ApiActivityLog } from '../telegram/types';

const CACHE_TTL_SECONDS = 7200; // 2 hours

const SPORT_API_CONFIG: SportApiConfig = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: 'league=12&season=2023-2024' },
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

async function logApiActivity(env: Env, logEntry: Omit<ApiActivityLog, 'timestamp'>) {
    try {
        const newLog: ApiActivityLog = { ...logEntry, timestamp: new Date().toISOString() };
        const key = 'api_activity_log';
        const existingLogsJson = await env.BOT_STATE.get(key);
        const existingLogs = existingLogsJson ? JSON.parse(existingLogsJson) : [];
        const updatedLogs = [newLog, ...existingLogs].slice(0, 100); // Keep last 100 entries
        await env.BOT_STATE.put(key, JSON.stringify(updatedLogs));
    } catch (e) {
        console.error("Failed to log API activity:", e);
    }
}

function generateMockGames(sport: string): SportGame[] {
    // This is a placeholder for local development.
    // In a real scenario, this would generate mock data.
    return [];
}

export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cache:${sport}:games:${today}`;

    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_GENERATOR', status: 'success' });
        return generateMockGames(sport);
    }
    
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (cachedData) {
        console.log(`[Cache HIT] Found cached games for ${sport} on ${today}.`);
        return cachedData as SportGame[];
    }
    console.log(`[Cache MISS] Fetching fresh games for ${sport} on ${today}.`);

    const config = SPORT_API_CONFIG[sport];
    if (!config) {
         console.error(`No API config found for sport: ${sport}`);
         // Throw an error instead of returning an empty array to signal failure
         throw new Error(`No API config found for sport: ${sport}`);
    }
    const url = `${config.host}/${config.path}?date=${today}${config.params ? `&${config.params}` : ''}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: env.SPORT_API_KEY } });

        if (!response.ok) {
            const errorBody = await response.text();
            const errorMessage = `API responded with status ${response.status}: ${errorBody}`;
            await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
        }

        const data: SportApiResponse = await response.json();
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        
        if (hasErrors || !data.response) {
            const errorMessage = `API returned logical error: ${JSON.stringify(data.errors)}`;
            await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
        }
        
        await logApiActivity(env, { sport, endpoint: url, status: 'success' });
        
        const games: SportGame[] = data.response.map((item: any): SportGame => {
            if (sport === 'football') {
                return {
                    id: item.fixture.id,
                    date: item.fixture.date.split('T')[0],
                    time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: item.fixture.timestamp,
                    timezone: item.fixture.timezone,
                    status: { long: item.fixture.status.long, short: item.fixture.status.short },
                    league: item.league,
                    teams: item.teams,
                    scores: item.score.fulltime,
                    winner: FINISHED_STATUSES.includes(item.fixture.status.short)
                        ? (item.teams.home.winner ? 'home' : (item.teams.away.winner ? 'away' : 'draw'))
                        : undefined,
                };
            }
            // For hockey and basketball, the structure is already close to SportGame
            return {
                id: item.id,
                date: item.date.split('T')[0],
                time: item.time,
                timestamp: item.timestamp,
                timezone: item.timezone,
                status: { long: item.status.long, short: item.status.short },
                league: item.league,
                teams: item.teams,
                scores: item.scores,
                // Calculate winner based on scores if not provided
                winner: (item.scores?.home !== null && item.scores?.away !== null)
                    ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });
        
        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        return games;

    } catch (error) {
        console.error(`[API ERROR] An error occurred while fetching ${sport} games. Error:`, error);
        await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage: error instanceof Error ? error.message : String(error) });
        // Re-throw the error to be caught by the calling task runner
        throw error;
    }
}
