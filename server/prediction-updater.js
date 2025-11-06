// server/prediction-updater.js
const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Type } = require('@google/genai');

// --- CACHE IMPLEMENTATION (mimics KV) ---
const cacheFilePath = path.join(__dirname, '..', '.cache.json');
let cacheStore = {};
try {
    if (fs.existsSync(cacheFilePath)) {
        cacheStore = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    }
} catch (e) {
    console.error('Could not load cache file.', e);
}

const cache = {
    get: (key) => {
        const entry = cacheStore[key];
        if (entry && entry.expiry > Date.now()) return entry.value;
        return null;
    },
    put: (key, value, ttlSeconds) => {
        const expiry = Date.now() + ttlSeconds * 1000;
        cacheStore[key] = { value, expiry };
        fs.writeFileSync(cacheFilePath, JSON.stringify(cacheStore, null, 2));
    },
    getPersistent: (key) => cacheStore[key] || null,
    putPersistent: (key, value) => {
        cacheStore[key] = value;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cacheStore, null, 2));
    },
};

// --- LOGGING ---
const logApiActivity = (logEntry) => {
    const newLog = { ...logEntry, timestamp: new Date().toISOString() };
    const logs = cache.getPersistent('api_activity_log') || [];
    const updatedLogs = [newLog, ...logs].slice(0, 100);
    cache.putPersistent('api_activity_log', updatedLogs);
};

// --- CONSTANTS & HELPERS ---
const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

const getStatusPriority = (statusShort) => {
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    if (live.includes(statusShort)) return 1;
    if (['NS', 'TBD'].includes(statusShort)) return 2;
    return 3;
};

const getMatchStatusEmoji = (status) => {
    if (!status) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'Finished': return '🏁';
        default: return '⏳';
    }
};

// --- MOCK & API SERVICES ---
function generateMockGames(sport) {
    console.log(`[MOCK] Generating mock games for ${sport}`);
    const today = new Date().toISOString().split('T')[0];
    const baseTimestamp = Math.floor(new Date(`${today}T18:00:00Z`).getTime() / 1000);

    const mocks = {
        football: [
            { id: 1001, fixture: { id: 1001, date: `${today}T19:00:00Z`, timestamp: baseTimestamp + 3600, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 39, name: 'Premier League', country: 'England', logo: '', season: 2023 }, teams: { home: { id: 40, name: 'Manchester City', winner: null }, away: { id: 42, name: 'Liverpool', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 1002, fixture: { id: 1002, date: `${today}T16:00:00Z`, timestamp: baseTimestamp - 7200, timezone: 'UTC', status: { long: 'Match Finished', short: 'FT' } }, league: { id: 140, name: 'La Liga', country: 'Spain', logo: '', season: 2023 }, teams: { home: { id: 529, name: 'Real Madrid', winner: true }, away: { id: 530, name: 'Barcelona', winner: false } }, score: { fulltime: { home: 2, away: 1 } } },
        ],
        hockey: [
            { id: 2001, date: `${today}T18:30:00Z`, time: '18:30', timestamp: baseTimestamp + 1800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 23, name: 'KHL', country: 'Russia', logo: '', season: 2023 }, teams: { home: { id: 198, name: 'CSKA Moscow' }, away: { id: 199, name: 'SKA St. Petersburg' } }, scores: { home: null, away: null } },
        ],
        basketball: [
            { id: 3001, date: `${today}T20:00:00Z`, time: '20:00', timestamp: baseTimestamp + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 106, name: 'VTB United League', country: 'Russia', logo: '', season: 2023 }, teams: { home: { id: 204, name: 'Anadolu Efes' }, away: { id: 205, name: 'Real Madrid' } }, scores: { home: null, away: null } },
        ],
        nba: [
             { id: 4001, date: `${today}T21:00:00Z`, time: '21:00', timestamp: baseTimestamp + 10800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 12, name: 'NBA', country: 'USA', logo: '', season: 2023 }, teams: { home: { id: 15, name: 'Los Angeles Lakers' }, away: { id: 16, name: 'Los Angeles Clippers' } }, scores: { home: null, away: null } },
        ]
    };

    return (mocks[sport] || []).map(item => {
        if (sport === 'football') {
             return {
                id: item.fixture.id, date: item.fixture.date.split('T')[0],
                time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                timestamp: item.fixture.timestamp, timezone: item.fixture.timezone,
                status: { long: item.fixture.status.long, short: item.fixture.status.short },
                league: item.league, teams: item.teams, scores: item.score.fulltime,
                winner: item.fixture.status.short === 'FT' ? (item.teams.home.winner ? 'home' : (item.teams.away.winner ? 'away' : 'draw')) : undefined,
            };
        }
        return {
            id: item.id, date: item.date.split('T')[0], time: item.time, timestamp: item.timestamp,
            timezone: item.timezone, status: { long: item.status.long, short: item.status.short },
            league: item.league, teams: item.teams, scores: item.scores,
            winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                : undefined,
        };
    });
}

