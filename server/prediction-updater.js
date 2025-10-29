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
const JOB_STATE_KEY = 'prediction_job_state';
const CYCLE_COMPLETED_KEY = 'prediction_job_cycle_completed';
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
        // For hockey and basketball, map explicitly to ensure correct structure
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

const seasonYear = '2023';

const SPORT_API_CONFIG = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `season=${seasonYear}&league=23` },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key', params: `season=${seasonYear}&league=39` },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `season=${seasonYear}&league=106` },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: `season=${seasonYear}&league=12` },
};


async function getTodaysGamesBySport(sport) {
    const today = new Date().toISOString().split('T')[0];
    
    if (!process.env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
        return generateMockGames(sport);
    }
    
    console.log(`[API] Fetching fresh games for ${sport} for season ${seasonYear}.`);

    const config = SPORT_API_CONFIG[sport];
    if (!config) {
         throw new Error(`No API config found for sport: ${sport}`);
    }

    const url = `${config.host}/${config.path}?${config.params}`;

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
        
        const allSeasonGames = data.response.map((item) => {
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
            return {
                id: item.id, date: item.date.split('T')[0], time: item.time, timestamp: item.timestamp,
                timezone: item.timezone, status: { long: item.status.long, short: item.status.short },
                league: item.league, teams: item.teams, scores: item.scores,
                winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                    ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });

        const todayStartTimestamp = new Date(today).setUTCHours(0, 0, 0, 0) / 1000;
        const upcomingGames = allSeasonGames
            .filter(game => game.timestamp >= todayStartTimestamp)
            .sort((a, b) => a.timestamp - b.timestamp);

        console.log(`[API SUCCESS] Fetched ${allSeasonGames.length} games for season, filtered to ${upcomingGames.length} upcoming games for ${sport}.`);
        return upcomingGames;

    } catch (error) {
        console.error(`[API ERROR] An error occurred while fetching ${sport} games. Error:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        logApiActivity({ sport, endpoint: url, status: 'error', errorMessage });

        if (errorMessage.includes("Free plans do not have access to this season")) {
            console.warn(`[API FALLBACK] API plan limit detected for ${sport}. Falling back to mock data for this run.`);
            logApiActivity({ sport, endpoint: 'MOCK_DATA_FALLBACK', status: 'success' });
            return generateMockGames(sport);
        }
        
        throw error;
    }
}

async function processSport(sport) {
    console.log(`[Updater] Starting a fresh update for sport: ${sport}`);
    const games = await getTodaysGamesBySport(sport);
    const centralPredictionsKey = `central_predictions:${sport}`;

    if (games.length === 0) {
        console.log(`[Updater] No games found for ${sport} today. Clearing existing data.`);
        cache.putPersistent(centralPredictionsKey, []);
        return [];
    }
    
    // For local dev, we assume no complex translation or prediction logic is needed.
    // We will just format the data.
    const finalPredictions = games.map(game => {
        const homeTeam = game.teams.home.name;
        const awayTeam = game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        const d = new Date(game.timestamp * 1000);
        const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

        return {
            ...(game),
            id: `${sport}-${game.id}`, // FIX: Create a composite, unique ID.
            sport: sport,
            eventName: game.league.name,
            teams: matchName,
            date: formattedDate,
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction: null, // AI predictions can be added here in a more complex setup
            score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : undefined,
        }
    }).sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || a.timestamp - b.timestamp);

    cache.putPersistent(centralPredictionsKey, finalPredictions);
    console.log(`[Updater] Successfully processed and stored ${finalPredictions.length} matches for ${sport}.`);
    return finalPredictions;
}

async function runUpdate() {
    cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);
    
    const jobState = cache.getPersistent(JOB_STATE_KEY) || { nextSportIndex: 0 };
    const sportIndex = jobState.nextSportIndex || 0;

    try {
        const isCycleCompleted = cache.getPersistent(CYCLE_COMPLETED_KEY) !== 'false';

        if (sportIndex === 0 && isCycleCompleted) {
            console.log('[Updater Task] Starting new cycle. Clearing "all" predictions cache.');
            cache.putPersistent('central_predictions:all', []);
            cache.putPersistent(CYCLE_COMPLETED_KEY, 'false');
        }

        const sport = SPORTS_TO_PROCESS[sportIndex];
        console.log(`[Updater Task] Processing sport #${sportIndex}: ${sport}`);

        const result = await processSport(sport);

        if (result && result.length > 0) {
             const currentAll = cache.getPersistent('central_predictions:all') || [];
             const existingIds = new Set(currentAll.map(p => p.id));
             const newPredictions = result.filter(p => !existingIds.has(p.id));
             if (newPredictions.length > 0) {
                const combined = [...currentAll, ...newPredictions];
                cache.putPersistent('central_predictions:all', combined);
                console.log(`[Updater Task] Added ${newPredictions.length} new predictions for '${sport}'. Total in 'all': ${combined.length}`);
             } else {
                 console.log(`[Updater Task] Sport '${sport}' processed, but no new unique predictions to add.`);
             }
        } else {
             console.log(`[Updater Task] Sport '${sport}' processed with no results.`);
        }
        
        const nextSportIndex = (sportIndex + 1) % SPORTS_TO_PROCESS.length;
        cache.putPersistent(JOB_STATE_KEY, { nextSportIndex });
        console.log(`[Updater Task] Next sport to process will be index ${nextSportIndex}.`);

        if (nextSportIndex === 0) {
            cache.putPersistent(CYCLE_COMPLETED_KEY, 'true');
            cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
            cache.putPersistent('last_run_error', null);
            console.log('[Updater Task] Full cycle complete. Successfully recorded run timestamp.');
        }
        return { success: true };
    } catch (error) {
        console.error(`[Updater Task] A critical error occurred during execution for sport '${SPORTS_TO_PROCESS[sportIndex]}':`, error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            sport: SPORTS_TO_PROCESS[sportIndex],
            message: error.message,
        });
        // Do not advance the sport index on failure, so it retries next time.
        return { success: false, message: error.message };
    }
}

module.exports = { runUpdate, cache };
