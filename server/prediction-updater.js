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
        fs.writeFile(cacheFilePath, JSON.stringify(cacheStore, null, 2), (err) => {
            if (err) console.error('Error writing to cache file:', err);
        });
    },
    getPersistent: (key) => cacheStore[key] || null,
    putPersistent: (key, value) => {
        cacheStore[key] = value;
        fs.writeFile(cacheFilePath, JSON.stringify(cacheStore, null, 2), (err) => {
            if (err) console.error('Error writing to cache file:', err);
        });
    },
};

// --- LOGGING ---
const logApiActivity = (logEntry) => {
    const newLog = { ...logEntry, timestamp: new Date().toISOString() };
    const logs = cache.getPersistent('api_activity_log') || [];
    const updatedLogs = [newLog, ...logs].slice(0, 100); // Keep last 100
    cache.putPersistent('api_activity_log', updatedLogs);
};


// --- CONSTANTS & HELPERS ---
const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];
const BATCH_SIZE = 15; // Process in batches

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

const resolveMarketOutcome = (market, scores, winner) => {
    if (scores.home === null || scores.away === null) return 'unknown';
    const { home, away } = scores;
    if (market === 'П1' || market === 'П1 (осн. время)') return home > away ? 'correct' : 'incorrect';
    if (market === 'X' || market === 'X (осн. время)') return home === away ? 'correct' : 'incorrect';
    if (market === 'П2' || market === 'П2 (осн. время)') return away > home ? 'correct' : 'incorrect';
    if (market.includes('П1 (с ОТ)') || market.includes('П1 (вкл. ОТ')) return winner === 'home' ? 'correct' : 'incorrect';
    if (market.includes('П2 (с ОТ)') || market.includes('П2 (вкл. ОТ')) return winner === 'away' ? 'correct' : 'incorrect';
    return 'unknown';
};

// --- MOCK & API SERVICES ---
function generateMockGames(sport) {
    console.log(`[MOCK] Generating mock games for ${sport}`);
    const today = new Date().toISOString().split('T')[0];
    const baseTimestamp = Math.floor(new Date(`${today}T18:00:00Z`).getTime() / 1000);

    const mocks = {
        football: [
            { id: 1001, fixture: { id: 1001, date: `${today}T19:00:00Z`, timestamp: baseTimestamp + 3600, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' } }, league: { id: 39, name: 'Premier League', country: 'England', logo: '', season: 2024 }, teams: { home: { id: 40, name: 'Manchester City', winner: null }, away: { id: 42, name: 'Liverpool', winner: null } }, score: { fulltime: { home: null, away: null } } },
            { id: 1002, fixture: { id: 1002, date: `${today}T16:00:00Z`, timestamp: baseTimestamp - 7200, timezone: 'UTC', status: { long: 'Match Finished', short: 'FT' } }, league: { id: 140, name: 'La Liga', country: 'Spain', logo: '', season: 2024 }, teams: { home: { id: 529, name: 'Real Madrid', winner: true }, away: { id: 530, name: 'Barcelona', winner: false } }, score: { fulltime: { home: 2, away: 1 } } },
        ],
        hockey: [
            { id: 2001, date: `${today}T18:30:00Z`, time: '18:30', timestamp: baseTimestamp + 1800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 23, name: 'KHL', country: 'Russia', logo: '', season: 2024 }, teams: { home: { id: 198, name: 'CSKA Moscow' }, away: { id: 199, name: 'SKA St. Petersburg' } }, scores: { home: null, away: null } },
        ],
        basketball: [
            { id: 3001, date: `${today}T20:00:00Z`, time: '20:00', timestamp: baseTimestamp + 7200, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 1, name: 'Euroleague', country: 'Europe', logo: '', season: 2024 }, teams: { home: { id: 204, name: 'Anadolu Efes' }, away: { id: 205, name: 'Real Madrid' } }, scores: { home: null, away: null } },
        ],
        nba: [
            { id: 4001, date: `${today}T21:00:00Z`, time: '21:00', timestamp: baseTimestamp + 10800, timezone: 'UTC', status: { long: 'Not Started', short: 'NS' }, league: { id: 12, name: 'NBA', country: 'USA', logo: '', season: 2023 }, teams: { home: { id: 15, name: 'Los Angeles Lakers' }, away: { id: 16, name: 'Los Angeles Clippers' } }, scores: { home: null, away: null } },
        ],
    };

    return (mocks[sport] || []).map(item => {
        if (sport === 'football') {
             return {
                id: item.fixture.id, date: item.fixture.date, time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                timestamp: item.fixture.timestamp, timezone: item.fixture.timezone, status: item.fixture.status,
                league: item.league, teams: item.teams, scores: item.score.fulltime,
            };
        }
        return item;
    });
}

