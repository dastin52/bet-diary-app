// functions/tasks/update-predictions.ts
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';
import { resolveMarketOutcome } from '../utils/predictionUtils';

interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];
const BATCH_SIZE = 15;


const getStatusPriority = (statusShort: string): number => {
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    const scheduled = ['NS', 'TBD'];
    if (live.includes(statusShort)) return 1;
    if (scheduled.includes(statusShort)) return 2;
    return 3;
};

const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'Finished': return '🏁';
        default: return '⏳';
    }
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

const getAiPayloadForSport = (sport: string, matchName: string): { prompt: string; schema: any; keyMapping: Record<string, string> } => {
    const outcomes: any = {};
    const keyMapping: Record<string, string> = {};

    const addOutcome = (key: string, description: string) => {
        outcomes[key] = { type: Type.NUMBER, description };
        keyMapping[key] = description;
    };

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

    const schema = {
        type: Type.OBJECT, properties: {
            probabilities: { type: Type.OBJECT, properties: outcomes, description: "Probabilities for each outcome in percentages." },
            coefficients: { type: Type.OBJECT, properties: outcomes, description: "Example coefficients for each outcome." },
        }, required: ["probabilities", "coefficients"]
    };

    return { prompt, schema, keyMapping };
};

async function processSport(sport: string, env: Env): Promise<SharedPrediction[]> {
    console.log(`[CRON] Starting a fresh update for sport: ${sport}`);

    let games = await getTodaysGamesBySport(sport, env);

    // When processing general basketball, filter out NBA games to avoid duplication
    if (sport === 'basketball') {
        games = games.filter(g => g.league.id !== 12);
    }
    
    const centralPredictionsKey = `central_predictions:${sport}`;

    if (games.length === 0) {
        console.log(`[CRON] No new games found for ${sport} today. Keeping existing data.`);
        // Don't clear the cache, just return what's there.
        const existingData = await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[] | null;
        return existingData || [];
    }
    
    // Fetch all existing predictions for this sport to merge with.
    const allTimePredictionsForSport = (await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[]) || [];
    const allTimePredictionsMap = new Map<string, SharedPrediction>(allTimePredictionsForSport.map(p => [`${sport}-${p.id}`, p]));


    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter((n): n is string => !!n);
    const uniqueTeamNames = Array.from(new Set(teamNames));
    const translationMap = await translateTeamNames(uniqueTeamNames, env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
        const batch = games.slice(i, i + BATCH_SIZE);
        console.log(`[CRON] Processing batch ${i / BATCH_SIZE + 1} for ${sport} with ${batch.length} games.`);
        
        const batchPromises = batch.map(async (game) => {
            const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
            const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
            const matchName = `${homeTeam} vs ${awayTeam}`;
            const uniqueGameId = `${sport}-${game.id}`;

            let existingPrediction = allTimePredictionsMap.get(uniqueGameId) || null;
            let prediction = existingPrediction ? existingPrediction.prediction : null;

            if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null) {
                if (prediction && prediction.status === AIPredictionStatus.Pending) {
                    let recommendedOutcome: string | null = null;
                    try { const data = JSON.parse(prediction.prediction); recommendedOutcome = data?.recommended_outcome || null; } catch (e) { console.error(`Failed to parse prediction for ${matchName}`); }

                    if (recommendedOutcome) {
                        const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
                        const result = resolveMarketOutcome(recommendedOutcome, game.scores, winner);
                        if (result !== 'unknown') {
                            prediction.status = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                            prediction.matchResult = { winner, scores: { home: game.scores.home, away: game.scores.away } };
                        }
                    }
                }
            } else if (game.status.short === 'NS' && !prediction) {
                try {
                    const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
                    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ parts: [{ text: prompt }] }], config: { responseMimeType: "application/json", responseSchema: schema } });
                    const rawPredictionData = JSON.parse(response.text);

                    if (rawPredictionData && rawPredictionData.probabilities) {
                        const remap = (obj: Record<string, any>, map: Record<string, string>) => Object.entries(obj).reduce((acc, [key, val]) => ({...acc, [map[key] || key]: val }), {});
                        const remappedProbabilities = remap(rawPredictionData.probabilities, keyMapping);
                        const remappedCoefficients = remap(rawPredictionData.coefficients, keyMapping);
                        
                        let bestOutcomeKey = ''; let maxValue = -Infinity;
                        for (const key in rawPredictionData.probabilities) {
                            const prob = parseFloat(rawPredictionData.probabilities[key]); const coeff = parseFloat(rawPredictionData.coefficients[key]);
                            if (!isNaN(prob) && !isNaN(coeff) && coeff > 1) {
                                const value = (prob / 100) * coeff - 1;
                                if (value > maxValue) { maxValue = value; bestOutcomeKey = key; }
                            }
                        }
                        const recommendedOutcome = maxValue > 0 ? (keyMapping[bestOutcomeKey] || 'Нет выгодной ставки') : 'Нет выгодной ставки';

                        prediction = {
                            id: `${game.id}-${new Date().getTime()}`, createdAt: new Date().toISOString(), sport: sport,
                            matchName: matchName, prediction: JSON.stringify({ probabilities: remappedProbabilities, coefficients: remappedCoefficients, recommended_outcome: recommendedOutcome }), status: AIPredictionStatus.Pending,
                        };
                    }
                } catch (error) { console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); }
            }

            const d = new Date(game.timestamp * 1000);
            const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
            
            // Create or update the prediction in the map
            allTimePredictionsMap.set(uniqueGameId, {
                ...(game as any),
                id: game.id, // Use original game ID
                sport: sport, 
                eventName: game.league.name, 
                teams: matchName,
                date: formattedDate,
                time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
                status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
                prediction: prediction,
                score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : (existingPrediction?.score || undefined),
                scores: (game.scores && game.scores.home !== null) ? game.scores : (existingPrediction?.scores || undefined),
                winner: (game.scores && game.scores.home !== null) ? (game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw') : (existingPrediction?.winner || undefined),
            });
        });
        await Promise.all(batchPromises);
    }
    
    const finalPredictions = Array.from(allTimePredictionsMap.values())
        .sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || b.timestamp - a.timestamp); // Sort by status, then newest first

    await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify(finalPredictions));
    console.log(`[CRON] Successfully processed and stored ${finalPredictions.length} total predictions for ${sport}.`);
    return finalPredictions;
}

