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

// --- CONSTANTS & HELPERS ---
const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];
const CACHE_TTL_SECONDS = 7200; // 2 hours

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
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const baseGame = (id, home, away, league, time, status) => ({
        id, date: new Date(`${todayStr}T${time}:00Z`).toISOString(), time, timestamp: Math.floor(new Date(`${todayStr}T${time}:00Z`).getTime() / 1000), timezone: 'UTC', status,
        league: { id: id * 10, name: league, country: 'World', logo: '', season: 2024 },
        teams: { home: { id: id * 100 + 1, name: home, logo: '' }, away: { id: id * 100 + 2, name: away, logo: '' } },
    });
    if (sport === 'football') return [baseGame(201, 'Real Madrid', 'FC Barcelona', 'La Liga', '19:00', { long: 'Not Started', short: 'NS' })];
    if (sport === 'hockey') return [baseGame(101, 'CSKA Moscow', 'SKA St. Petersburg', 'KHL', '16:30', { long: 'Not Started', short: 'NS' })];
    return [];
}

async function getTodaysGamesBySport(sport, env) {
    // In local dev, we don't have Cloudflare KV, so we use the file cache.
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `games:${sport}:${today}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (!env.SPORT_API_KEY) {
        console.log(`[MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        const mockGames = generateMockGames(sport);
        cache.put(cacheKey, mockGames, CACHE_TTL_SECONDS);
        return mockGames;
    }
    // Real API call logic would go here, for now we rely on mocks.
    return generateMockGames(sport);
}

async function translateTeamNames(teamNames, env, ai) {
    if (!teamNames || teamNames.length === 0) return {};
    const translations = {};
    for (const name of teamNames) {
        // Simple mock translation for local dev
        translations[name] = name; 
    }
    return translations;
}

// --- AI PREDICTION LOGIC ---
const getAiPayloadForSport = (sport, matchName) => {
    // Simplified for JS
    const outcomes = {};
    const keyMapping = {};
    const addOutcome = (key, desc) => { outcomes[key] = { type: 'NUMBER', description: desc }; keyMapping[key] = desc; };
    if (sport === 'football') { addOutcome('p1', 'П1'); addOutcome('x', 'X'); addOutcome('p2', 'П2'); }
    else { addOutcome('p1_final', 'П1 (вкл. ОТ и буллиты)'); addOutcome('p2_final', 'П2 (вкл. ОТ и буллиты)'); }
    const prompt = `Calculate probabilities and coefficients for the sports match: ${matchName} (${sport}). Use the provided schema keys. The description for each key specifies the exact market name.`;
    return { prompt, schema: { type: 'OBJECT', properties: { probabilities: { type: 'OBJECT', properties: outcomes }, coefficients: { type: 'OBJECT', properties: outcomes } } }, keyMapping };
};

// --- CORE UPDATER LOGIC ---
async function processSport(sport) {
    console.log(`[Updater] Starting a fresh update for sport: ${sport}`);
    let ai;
    if (process.env.GEMINI_API_KEY) {
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    const games = await getTodaysGamesBySport(sport, process.env);
    const centralPredictionsKey = `central_predictions:${sport}`;
    if (games.length === 0) {
        cache.putPersistent(centralPredictionsKey, []);
        return [];
    }

    const existingPredictions = cache.getPersistent(centralPredictionsKey) || [];
    const existingPredictionMap = new Map(existingPredictions.map(p => [p.teams, p.prediction]));
    
    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter(n => !!n);
    const translationMap = await translateTeamNames(Array.from(new Set(teamNames)), process.env, ai);

    const todaysSharedPredictions = [];

    for (const game of games) {
        const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
        const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        let prediction = existingPredictionMap.get(matchName) || null;

        if (FINISHED_STATUSES.includes(game.status.short) && game.scores && prediction?.status === 'pending') {
            const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
            const result = resolveMarketOutcome(JSON.parse(prediction.prediction).recommended_outcome, game.scores, winner);
            if (result !== 'unknown') {
                prediction.status = result === 'correct' ? 'correct' : 'incorrect';
                prediction.matchResult = { winner, scores: game.scores };
            }
        } else if (game.status.short === 'NS' && !prediction && ai) {
            try {
                const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
                const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ parts: [{ text: prompt }] }], config: { responseMimeType: "application/json", responseSchema: schema } });
                const rawPredictionData = JSON.parse(response.text);
                
                if (rawPredictionData?.probabilities) {
                     const remap = (obj, map) => Object.entries(obj).reduce((acc, [key, val]) => ({...acc, [map[key] || key]: val }), {});
                     const finalData = {
                        probabilities: remap(rawPredictionData.probabilities, keyMapping),
                        coefficients: remap(rawPredictionData.coefficients, keyMapping),
                        recommended_outcome: Object.keys(rawPredictionData.probabilities).reduce((a, b) => rawPredictionData.probabilities[a] > rawPredictionData.probabilities[b] ? a : b)
                     };
                     finalData.recommended_outcome = keyMapping[finalData.recommended_outcome];

                     prediction = { id: `${game.id}-${Date.now()}`, createdAt: new Date().toISOString(), sport, matchName, prediction: JSON.stringify(finalData), status: 'pending' };
                }
            } catch (error) { console.error(`[Updater] Failed AI prediction for ${matchName}:`, error); }
        }

        const sharedPrediction = {
            ...game, sport, eventName: game.league.name, teams: matchName,
            date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU'),
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction,
            score: game.scores ? `${game.scores.home} - ${game.scores.away}` : undefined,
            scores: game.scores,
            winner: game.scores ? (game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw') : undefined,
        };
        todaysSharedPredictions.push(sharedPrediction);
    }

    const finalPredictions = todaysSharedPredictions.sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || a.timestamp - b.timestamp);
    cache.putPersistent(centralPredictionsKey, finalPredictions);
    console.log(`[Updater] Stored ${finalPredictions.length} fresh predictions for ${sport}.`);
    return finalPredictions;
}

async function runUpdate() {
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
        return { success: true, message: 'Update finished.' };
    } catch (error) {
        console.error('[Updater Task] Critical error:', error);
        return { success: false, message: 'Update failed.' };
    }
}

module.exports = { runUpdate, cache };