const SPORT_API_CONFIG = {
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key', params: 'league=12&season=2023-2024' },
};

async function getTodaysGamesBySport(sport) {
    const today = new Date().toISOString().split('T')[0];
    
    if (!process.env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
        return generateMockGames(sport);
    }
    
    console.log(`[API] Fetching fresh games for ${sport} on ${today}.`);

    const config = SPORT_API_CONFIG[sport];
    if (!config) {
         console.error(`No API config found for sport: ${sport}`);
         return [];
    }
    const url = `${config.host}/${config.path}?date=${today}${config.params ? `&${config.params}` : ''}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: process.env.SPORT_API_KEY } });

        if (!response.ok) {
            const errorBody = await response.text();
            const errorMessage = `API responded with status ${response.status}: ${errorBody}`;
            logApiActivity({ sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const hasErrors = data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0);
        
        if (hasErrors || !data.response) {
            const errorMessage = `API returned logical error: ${JSON.stringify(data.errors)}`;
            logApiActivity({ sport, endpoint: url, status: 'error', errorMessage });
            throw new Error(errorMessage);
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
            return {
                id: item.id, date: item.date.split('T')[0], time: item.time, timestamp: item.timestamp,
                timezone: item.timezone, status: { long: item.status.long, short: item.status.short },
                league: item.league, teams: item.teams, scores: item.scores,
                winner: (item.scores?.home !== null && item.scores?.away !== null && item.scores.home !== undefined && item.scores.away !== undefined)
                    ? (item.scores.home > item.scores.away ? 'home' : (item.scores.away > item.scores.home ? 'away' : 'draw'))
                    : undefined,
            };
        });
        
        return games;

    } catch (error) {
        console.error(`[FALLBACK] An error occurred while fetching ${sport} games. Falling back to mocks. Error:`, error);
        logApiActivity({ sport, endpoint: url, status: 'error', errorMessage: error instanceof Error ? error.message : String(error) });
        return generateMockGames(sport); // Fallback to mocks on error
    }
}


// ... (rest of the file remains the same, including getAiPayloadForSport, processSport, and runUpdate)

async function runUpdate() {
    // Heartbeat: Immediately log that the task was triggered.
    cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);
    try {
        const allSportsResults = await Promise.allSettled(
            SPORTS_TO_PROCESS.map(sport => processSport(sport))
        );
        allSportsResults.forEach((res, i) => {
            if (res.status === 'rejected') console.error(`[Updater] Sport failed: ${SPORTS_TO_PROCESS[i]}`, res.reason);
        });

        const combinedPredictions = [];
        for (const sport of SPORTS_TO_PROCESS) {
            const preds = cache.getPersistent(`central_predictions:${sport}`);
            if (preds) combinedPredictions.push(...preds);
        }
        cache.putPersistent('central_predictions:all', combinedPredictions);
        console.log('[Updater] Combined "all" predictions key updated.');
        
        cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
        cache.putPersistent('last_run_error', null);
        console.log('[Updater Task] Successfully recorded run timestamp.');

        return { success: true, message: 'Update finished.' };
    } catch (error) {
        console.error('[Updater Task] Critical error:', error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
        });
        throw error;
    }
}

module.exports = { runUpdate, cache };