export async function runUpdateTask(env: Env) {
    await env.BOT_STATE.put('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);

    try {
        // New logic: process one sport per trigger based on the current hour
        const hour = new Date().getUTCHours();
        const sportToProcess = SPORTS_TO_PROCESS[hour % SPORTS_TO_PROCESS.length];
        
        console.log(`[Updater Task] Current hour is ${hour}, processing sport: ${sportToProcess}`);

        // 1. Process the selected sport to get its latest predictions
        const sportPredictions = await processSport(sportToProcess, env);

        // 2. Load the existing combined predictions
        const allPredictionsRaw = await env.BOT_STATE.get('central_predictions:all', { type: 'json' }) as SharedPrediction[] | null;
        const allPredictions = allPredictionsRaw || [];

        // 3. Filter out old predictions for the sport we just updated
        const otherSportsPredictions = allPredictions.filter(p => p.sport.toLowerCase() !== sportToProcess.toLowerCase());

        // 4. Combine with the newly fetched predictions for the current sport
        const combinedPredictions = [...otherSportsPredictions, ...sportPredictions];

        // 5. De-duplicate the final list to ensure integrity
        const uniqueAllPredictions = Array.from(new Map(combinedPredictions.map(p => [`${p.sport}-${p.id}`, p])).values());

        // 6. Save the updated combined list
        await env.BOT_STATE.put('central_predictions:all', JSON.stringify(uniqueAllPredictions));
        console.log(`[Updater Task] Updated '${sportToProcess}'. Total unique predictions now: ${uniqueAllPredictions.length}`);
        
        // Record success of the overall task
        await env.BOT_STATE.put('last_successful_run_timestamp', new Date().toISOString());
        await env.BOT_STATE.delete('last_run_error'); // Delete the main error key
        console.log('[Updater Task] Successfully recorded run timestamp.');

    } catch (error) {
        // This block catches catastrophic errors, such as from processSport or KV store issues.
        console.error(`[Updater Task] A critical error occurred during the update task:`, error);
        await env.BOT_STATE.put('last_run_error', JSON.stringify({
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        }));
        // Re-throw to mark the serverless function execution as failed.
        throw error;
    }
}


export const onCron: PagesFunction<Env> = async ({ env, waitUntil }) => {
    waitUntil(runUpdateTask(env));
    return new Response('Cron task initiated.', { status: 202 });
};
