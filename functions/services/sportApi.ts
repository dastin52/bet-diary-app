// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig, ApiActivityLog } from '../telegram/types';
import { generateMockGames } from '../utils/mockGames';

const CACHE_TTL_SECONDS = 7200; // 2 hours

// Football API requires season, others work better with just date + league.
const getSportApiConfig = (year: number): SportApiConfig => ({
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `league=23` },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key', params: `league=39&season=${year}` },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `league=106` },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `league=12` },
});


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

export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_GENERATOR', status: 'success' });
        return generateMockGames(sport);
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const queryDate = `${year}-${month}-${day}`;
    
    const cacheKey = `cache:${sport}:games:${queryDate}`;

    // Local cache check for this specific run (not used in production cron)
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (cachedData) {
        console.log(`[Cache HIT] Found cached games for ${sport} on ${queryDate}.`);
        return cachedData as SportGame[];
    }
    console.log(`[Cache MISS] Fetching fresh games for ${sport} for date ${queryDate}.`);

    const config = getSportApiConfig(year)[sport];
    if (!config) {
         console.error(`No API config found for sport: ${sport}`);
         throw new Error(`No API config found for sport: ${sport}`);
    }
    
    const queryParams = `date=${queryDate}${config.params ? `&${config.params}` : ''}`;
    const url = `${config.host}/${config.path}?${queryParams}`;

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
                winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                    ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });

        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[API SUCCESS] Fetched ${games.length} games for ${sport} on date ${queryDate}.`);

        return games;

    } catch (error) {
        console.error(`[API ERROR] An error occurred while fetching ${sport} games. Error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
        
        if (errorMessage.includes("plan") || errorMessage.includes("subscription")) {
            console.warn(`[API FALLBACK] API plan limit detected for ${sport}. Falling back to mock data for this run.`);
            await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_FALLBACK', status: 'success' });
            return generateMockGames(sport);
        }

        throw error;
    }
}