const getSportApiConfig = (year) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const month = now.getMonth(); // 0-11
    const season = month >= 7 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

    return {
        'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
        'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key', params: '' },
        'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
        'nba': { host: 'https://v2.nba.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: '' },
    };
};

async function _fetchGamesForDate(sport, queryDate) {
    console.log(`[API] Fetching fresh games for ${sport} for date ${queryDate}.`);
    
    const year = new Date(queryDate).getFullYear();
    const config = getSportApiConfig(year)[sport];
    if (!config) {
         throw new Error(`No API config found for sport: ${sport}`);
    }

    const queryParams = `date=${queryDate}${config.params ? `&${config.params}` : ''}`;
    const url = `${config.host}/${config.path}?${queryParams}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: process.env.SPORT_API_KEY } });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API responded with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        
        if (hasErrors || !data.response) {
            throw new Error(`API returned logical error: ${JSON.stringify(data.errors)}`);
        }
        
        logApiActivity({ sport, endpoint: url, status: 'success' });
        
        const games = data.response.map((item) => {
            if (sport === 'football') {
                return {
                    id: item.fixture.id, date: item.fixture.date.split('T')[0],
                    time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: item.fixture.timestamp, timezone: item.fixture.timezone,
                    status: { long: item.fixture.status.long, short: item.fixture.status.short },
                    league: item.league, teams: item.teams, scores: item.score.fulltime,
                    winner: FINISHED_STATUSES.includes(item.fixture.status.short)
                        ? (item.teams.home.winner ? 'home' : (item.teams.away.winner ? 'away' : 'draw'))
                        : undefined,
                };
            }
            
            let gameDateStr = item.date;
            if (sport === 'nba' && item.date && typeof item.date === 'object' && item.date.start) {
                gameDateStr = item.date.start;
            }

            if (typeof gameDateStr !== 'string') {
                console.warn(`Unexpected date format for game ID ${item.id} in sport ${sport}:`, item.date);
                gameDateStr = new Date().toISOString();
            }

            return {
                id: item.id,
                date: gameDateStr.split('T')[0],
                time: item.time,
                timestamp: item.timestamp,
                timezone: item.timezone,
                status: { long: item.status.long, short: item.status.short },
                league: item.league,
                teams: item.teams,
                scores: item.scores,
                winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                    ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });

        console.log(`[API SUCCESS] Fetched ${games.length} games for ${sport} on date ${queryDate}.`);
        return games;

    } catch (error) {
        console.error(`[API ERROR] An error occurred while fetching ${sport} games. Error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logApiActivity({ sport, endpoint: url, status: 'error', errorMessage });

        if (errorMessage.includes("plan") || errorMessage.includes("subscription") || errorMessage.includes("Too many subrequests")) {
            console.warn(`[API FALLBACK] Subscription/rate-limit issue detected for ${sport}. Falling back to mock data for this run.`);
            logApiActivity({ sport, endpoint: 'MOCK_DATA_FALLBACK', status: 'success', errorMessage: 'Subscription or rate-limit issue' });
            return generateMockGames(sport);
        }
        
        throw error;
    }
}


