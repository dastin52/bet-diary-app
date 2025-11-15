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
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getStatusPriority = (statusShort) => {
    if (!statusShort) return 3;
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    if (live.includes(statusShort)) return 1;
    if (['NS', 'TBD'].includes(statusShort)) return 2;
    return 3;
};

const getMatchStatusEmoji = (status) => {
    if (!status || !status.short) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'Finished': return '🏁';
        default: return '⏳';
    }
};

// --- MOCK & API SERVICES ---
const getSportApiConfig = (year) => ({
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v2.nba.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
});

async function _fetchGamesForDate(sport, queryDate) {
    console.log(`[Local API] Fetching games for ${sport} for date ${queryDate}.`);
    const year = new Date(queryDate).getFullYear();
    const config = getSportApiConfig(year)[sport];
    if (!config) throw new Error(`No API config found for sport: ${sport}`);

    const url = `${config.host}/${config.path}?date=${queryDate}`;

    try {
        const response = await fetch(url, { headers: { [config.keyName]: process.env.SPORT_API_KEY } });
        if (!response.ok) throw new Error(`API responded with status ${response.status}: ${await response.text()}`);

        const data = await response.json();
        if (data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)) {
            throw new Error(`API returned logical error: ${JSON.stringify(data.errors)}`);
        }
        
        logApiActivity({ sport, endpoint: url, status: 'success' });

        const games = data.response.map(item => {
             try {
                if (sport === 'football') {
                    if (!item?.fixture?.id || !item?.teams?.home || !item?.teams?.away || !item?.league) return null;
                    return {
                        id: item.fixture.id, date: item.fixture.date?.split('T')[0],
                        time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: item.fixture.timestamp, timezone: item.fixture.timezone,
                        status: { long: item.fixture.status?.long, short: item.fixture.status?.short },
                        league: item.league, teams: item.teams, scores: item.score?.fulltime,
                        winner: FINISHED_STATUSES.includes(item.fixture.status?.short) ? (item.teams.home?.winner ? 'home' : (item.teams.away?.winner ? 'away' : 'draw')) : undefined,
                    };
                }
                
                if (!item?.id || !item?.teams?.home || !item?.teams?.away || !item?.league) return null;
                let gameDateStr = item.date;
                if (sport === 'nba' && item.date?.start) gameDateStr = item.date.start;
                if (typeof gameDateStr !== 'string') gameDateStr = new Date().toISOString();

                const getScores = (s) => (!s ? { home: null, away: null } : { home: s.home?.total ?? s.home ?? null, away: s.away?.total ?? s.away ?? null });
                const finalScores = getScores(item.scores);
                
                return {
                    id: item.id, date: gameDateStr.split('T')[0], time: item.time, timestamp: item.timestamp,
                    timezone: item.timezone, status: { long: item.status?.long, short: item.status?.short },
                    league: item.league, teams: item.teams, scores: finalScores,
                    winner: (finalScores.home !== null && finalScores.away !== null) ? (finalScores.home > finalScores.away ? 'home' : (finalScores.away > finalScores.home ? 'away' : 'draw')) : undefined,
                };
            } catch (e) {
                console.error(`[Local Parser] Error processing game item for ${sport}:`, e, item);
                return null;
            }
        }).filter(g => g !== null);

        console.log(`[Local API SUCCESS] Fetched ${games.length} games for ${sport} on date ${queryDate}.`);
        return games;

    } catch (error) {
        console.error(`[Local API ERROR] fetching ${sport} games. Error:`, error);
        logApiActivity({ sport, endpoint: url, status: 'error', errorMessage: error.message });
        throw error;
    }
}

async function getTodaysGamesBySport(sport) {
    if (!process.env.SPORT_API_KEY) {
        console.log(`[Local MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
        return require('../functions/utils/mockGames').generateMockGames(sport);
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
    const existingPredictions = cache.getPersistent(centralPredictionsKey) || [];
    const existingPredictionsMap = new Map(existingPredictions.map(p => [p.id, p]));

    games.forEach(game => {
        const homeTeam = game.teams.home.name;
        const awayTeam = game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        const d = new Date(game.timestamp * 1000);
        const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

        existingPredictionsMap.set(game.id, {
            ...(game),
            sport: sport,
            eventName: game.league.name,
            teams: matchName,
            date: formattedDate,
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction: existingPredictionsMap.get(game.id)?.prediction || null,
            score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : undefined,
        });
    });

    const finalPredictions = Array.from(existingPredictionsMap.values())
        .sort((a,b) => getStatusPriority(a.status?.short) - getStatusPriority(b.status?.short) || b.timestamp - a.timestamp);
    
    const now = Date.now();
    const cutoff = now - (48 * 60 * 60 * 1000); // 48 hours ago cutoff

    const prunedPredictions = finalPredictions.filter(p => {
        if (FINISHED_STATUSES.includes(p.status?.short)) {
            return true;
        }
        if (p.timestamp * 1000 >= cutoff) {
            return true;
        }
        return false;
    });

    cache.putPersistent(centralPredictionsKey, prunedPredictions);
    console.log(`[Updater] Pruned ${finalPredictions.length - prunedPredictions.length} old games. Storing ${prunedPredictions.length} total predictions for ${sport}.`);
    return prunedPredictions;
}

async function runUpdate() {
    cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);

    try {
        const allSportPredictions = [];
        for (const sport of SPORTS_TO_PROCESS) {
            console.log(`[Updater Task] Processing sport: ${sport}`);
            try {
                const sportPredictions = await processSport(sport);
                if (sportPredictions && sportPredictions.length > 0) {
                    allSportPredictions.push(...sportPredictions);
                }
            } catch (sportError) {
                console.error(`[Updater Task] Failed to process sport ${sport}, continuing. Error:`, sportError);
                cache.putPersistent('last_run_error', {
                    timestamp: new Date().toISOString(),
                    sport: sport,
                    message: sportError.message,
                });
            }
            await delay(10000);
        }

        const uniqueAllPredictions = Array.from(new Map(allSportPredictions.map(p => [`${p.sport.toLowerCase()}-${p.id}`, p])).values());
        
        cache.putPersistent('central_predictions:all', uniqueAllPredictions);
        console.log(`[Updater Task] Completed all sports. Total unique predictions now: ${uniqueAllPredictions.length}`);

        cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
        cache.putPersistent('last_run_error', null);
        console.log('[Updater Task] Successfully recorded run timestamp.');
        
        return { success: true };

    } catch (error) {
        console.error(`[Updater Task] A critical error occurred:`, error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            message: error.message,
        });
        return { success: false, message: error.message };
    }
}

module.exports = { runUpdate, cache };