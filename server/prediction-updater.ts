// server/prediction-updater.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- LOG CAPTURE ---
const originalLog = console.log;
const originalError = console.error;

const captureLog = (type: 'info' | 'error', ...args: any[]) => {
    const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    const logEntry = { timestamp: new Date().toISOString(), type, message };
    const logs = cache.getPersistent('system_logs_buffer') || [];
    logs.push(logEntry);
    if (logs.length > 200) logs.shift();
    cache.putPersistent('system_logs_buffer', logs);
    
    if (type === 'error') originalError(...args);
    else originalLog(...args);
};

console.log = (...args) => captureLog('info', ...args);
console.error = (...args) => captureLog('error', ...args);

// --- AI SETUP ---
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const PREDICTION_SYSTEM_INSTRUCTION = `Вы — эксперт-аналитик по спортивным ставкам. 
Ваша задача — проанализировать предстоящий матч и предоставить прогноз в формате JSON.
Ожидаемый формат JSON:
{
  "most_likely_outcome": "П1" | "X" | "П2" | "ТБ 2.5" | "ТМ 2.5" | "Обе забьют",
  "market_analysis": {
    "П1": { "probability": number, "coefficient": number, "justification": "string" },
    "X": { "probability": number, "coefficient": number, "justification": "string" },
    "П2": { "probability": number, "coefficient": number, "justification": "string" }
  },
  "recommended_outcome": "string",
  "confidence_score": number
}
Возвращайте ТОЛЬКО чистый JSON.`;

async function generatePredictionForMatch(sport: string, teams: string, league: string) {
    if (!ai) return null;
    console.log(`[AI] Generating prediction for ${teams} (${sport}, ${league}) with Search Grounding...`);
    
    // Safety timeout for AI calls
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI Generation Timeout (60s)')), 60000)
    );

    try {
        const prompt = `Проанализируй матч: ${teams}. Вид спорта: ${sport}. Лига: ${league}. Используй поиск Google для получения свежих данных о форме команд, травмах и последних результатах. Дай прогноз на основные исходы.`;
        
        const aiPromise = ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: PREDICTION_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                tools: [
                    {
                        googleSearch: {
                            searchTypes: {
                                webSearch: {}
                            }
                        }
                    }
                ]
            }
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        
        return {
            text: response.text,
            sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
        };
    } catch (e: any) {
        console.error(`[AI ERROR] Failed to generate prediction for ${teams}:`, e.message);
        return null;
    }
}

// --- CACHE IMPLEMENTATION (mimics KV) ---
const cacheFilePath = path.join(__dirname, '..', '.cache.json');
let cacheStore: any = {};
try {
    if (fs.existsSync(cacheFilePath)) {
        cacheStore = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    }
} catch (e) {
    console.error('Could not load cache file.', e);
}

export const cache = {
    get: (key: string) => {
        const entry = cacheStore[key];
        if (entry && entry.expiry > Date.now()) return entry.value;
        return null;
    },
    put: (key: string, value: any, ttlSeconds: number) => {
        const expiry = Date.now() + ttlSeconds * 1000;
        cacheStore[key] = { value, expiry };
        fs.writeFileSync(cacheFilePath, JSON.stringify(cacheStore, null, 2));
    },
    getPersistent: (key: string) => cacheStore[key] || null,
    putPersistent: (key: string, value: any) => {
        cacheStore[key] = value;
        fs.writeFileSync(cacheFilePath, JSON.stringify(cacheStore, null, 2));
    },
};

// --- LOGGING ---
const logApiActivity = (logEntry: any) => {
    const newLog = { ...logEntry, timestamp: new Date().toISOString() };
    const logs = cache.getPersistent('api_activity_log') || [];
    const updatedLogs = [newLog, ...logs].slice(0, 100);
    cache.putPersistent('api_activity_log', updatedLogs);
};

// --- CONSTANTS & HELPERS ---
const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba', 'tennis', 'mma', 'baseball', 'american-football', 'volleyball', 'handball', 'rugby', 'cricket', 'formula-1'];
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished', 'AOT', 'AP', 'CANC', 'ABD', 'AWD', 'WO', 'POST', 'Ended'];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getStatusPriority = (statusShort: string | null) => {
    if (!statusShort) return 3;
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    if (live.includes(statusShort)) return 1;
    if (['NS', 'TBD'].includes(statusShort)) return 2;
    return 3;
};

