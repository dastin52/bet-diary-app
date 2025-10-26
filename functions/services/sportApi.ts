// functions/services/sportApi.ts
import { Env, SportApiResponse, SportGame, SportApiConfig } from '../telegram/types';

const CACHE_TTL_SECONDS = 7200; // 2 hours

const SPORT_API_CONFIG: SportApiConfig = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: 'league=12&season=2023-2024' },
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

/**
 * Generates mock sports games for a given sport.
 * This is used as a fallback when the SPORT_API_KEY is not available.
 * @param sport - The key for the sport (e.g., 'hockey').
 * @returns An array of mock SportGame objects.
 */
function generateMockGames(sport: string): SportGame[] {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Helper to create a game object, simplifying mock data creation.
    const baseGame = (id: number, home: string, away: string, league: string, time: string, baseStatus: { long: string, short: string }): SportGame => {
        const gameDate = new Date(`${todayStr}T${time}:00Z`);
        const timestamp = Math.floor(gameDate.getTime() / 1000);
        
        let currentStatus = baseStatus;
        let scores: { home: number | null, away: number | null } | undefined = undefined;
        let winner: 'home' | 'away' | 'draw' | undefined = undefined;
        const minutesSinceStart = (now.getTime() - gameDate.getTime()) / 60000;
        
        if (minutesSinceStart > 0) { // Game has started or finished
            if (sport === 'football') {
                 if (minutesSinceStart < 45) {
                    currentStatus = { long: 'First Half', short: '1H' };
                    scores = { home: Math.floor(minutesSinceStart / 20) % 2, away: Math.floor(minutesSinceStart / 25) % 2 };
                } else if (minutesSinceStart < 65) {
                    currentStatus = { long: 'Half Time', short: 'HT' };
                    scores = { home: 1, away: 0 };
                } else if (minutesSinceStart < 110) {
                    currentStatus = { long: 'Second Half', short: '2H' };
                    scores = { home: 1 + Math.floor((minutesSinceStart-60) / 40), away: Math.floor((minutesSinceStart-60) / 35) };
                } else {
                    currentStatus = { long: 'Finished', short: 'FT' };
                    scores = { home: 2, away: 1 };
                }
            } else { // Simplified for other sports
                 if (minutesSinceStart < 120) {
                    currentStatus = { long: 'Live', short: 'LIVE' };
                    scores = { home: 50 + Math.floor(minutesSinceStart/5), away: 50 + Math.floor(minutesSinceStart/6) };
                } else {
                    currentStatus = { long: 'Finished', short: 'FT' };
                    scores = { home: 102, away: 98 };
                }
            }
             if (scores) {
                winner = scores.home > scores.away ? 'home' : scores.away > scores.home ? 'away' : 'draw';
            }
        }

        return {
            id: id, date: gameDate.toISOString(), time: time, timestamp: timestamp, timezone: 'UTC', 
            status: currentStatus,
            league: { id: id * 10, name: league, country: 'World', logo: '', season: new Date().getFullYear() },
            teams: { home: { id: id * 100 + 1, name: home, logo: '' }, away: { id: id * 100 + 2, name: away, logo: '' } },
            scores, winner
        };
    };

    switch (sport) {
        case 'hockey':
            return [
                baseGame(101, 'CSKA Moscow', 'SKA St. Petersburg', 'KHL', '16:30', { long: 'Not Started', short: 'NS' }),
                baseGame(102, 'Toronto Maple Leafs', 'Boston Bruins', 'NHL', '23:00', { long: 'Not Started', short: 'NS' }),
                baseGame(103, 'Dynamo Moscow', 'Ak Bars Kazan', 'KHL', '13:00', { long: 'Not Started', short: 'NS' }),
            ];
        case 'football':
            return [
                baseGame(201, 'Real Madrid', 'FC Barcelona', 'La Liga', '19:00', { long: 'Not Started', short: 'NS' }),
                baseGame(202, 'Manchester City', 'Liverpool', 'Premier League', '15:30', { long: 'Not Started', short: 'NS' }),
                baseGame(203, 'Bayern Munich', 'Dortmund', 'Bundesliga', '12:00', { long: 'Not Started', short: 'NS' }),
            ];
        case 'basketball':
             return [
                baseGame(301, 'Anadolu Efes', 'Real Madrid', 'Euroleague', '18:45', { long: 'Not Started', short: 'NS' }),
                baseGame(302, 'Olympiacos', 'FC Barcelona', 'Euroleague', '21:15', { long: 'Not Started', short: 'NS' }),
                baseGame(303, 'Fenerbahce', 'CSKA Moscow', 'Euroleague', '17:00', { long: 'Not Started', short: 'NS' }),
             ];
        case 'nba':
             return [
                baseGame(401, 'Los Angeles Lakers', 'Boston Celtics', 'NBA', '23:30', { long: 'Not Started', short: 'NS' }), 
                baseGame(402, 'Golden State Warriors', 'Phoenix Suns', 'NBA', '22:00', { long: 'Not Started', short: 'NS' }),
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

    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating dynamic mock games for ${sport}.`);
        return generateMockGames(sport);
    }

    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (Array.isArray(cachedData)) {
        console.log(`[Cache HIT] Serving ${sport} games for ${today} from cache.`);
        return cachedData as SportGame[];
    }

    console.log(`[Cache MISS] Fetching ${sport} games for ${today} from API.`);
    const config = SPORT_API_CONFIG[sport];
    if (!config) {
        console.error(`Configuration for sport "${sport}" not found. Falling back to mocks.`);
        return generateMockGames(sport);
    }

    try {
        const url = `${config.host}/${config.path}?date=${today}${config.params ? `&${config.params}` : ''}`;
        const response = await fetch(url, { headers: { [config.keyName]: env.SPORT_API_KEY } });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API responded with status ${response.status}: ${errorBody}`);
        }

        const data: any = await response.json();
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        if (hasErrors) {
            throw new Error(`API returned logical error: ${JSON.stringify(data.errors)}`);
        }

        let games: SportGame[];

        if (sport === 'football') {
            games = (data.response || []).map((item: any): SportGame | null => {
                try {
                    const { fixture, league, teams, goals } = item || {};
                    if (!fixture?.id || !fixture.timestamp || !teams?.home?.name || !teams?.away?.name || !league) return null;
                    
                    const game: SportGame = {
                        id: fixture.id,
                        date: fixture.date,
                        time: new Date(fixture.timestamp * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
                        timestamp: fixture.timestamp,
                        timezone: fixture.timezone || 'UTC',
                        status: { long: fixture.status?.long || 'Scheduled', short: fixture.status?.short || 'NS' },
                        league: league,
                        teams: teams,
                    };
                    if (goals && goals.home !== null) {
                        game.scores = { home: goals.home, away: goals.away };
                         if (game.status.short === 'FT') {
                            game.winner = goals.home > goals.away ? 'home' : goals.away > goals.home ? 'away' : 'draw';
                        }
                    }
                    return game;
                } catch (e) { return null; }
            }).filter((game): game is SportGame => game !== null);
        } else { // Basketball, Hockey
            games = (data.response || []).map((item: any): SportGame => {
                const game: SportGame = { ...item };
                let homeScore: number | null = null;
                let awayScore: number | null = null;

                 if (sport === 'basketball' || sport === 'nba') {
                     if (item.scores?.home?.total !== null && typeof item.scores?.home?.total !== 'undefined') {
                        homeScore = item.scores.home.total;
                        awayScore = item.scores.away.total;
                    }
                } else if (item.scores?.home !== null && typeof item.scores?.home !== 'undefined') { // Hockey, etc.
                    homeScore = item.scores.home;
                    awayScore = item.scores.away;
                }

                if (homeScore !== null && awayScore !== null) {
                    game.scores = { home: homeScore, away: awayScore };
                    if (FINISHED_STATUSES.includes(game.status.short)) {
                        game.winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw';
                    }
                }
                return game;
            }).filter((game: SportGame) => game?.teams?.home?.name && game?.teams?.away?.name);
        }
        
        if (games.length === 0) {
            console.log(`[FALLBACK] Sports API returned 0 valid/parsable games for ${sport}. Falling back to mock data.`);
            return generateMockGames(sport);
        }

        await env.BOT_STATE.put(cacheKey, JSON.stringify(games), { expirationTtl: CACHE_TTL_SECONDS });
        console.log(`[Cache WRITE] Stored ${games.length} ${sport} games for ${today}.`);
        
        return games;

    } catch (error) {
        console.error(`[FALLBACK] An error occurred while fetching ${sport} games, generating mock data instead. Error:`, error);
        return generateMockGames(sport);
    }
}
