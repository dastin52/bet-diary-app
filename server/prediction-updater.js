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
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const baseGame = (id, home, away, league, time, baseStatus) => {
        const gameDate = new Date(`${todayStr}T${time}:00Z`);
        const timestamp = Math.floor(gameDate.getTime() / 1000);
        
        let currentStatus = baseStatus;
        let scores = undefined;
        let winner = undefined;
        const minutesSinceStart = (now.getTime() - gameDate.getTime()) / 60000;
        
        if (minutesSinceStart > 0) {
            if (sport === 'football') {
                 if (minutesSinceStart < 45) { currentStatus = { long: 'First Half', short: '1H' }; scores = { home: 1, away: 0 }; }
                 else if (minutesSinceStart < 65) { currentStatus = { long: 'Half Time', short: 'HT' }; scores = { home: 1, away: 0 }; }
                 else if (minutesSinceStart < 110) { currentStatus = { long: 'Second Half', short: '2H' }; scores = { home: 2, away: 1 }; }
                 else { currentStatus = { long: 'Finished', short: 'FT' }; scores = { home: 2, away: 1 }; }
            } else {
                 if (minutesSinceStart < 120) { currentStatus = { long: 'Live', short: 'LIVE' }; scores = { home: 50 + Math.floor(minutesSinceStart/5), away: 50 + Math.floor(minutesSinceStart/6) }; }
                 else { currentStatus = { long: 'Finished', short: 'FT' }; scores = { home: 102, away: 98 }; }
            }
             if (scores) { winner = scores.home > scores.away ? 'home' : scores.away > scores.home ? 'away' : 'draw'; }
        }

        return { id, date: gameDate.toISOString(), time, timestamp, timezone: 'UTC', status: currentStatus, league: { id: id * 10, name: league }, teams: { home: { id: id*100+1, name: home }, away: { id: id*100+2, name: away } }, scores, winner };
    };

    switch (sport) {
        case 'football': return [ baseGame(201, 'Real Madrid', 'FC Barcelona', 'La Liga', '19:00', { long: 'Not Started', short: 'NS' }), baseGame(202, 'Manchester City', 'Liverpool', 'Premier League', '15:30', { long: 'Not Started', short: 'NS' }), baseGame(203, 'Bayern Munich', 'Dortmund', 'Bundesliga', '12:00', { long: 'Not Started', short: 'NS' }), ];
        case 'hockey': return [ baseGame(101, 'CSKA Moscow', 'SKA St. Petersburg', 'KHL', '16:30', { long: 'Not Started', short: 'NS' }), baseGame(102, 'Toronto Maple Leafs', 'Boston Bruins', 'NHL', '23:00', { long: 'Not Started', short: 'NS' }), ];
        case 'basketball': return [ baseGame(301, 'Anadolu Efes', 'Real Madrid', 'Euroleague', '18:45', { long: 'Not Started', short: 'NS' }), baseGame(302, 'Olympiacos', 'FC Barcelona', 'Euroleague', '21:15', { long: 'Not Started', short: 'NS' }), ];
        case 'nba': return [ baseGame(401, 'Los Angeles Lakers', 'Boston Celtics', 'NBA', '23:30', { long: 'Not Started', short: 'NS' }), baseGame(402, 'Golden State Warriors', 'Phoenix Suns', 'NBA', '22:00', { long: 'Not Started', short: 'NS' }), ];
        default: return [];
    }
}

async function getTodaysGamesBySport(sport, env) {
    if (!env.SPORT_API_KEY) {
        return generateMockGames(sport);
    }
    return generateMockGames(sport); // Fallback for local dev
}

async function translateTeamNames(teamNames, env, ai) {
    const translations = {};
    for (const name of teamNames) { translations[name] = name; }
    return translations;
}