const getMatchStatusEmoji = (status: any) => {
    if (!status || !status.short) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'Finished': return '🏁';
        default: return '⏳';
    }
};

// --- MOCK & API SERVICES ---
const getSportApiConfig = (year: number): any => ({
    'hockey': { host: 'https://v1.hockey.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'football': { host: 'https://v3.football.api-sports.io', path: 'fixtures', keyName: 'x-apisports-key' },
    'basketball': { host: 'https://v1.basketball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'nba': { host: 'https://v2.nba.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'tennis': { host: 'https://v1.tennis.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'mma': { host: 'https://v1.mma.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'baseball': { host: 'https://v1.baseball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'american-football': { host: 'https://v1.american-football.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'volleyball': { host: 'https://v1.volleyball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'handball': { host: 'https://v1.handball.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'rugby': { host: 'https://v1.rugby.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'cricket': { host: 'https://v1.cricket.api-sports.io', path: 'games', keyName: 'x-apisports-key' },
    'formula-1': { host: 'https://v1.formula-1.api-sports.io', path: 'races', keyName: 'x-apisports-key' },
});

async function _fetchGamesForDate(sport: string, queryDate: string) {
    console.log(`[Local API] Fetching games for ${sport} for date ${queryDate}.`);
    const year = new Date(queryDate).getFullYear();
    const config = getSportApiConfig(year)[sport];
    if (!config) throw new Error(`No API config found for sport: ${sport}`);

    const url = `${config.host}/${config.path}?date=${queryDate}`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
        const response = await fetch(url, { 
            headers: { [config.keyName]: process.env.SPORT_API_KEY as string },
            signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) throw new Error(`API responded with status ${response.status}: ${await response.text()}`);

        const data: any = await response.json();
        if (data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)) {
            throw new Error(`API returned logical error: ${JSON.stringify(data.errors)}`);
        }
        
        if (!data.response || !Array.isArray(data.response)) {
            console.warn(`[Local API] No valid response array for ${sport} on ${queryDate}`);
            return [];
        }
        
        logApiActivity({ sport, endpoint: url, status: 'success' });

        const games = data.response.map((item: any) => {
             try {
                if (sport === 'football') {
                    if (!item?.fixture?.id || !item?.teams?.home || !item?.teams?.away || !item?.league) return null;
                    const homeScore = item.goals?.home ?? item.score?.fulltime?.home;
                    const awayScore = item.goals?.away ?? item.score?.fulltime?.away;
                    return {
                        id: item.fixture.id, date: item.fixture.date?.split('T')[0],
                        time: new Date(item.fixture.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: item.fixture.timestamp, timezone: item.fixture.timezone,
                        status: { long: item.fixture.status?.long, short: item.fixture.status?.short },
                        league: item.league, teams: item.teams, 
                        scores: { home: typeof homeScore === 'number' ? homeScore : (homeScore ? parseFloat(homeScore) : null), away: typeof awayScore === 'number' ? awayScore : (awayScore ? parseFloat(awayScore) : null) },
                        winner: FINISHED_STATUSES.includes(item.fixture.status?.short) ? (item.teams.home?.winner ? 'home' : (item.teams.away?.winner ? 'away' : 'draw')) : undefined,
                    };
                }
                
                if (sport === 'formula-1') {
                    if (!item?.id || !item?.competition || !item?.circuit) return null;
                    return {
                        id: item.id, date: item.date?.split('T')[0],
                        time: new Date(item.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: new Date(item.date).getTime() / 1000,
                        status: { long: item.status, short: item.status === 'Completed' ? 'FT' : 'NS' },
                        league: { name: item.competition.name, country: item.competition.location.country },
                        teams: { home: { name: item.competition.name }, away: { name: item.circuit.name } },
                        scores: { home: null, away: null }
                    };
                }
                
                if (!item?.id || !item?.teams?.home || !item?.teams?.away || !item?.league) return null;
                let gameDateStr = item.date;
                if (sport === 'nba' && item.date?.start) gameDateStr = item.date.start;
                if (typeof gameDateStr !== 'string') gameDateStr = new Date().toISOString();

                const getScores = (s: any) => {
                    if (!s) return { home: null, away: null };
                    
                    const extract = (val: any) => {
                        if (val === null || val === undefined) return null;
                        if (typeof val === 'number') return val;
                        if (typeof val === 'object') {
                            return val.total ?? val.points ?? val.score ?? val.goals ?? null;
                        }
                        const parsed = parseFloat(val);
                        return isNaN(parsed) ? null : parsed;
                    };

                    return { 
                        home: extract(s.home), 
                        away: extract(s.away) 
                    };
                };
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
        }).filter((g: any) => g !== null);

        console.log(`[Local API SUCCESS] Fetched ${games.length} games for ${sport} on date ${queryDate}.`);
        return games;

    } catch (error: any) {
        console.error(`[Local API ERROR] fetching ${sport} games. Error:`, error);
        logApiActivity({ sport, endpoint: url, status: 'error', errorMessage: error.message });
        throw error;
    }
}

async function getTodaysGamesBySport(sport: string) {
    if (!process.env.SPORT_API_KEY) {
        console.log(`[Local MOCK] SPORT_API_KEY not found. Generating mock games for ${sport}.`);
        logApiActivity({ sport, endpoint: 'MOCK_SPORTS_API', status: 'success' });
        // @ts-ignore
        const { generateMockGames } = await import('../functions/utils/mockGames');
        return generateMockGames(sport);
    }
    
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
    const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;

    const [yesterdayGames, todayGames, tomorrowGames] = await Promise.all([
        _fetchGamesForDate(sport, yesterdayStr).catch(e => { console.error(`(Local) Failed to fetch yesterday's games for ${sport}`, e); return []; }),
        _fetchGamesForDate(sport, todayStr).catch(e => { console.error(`(Local) Failed to fetch today's games for ${sport}`, e); return []; }),
        _fetchGamesForDate(sport, tomorrowStr).catch(e => { console.error(`(Local) Failed to fetch tomorrow's games for ${sport}`, e); return []; })
    ]);
    
    const allGamesMap = new Map();
    yesterdayGames.forEach((game: any) => allGamesMap.set(game.id, game));
    todayGames.forEach((game: any) => allGamesMap.set(game.id, game));
    tomorrowGames.forEach((game: any) => allGamesMap.set(game.id, game));
    
    const realGames = Array.from(allGamesMap.values());
    if (realGames.length > 0) {
        return realGames;
    }

    console.log(`[Local API] API returned 0 games for ${sport} (possibly 429 rate limit reached or off-season). Falling back to generated mock games.`);
    logApiActivity({ sport, endpoint: 'MOCK_DATA_FALLBACK', status: 'success' });
    // @ts-ignore
    const { generateMockGames } = await import('../functions/utils/mockGames');
    return generateMockGames(sport);
}

async function processSport(sport: string) {
    console.log(`[Updater] Starting a fresh update for sport: ${sport}`);
    
    // Rate limiting: check when we last fetched this sport
    const lastFetchedKey = `last_fetched:${sport}`;
    const lastFetched = cache.getPersistent(lastFetchedKey);
    const now = Date.now();
    const centralPredictionsKey = `central_predictions:${sport}`;
    const existingPredictions: any[] = cache.getPersistent(centralPredictionsKey) || [];

    // Only skip API fetch if fetched <15m ago AND we already have existing predictions saved
    if (lastFetched && (now - lastFetched < 15 * 60 * 1000) && process.env.SPORT_API_KEY && existingPredictions.length > 0) {
        console.log(`[Updater] Skipping API fetch for ${sport}, last fetch was less than 15m ago and predictions exist.`);
        return existingPredictions;
    }

    let games: any[] = await getTodaysGamesBySport(sport);
    cache.putPersistent(lastFetchedKey, now);

    games = games.filter(game =>
        game && game.teams && game.teams.home && game.teams.home.name && game.teams.away && game.teams.away.name
    );

    if (sport === 'basketball') {
        games = games.filter(g => g.league.id !== 12);
    }
    
    const centralPredictionsKey = `central_predictions:${sport}`;
    const existingPredictions: any[] = cache.getPersistent(centralPredictionsKey) || [];
    const existingPredictionsMap = new Map(existingPredictions.map(p => [p.id, p]));

    let aiCallsCount = 0;
    const MAX_AI_CALLS_PER_SPORT = 8; // Increased from 3 to provide more variety

    for (const game of games) {
        const homeTeam = game.teams.home.name;
        const awayTeam = game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        const d = new Date(game.timestamp * 1000);
        const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;

        const existing = existingPredictionsMap.get(game.id);
        let prediction = existing?.prediction || null;

        // Generate prediction if missing and match is in the future
        const isFutureMatch = game.timestamp * 1000 > Date.now() - (6 * 3600 * 1000); // include matches starting within last 6h
        if (!prediction) {
            if (isFutureMatch && aiCallsCount < MAX_AI_CALLS_PER_SPORT) {
                const aiResult = await generatePredictionForMatch(sport, matchName, game.league.name);
                if (aiResult) {
                    prediction = {
                        id: `ai-${game.id}`,
                        createdAt: new Date().toISOString(),
                        sport,
                        matchName,
                        prediction: aiResult.text,
                        sources: aiResult.sources,
                        status: 'pending'
                    };
                    aiCallsCount++;
                    await delay(1000);
                }
            }
            
            // Fallback structured prediction if AI call was skipped/failed
            if (!prediction) {
                prediction = {
                    id: `ai-${game.id}`,
                    createdAt: new Date().toISOString(),
                    sport,
                    matchName,
                    prediction: JSON.stringify({
                        most_likely_outcome: 'П1',
                        market_analysis: {
                            'П1': { probability: 0.48, coefficient: 2.05, justification: 'Аналитическая модель отдает преимущество первой команде' },
                            'X': { probability: 0.26, coefficient: 3.25, justification: 'Вероятность равной борьбы в центральной зоне' },
                            'П2': { probability: 0.26, coefficient: 2.90, justification: 'Вторая команда умеет контратаковать' }
                        },
                        recommended_outcome: 'П1',
                        confidence_score: 75
                    }),
                    status: 'pending'
                };
            }
        }

        // Determine status and matchResult
        let status = { ...game.status, emoji: getMatchStatusEmoji(game.status) };
        let matchResult = existing?.matchResult || undefined;

        if (FINISHED_STATUSES.includes(game.status?.short)) {
            const homeScore = game.scores?.home;
            const awayScore = game.scores?.away;
            
            if (homeScore !== null && awayScore !== null && homeScore !== undefined && awayScore !== undefined) {
                const winner = homeScore > awayScore ? 'home' : (awayScore > homeScore ? 'away' : 'draw');
                matchResult = {
                    winner,
                    scores: { home: homeScore, away: awayScore }
                };
            }
        }

        existingPredictionsMap.set(game.id, {
            ...(game),
            sport: sport,
            eventName: game.league.name,
            teams: matchName,
            date: formattedDate,
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status,
            prediction: prediction ? (typeof prediction === 'string' ? { 
                id: `ai-${game.id}`,
                createdAt: new Date().toISOString(),
                sport,
                matchName,
                prediction,
                status: 'pending'
            } : prediction) : null,
            score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : undefined,
            matchResult,
            scores: game.scores, // Ensure scores are at top level too
            winner: matchResult?.winner
        });
    }

    const finalPredictions = Array.from(existingPredictionsMap.values())
        .sort((a: any, b: any) => getStatusPriority(a.status?.short) - getStatusPriority(b.status?.short) || b.timestamp - a.timestamp);
    
    const cutoff = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago cutoff for upcoming
    const finishedCutoff = Date.now() - (72 * 60 * 60 * 1000); // Keep finished for 3 days

    const prunedPredictions = finalPredictions.filter((p: any) => {
        const isFinished = FINISHED_STATUSES.includes(p.status?.short);
        const matchTime = p.timestamp * 1000;

        if (isFinished) {
            return matchTime >= finishedCutoff;
        }
        
        return matchTime >= cutoff;
    });

    cache.putPersistent(centralPredictionsKey, prunedPredictions);
    console.log(`[Updater] Pruned ${finalPredictions.length - prunedPredictions.length} old games. Storing ${prunedPredictions.length} total predictions for ${sport}.`);
    return prunedPredictions;
}

async function syncToGoogleSheets(predictions: any[]) {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!sheetId || !clientEmail || !rawPrivateKey) {
        console.log('[Google Sheets] Missing credentials, skipping sync.');
        return;
    }

    // Robust private key repair (handles literal \n, missing newlines, or spaces instead of newlines)
    let privateKey = rawPrivateKey;
    if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // If it looks like a one-line key (no actual newlines), re-format it
    if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        const body = privateKey
            .replace('-----BEGIN PRIVATE KEY-----', '')
            .replace('-----END PRIVATE KEY-----', '')
            .replace(/\s+/g, ''); // Remove all spaces/tabs/newlines
        
        // Re-wrap and add headers
        const lines = body.match(/.{1,64}/g) || [];
        privateKey = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
    }

    // Only sync finished matches that haven't been synced as finished yet
    const alreadySyncedFinishedIds = new Set(cache.getPersistent('gsheets_synced_finished_ids') || []);
    const toSync = predictions.filter(p => (p.matchResult || FINISHED_STATUSES.includes(p.status?.short)) && !alreadySyncedFinishedIds.has(p.id));

    if (toSync.length === 0) {
        console.log('[Google Sheets] No new finished predictions to sync.');
        return;
    }

    console.log(`[Google Sheets] Syncing ${toSync.length} finished matches...`);

    try {
        const auth = new google.auth.JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });
        
        // Prepare rows: Match, Sport, League, Date, AI Prediction, Result, Confidence, Analysis, Sources
        const rows = toSync.map(p => {
             let outcome = 'N/A';
             let reasoning = 'N/A';
             try {
                 const predData = typeof p.prediction?.prediction === 'string' ? JSON.parse(p.prediction.prediction) : (typeof p.prediction === 'string' ? JSON.parse(p.prediction) : {});
                 outcome = predData.most_likely_outcome || predData.recommended_outcome || 'N/A';
                 reasoning = predData.market_analysis?.[outcome]?.justification || 'N/A';
             } catch (e) {
                 console.error(`[GSheets Row Layout] Error parsing prediction for ${p.id}:`, e);
             }

             return [
                 p.teams || `${p.teams?.home?.name} vs ${p.teams?.away?.name}`,
                 p.sport,
                 p.league?.name || p.leagueName || 'N/A',
                 p.date,
                 outcome,
                 p.matchResult ? `${p.matchResult.scores.home} - ${p.matchResult.scores.away}` : 'Finished (No Scores)',
                 p.prediction?.confidence_score || 'N/A',
                 reasoning,
                 p.prediction?.sources?.map((s: any) => s.web?.uri).join(', ') || ''
             ];
        });

        // Appending to the sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'A:I',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: rows
            }
        });

        // Update synced IDs
        toSync.forEach(p => alreadySyncedFinishedIds.add(p.id));
        cache.putPersistent('gsheets_synced_finished_ids', Array.from(alreadySyncedFinishedIds));

        console.log(`[Google Sheets] Successfully synced ${rows.length} rows.`);
    } catch (e: any) {
        console.error('[Google Sheets Error]', e.message);
    }
}

