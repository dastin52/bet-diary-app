// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig, ApiActivityLog } from '../telegram/types';
import { generateMockGames } from '../utils/mockGames';

const CACHE_TTL_SECONDS = 7200; // 2 hours

const getSportApiConfig = (year: number): SportApiConfig => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth(); // 0-11
    // NBA season typically starts around October. Let's use August as the cutoff for the new season year.
    const season = month >= 7 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

    return {
        'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
        'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key', params: '' },
        'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
        // Per user request, use the dedicated v2 NBA endpoint. This endpoint doesn't need league/season params.
        'nba': { host: 'https://v2.nba.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
    };
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

async function _fetchGamesForDate(sport: string, queryDate: string, env: Env): Promise<SportGame[]> {
    const cacheKey = `cache:${sport}:games:${queryDate}`;

    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (cachedData) {
        console.log(`[Cache HIT] Found cached games for ${sport} on ${queryDate}.`);
        return cachedData as SportGame[];
    }
    console.log(`[Cache MISS] Fetching fresh games for ${sport} for date ${queryDate}.`);
    
    const year = new Date(queryDate).getFullYear();
    const config = getSportApiConfig(year)[sport];
    if (!config) {
         console.error(`No API config found for sport: ${sport}`);
         throw new Error(`No API config found for sport: ${sport}`);
    }
    
    const queryParams = `date=${queryDate}${config.params ? `&${config.params}` : ''}`;
    const url = `${config.host}/${config.path}?${queryParams}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: env.SPORT_API_KEY! } });

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
            // For hockey, basketball, and nba
            let gameDateStr = item.date;
            if (sport === 'nba' && item.date && typeof item.date === 'object' && item.date.start) {
                gameDateStr = item.date.start;
            }

            if (typeof gameDateStr !== 'string') {
                console.warn(`Unexpected date format for game ID ${item.id} in sport ${sport}:`, item.date);
                gameDateStr = new Date().toISOString();
            }

            const getScores = (scoresObj: any): { home: number | null, away: number | null } => {
                if (!scoresObj) return { home: null, away: null };
                // Basketball/NBA structure with total scores
                if (scoresObj.home && typeof scoresObj.home === 'object' && scoresObj.home.total !== undefined) {
                    return { home: scoresObj.home.total, away: scoresObj.away.total };
                }
                // Hockey/simple structure with direct numbers
                if (typeof scoresObj.home === 'number' && typeof scoresObj.away === 'number') {
                    return { home: scoresObj.home, away: scoresObj.away };
                }
                return { home: null, away: null };
            };

            const finalScores = getScores(item.scores);
            
            return {
                id: item.id,
                date: gameDateStr.split('T')[0],
                time: item.time,
                timestamp: item.timestamp,
                timezone: item.timezone,
                status: { long: item.status.long, short: item.status.short },
                league: item.league,
                teams: item.teams,
                scores: finalScores,
                winner: (finalScores.home !== null && finalScores.away !== null)
                    ? (finalScores.home > finalScores.away ? 'home' : (finalScores.away > finalScores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });

        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[API SUCCESS] Fetched ${games.length} games for ${sport} on date ${queryDate}.`);

        return games;

    } catch (error) {
        console.error(`[API ERROR] An error occurred while fetching ${sport} games for ${queryDate}. Error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
        
        if (errorMessage.includes("plan") || errorMessage.includes("subscription") || errorMessage.includes("Too many subrequests")) {
             console.warn(`[API FALLBACK] Subscription/rate-limit issue detected for ${sport}. Falling back to mock data for this run.`);
            await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_FALLBACK', status: 'success', errorMessage: 'Subscription or rate-limit issue' });
            return generateMockGames(sport);
        }
        throw error;
    }
}

export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_GENERATOR', status: 'success' });
        return generateMockGames(sport);
    }

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;

    console.log(`[API] Fetching games for ${sport} for dates: ${yesterdayStr} and ${todayStr}`);

    // Fetch for both today and yesterday in parallel
    const [yesterdayGames, todayGames] = await Promise.all([
        _fetchGamesForDate(sport, yesterdayStr, env).catch(e => { console.error(`Failed to fetch yesterday's games for ${sport}`, e); return []; }),
        _fetchGamesForDate(sport, todayStr, env).catch(e => { console.error(`Failed to fetch today's games for ${sport}`, e); return []; })
    ]);

    // Combine and de-duplicate, preferring today's data if a game appears in both
    const allGamesMap = new Map<number, SportGame>();
    yesterdayGames.forEach(game => allGamesMap.set(game.id, game));
    todayGames.forEach(game => allGamesMap.set(game.id, game)); // Today's data overwrites yesterday's if IDs conflict
    
    const combinedGames = Array.from(allGamesMap.values());
    console.log(`[API] Combined ${yesterdayGames.length} games from yesterday and ${todayGames.length} from today into ${combinedGames.length} unique games for ${sport}.`);

    return combinedGames;
}