const getAiPayloadForSport = (sport, matchName) => {
    const outcomes = {};
    const keyMapping = {};
    const addOutcome = (key, description) => { outcomes[key] = { type: 'NUMBER', description }; keyMapping[key] = description; };

    switch (sport) {
        case 'basketball': case 'nba':
            addOutcome('p1_ot', 'П1 (с ОТ)');
            addOutcome('p2_ot', 'П2 (с ОТ)');
            addOutcome('total_over_215_5', 'Тотал Больше 215.5');
            addOutcome('total_under_215_5', 'Тотал Меньше 215.5');
            addOutcome('total_over_225_5', 'Тотал Больше 225.5');
            addOutcome('total_under_225_5', 'Тотал Меньше 225.5');
            addOutcome('handicap_home_plus_5_5', 'Фора 1 (+5.5)');
            addOutcome('handicap_home_minus_5_5', 'Фора 1 (-5.5)');
            addOutcome('handicap_away_plus_5_5', 'Фора 2 (+5.5)');
            addOutcome('handicap_away_minus_5_5', 'Фора 2 (-5.5)');
            break;
        case 'hockey':
            addOutcome('p1_main', 'П1 (осн. время)');
            addOutcome('x_main', 'X (осн. время)');
            addOutcome('p2_main', 'П2 (осн. время)');
            addOutcome('p1_final', 'П1 (вкл. ОТ и буллиты)');
            addOutcome('p2_final', 'П2 (вкл. ОТ и буллиты)');
            addOutcome('total_over_5_5', 'Тотал Больше 5.5');
            addOutcome('total_under_5_5', 'Тотал Меньше 5.5');
            addOutcome('total_over_4_5', 'Тотал Больше 4.5');
            addOutcome('total_under_4_5', 'Тотал Меньше 4.5');
            break;
        default: // football
            addOutcome('p1', 'П1');
            addOutcome('x', 'X');
            addOutcome('p2', 'П2');
            addOutcome('one_x', '1X');
            addOutcome('x_two', 'X2');
            addOutcome('total_over_2_5', 'Тотал Больше 2.5');
            addOutcome('total_under_2_5', 'Тотал Меньше 2.5');
            addOutcome('both_to_score_yes', 'Обе забьют - Да');
            addOutcome('both_to_score_no', 'Обе забьют - Нет');
            break;
    }

    const prompt = `Calculate probabilities and coefficients for the sports match: ${matchName} (${sport}). Use the provided schema keys. The description for each key specifies the exact market name.`;
    const schema = { type: 'OBJECT', properties: { probabilities: { type: 'OBJECT', properties: outcomes }, coefficients: { type: 'OBJECT', properties: outcomes } }, required: ["probabilities", "coefficients"] };

    return { prompt, schema, keyMapping };
};

// --- CORE UPDATER LOGIC ---
async function processSport(sport) {
    console.log(`[Updater] Starting update for sport: ${sport}`);
    let ai;
    if (process.env.GEMINI_API_KEY) { ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); }

    const games = await getTodaysGamesBySport(sport, process.env);
    const centralPredictionsKey = `central_predictions:${sport}`;
    if (games.length === 0) { cache.putPersistent(centralPredictionsKey, []); return []; }

    const existingPredictions = cache.getPersistent(centralPredictionsKey) || [];
    const existingPredictionMap = new Map(existingPredictions.map(p => [p.teams, p.prediction]));
    
    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter(n => !!n);
    const translationMap = await translateTeamNames(Array.from(new Set(teamNames)), process.env, ai);

    const todaysSharedPredictions = [];

    // BATCHED PROCESSING
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
        const batch = games.slice(i, i + BATCH_SIZE);
        console.log(`[Updater] Processing batch ${i / BATCH_SIZE + 1} for ${sport} with ${batch.length} games.`);
        
        const batchPromises = batch.map(async (game) => {
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
                         const remappedProbabilities = remap(rawPredictionData.probabilities, keyMapping);
                         const remappedCoefficients = remap(rawPredictionData.coefficients, keyMapping);

                         let bestOutcomeKey = ''; let maxValue = -Infinity;
                         for (const key in rawPredictionData.probabilities) {
                             const prob = parseFloat(rawPredictionData.probabilities[key]);
                             const coeff = parseFloat(rawPredictionData.coefficients[key]);
                             if (!isNaN(prob) && !isNaN(coeff) && coeff > 1) {
                                 const value = (prob / 100) * coeff - 1;
                                 if (value > maxValue) { maxValue = value; bestOutcomeKey = key; }
                             }
                         }
                         const recommendedOutcome = maxValue > 0 ? (keyMapping[bestOutcomeKey] || 'Нет выгодной ставки') : 'Нет выгодной ставки';
                         
                         const finalData = { probabilities: remappedProbabilities, coefficients: remappedCoefficients, recommended_outcome: recommendedOutcome };
                         prediction = { id: `${game.id}-${Date.now()}`, createdAt: new Date().toISOString(), sport, matchName, prediction: JSON.stringify(finalData), status: 'pending' };
                    }
                } catch (error) { console.error(`[Updater] Failed AI prediction for ${matchName}:`, error); }
            }
            
            const d = new Date(game.timestamp * 1000);
            const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;


            return {
                ...game, sport, eventName: game.league.name, teams: matchName,
                date: formattedDate,
                time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
                status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
                prediction,
                score: game.scores ? `${game.scores.home} - ${game.scores.away}` : undefined,
                scores: game.scores,
                winner: game.scores ? (game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw') : undefined,
            };
        });

        const batchResults = await Promise.all(batchPromises);
        todaysSharedPredictions.push(...batchResults.filter(p => p));
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
        
        // Record successful run
        cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
        cache.putPersistent('last_run_error', null); // Clear error on success
        console.log('[Updater Task] Successfully recorded run timestamp.');

        return { success: true, message: 'Update finished.' };
    } catch (error) {
        console.error('[Updater Task] Critical error:', error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
        });
        return { success: false, message: 'Update failed.' };
    }
}

module.exports = { runUpdate, cache };