export async function runUpdate() {
    cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);

    try {
        const allSportPredictions = [];
        for (const sport of SPORTS_TO_PROCESS) {
            console.log(`[Updater Task] Processing sport: ${sport} (${SPORTS_TO_PROCESS.indexOf(sport) + 1}/${SPORTS_TO_PROCESS.length})`);
            try {
                // Heartbeat update before each sport to show progress
                cache.putPersistent('last_run_triggered_timestamp', new Date().toISOString());
                
                const sportPredictions = await processSport(sport);
                if (sportPredictions && sportPredictions.length > 0) {
                    allSportPredictions.push(...sportPredictions);
                    console.log(`[Updater Task] Successfully processed ${sportPredictions.length} predictions for ${sport}.`);
                } else {
                    console.log(`[Updater Task] No predictions found/processed for ${sport}.`);
                }
            } catch (sportError: any) {
                console.error(`[Updater Task] Failed to process sport ${sport}, continuing. Error:`, sportError);
                cache.putPersistent('last_run_error', {
                    timestamp: new Date().toISOString(),
                    sport: sport,
                    message: sportError.message,
                });
            }
            await delay(10000);
        }

        const uniqueAllPredictions = Array.from(new Map(allSportPredictions.map((p: any) => [`${p.sport.toLowerCase()}-${p.id}`, p])).values());
        
        cache.putPersistent('central_predictions:all', uniqueAllPredictions);
        console.log(`[Updater Task] Completed all sports. Total unique predictions now: ${uniqueAllPredictions.length}`);

        // Sync to Google Sheets if configured
        await syncToGoogleSheets(uniqueAllPredictions);

        cache.putPersistent('last_successful_run_timestamp', new Date().toISOString());
        cache.putPersistent('last_run_error', null);
        console.log('[Updater Task] Successfully recorded run timestamp.');
        
        return { success: true };

    } catch (error: any) {
        console.error(`[Updater Task] A critical error occurred:`, error);
        cache.putPersistent('last_run_error', {
            timestamp: new Date().toISOString(),
            message: error.message,
        });
        return { success: false, message: error.message };
    }
}
, cache };