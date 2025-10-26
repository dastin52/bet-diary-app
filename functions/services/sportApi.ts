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
    // ... (mock generation logic remains the same)
    return []; // For brevity, in a real scenario this function would be fully implemented
}

export async function getTodaysGamesBySport(sport: string, env: Env): Promise<SportGame[]> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `cache:${sport}:games:${today}`;

    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating dynamic mock games for ${sport}.`);
        await logApiActivity(env, { sport, endpoint: 'MOCK_DATA_GENERATOR', status: 'success' });
        return generateMockGames(sport);
    }
    
    // ... (rest of the function remains largely the same)

    const config = SPORT_API_CONFIG[sport];
    const url = `${config.host}/${config.path}?date=${today}${config.params ? `&${config.params}` : ''}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: env.SPORT_API_KEY } });

        if (!response.ok) {
            const errorBody = await response.text();
            const errorMessage = `API responded with status ${response.status}: ${errorBody}`;
            await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
        }

        const data: any = await response.json();
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        if (hasErrors) {
            const errorMessage = `API returned logical error: ${JSON.stringify(data.errors)}`;
            await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
        }
        
        // Log success after parsing
        await logApiActivity(env, { sport, endpoint: url, status: 'success' });
        
        // ... (parsing logic remains the same)
        let games: SportGame[] = []; // Placeholder for actual parsing logic
        // ...
        
        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        return games;

    } catch (error) {
        console.error(`[FALLBACK] An error occurred while fetching ${sport} games, generating mock data instead. Error:`, error);
        // Log the final failure before falling back
        await logApiActivity(env, { sport, endpoint: url, status: 'error', errorMessage: error instanceof Error ? error.message : String(error) });
        return generateMockGames(sport);
    }
}