async function getTodaysGamesBySport(sport) {
    if (!process.env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
        return generateMockGames(sport);
    }
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;

    const [yesterdayGames, todayGames] = await Promise.all([
        _fetchGamesForDate(sport, yesterdayStr).catch(e => { console.error(`(Local) Failed to fetch yesterday's games for ${sport}`, e); return []; }),
        _fetchGamesForDate(sport, todayStr).catch(e => { console.error(`(Local) Failed to fetch today's games for ${sport}`, e); return []; })
    ]);
    
    const allGamesMap = new Map();
    yesterdayGames.forEach(game => allGamesMap.set(game.id, game));
    todayGames.forEach(game => allGamesMap.set(game.id, game));
    
    return Array.from(allGamesMap.values());
}

async function processSport(sport) {
    console.log(`[Updater] Starting a fresh update for sport: ${sport}`);
    let games = await getTodaysGamesBySport(sport);

    games = games.filter(game =>
        game && game.teams && game.teams.home && game.teams.home.name && game.teams.away && game.teams.away.name
    );

    if (sport === 'basketball') {
        games = games.filter(g => g.league.id !== 12);
    }
    
    const centralPredictionsKey = `central_predictions:${sport}`;

    if (games.length === 0) {
        console.log(`[Updater] No new games found for ${sport} today. Keeping existing data.`);
        return cache.getPersistent(centralPredictionsKey) || [];
    }
    
    const todaysPredictions = games.map(game => {
        const homeTeam = game.teams.home.name;
        const awayTeam = game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        const d = new Date(game.timestamp * 1000);
        const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

        return {
            ...(game),
            id: game.id, // Use original game ID
            sport: sport,
            eventName: game.league.name,
            teams: matchName,
            date: formattedDate,
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction: null, // AI predictions can be added here in a more complex setup
            score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : undefined,
        }
    });
    
    const existingPredictions = cache.getPersistent(centralPredictionsKey) || [];
    const todaysPredictionMap = new Map(todaysPredictions.map(p => [p.id, p]));
    const historicalPredictions = existingPredictions.filter(p => !todaysPredictionMap.has(p.id));
    
    const finalPredictions = [...historicalPredictions, ...todaysPredictions]
        .sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || b.timestamp - a.timestamp);


    cache.putPersistent(centralPredictionsKey, finalPredictions);
    console.log(`[Updater] Successfully processed and stored ${finalPredictions.length} total predictions for ${sport}.`);
    return finalPredictions;
}

let currentSportIndex = 0;

async function runUpdate() {
    cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);

    try {
        const sportToProcess = SPORTS_TO_PROCESS[currentSportIndex];
        console.log(`[Updater Task] Processing sport: ${sportToProcess}`);
        
        const sportPredictions = await processSport(sportToProcess);

        const allPredictions = cache.getPersistent('central_predictions:all') || [];
        const otherSportsPredictions = allPredictions.filter(p => p.sport.toLowerCase() !== sportToProcess.toLowerCase());

        const combinedPredictions = [...otherSportsPredictions, ...sportPredictions];
        const uniqueAllPredictions = Array.from(new Map(combinedPredictions.map(p => [`${p.sport.toLowerCase()}-${p.id}`, p])).values());
        
        cache.putPersistent('central_predictions:all', uniqueAllPredictions);
        console.log(`[Updater Task] Updated '${sportToProcess}'. Total unique predictions now: ${uniqueAllPredictions.length}`);
        
        cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
        cache.putPersistent('last_run_error', null);
        console.log('[Updater Task] Successfully recorded run timestamp.');

        // Move to the next sport for the next run
        currentSportIndex = (currentSportIndex + 1) % SPORTS_TO_PROCESS.length;
        
        return { success: true };

    } catch (error) {
        console.error(`[Updater Task] A critical error occurred during the update task for ${SPORTS_TO_PROCESS[currentSportIndex]}:`, error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            sport: SPORTS_TO_PROCESS[currentSportIndex],
            message: error.message,
        });
        
        // Move to the next sport even on error to avoid getting stuck
        currentSportIndex = (currentSportIndex + 1) % SPORTS_TO_PROCESS.length;
        return { success: false, message: error.message };
    }
}

module.exports = { runUpdate, cache };