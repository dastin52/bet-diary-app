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
    // Mock logic remains the same
    return [];
}

async function getTodaysGamesBySport(sport, env) {
    logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
    return generateMockGames(sport);
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