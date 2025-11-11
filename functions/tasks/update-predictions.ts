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
const BATCH_SIZE = 5; // Reduced from 15 to prevent subrequest limits
const MAX_AI_CALLS_PER_RUN = 25; // Max number of AI calls per run execution to stay safely under 50 subrequests
let aiCallCount = 0; // Counter for the current run

// Add a delay function to stagger API calls
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


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
    const marketProperties: any = {};
    const keyMapping: Record<string, string> = {};

    const addMarket = (key: string, description: string) => {
        marketProperties[key] = {
            type: Type.OBJECT,
            description: `Analysis for market: ${description}`,
            properties: {
                probability: { type: Type.NUMBER, description: "Independent probability of this outcome from 0.0 to 1.0." },
                justification: { type: Type.STRING, description: "Brief justification for the calculated probability." },
                coefficient: { type: Type.NUMBER, description: "A realistic, typical bookmaker coefficient for this outcome. MUST be greater than 1.01." }
            },
            required: ["probability", "justification", "coefficient"]
        };
        keyMapping[key] = description;
    };


    switch (sport) {
        case 'basketball': case 'nba':
            addMarket('p1_ot', 'П1 (с ОТ)');
            addMarket('p2_ot', 'П2 (с ОТ)');
            addMarket('total_over_215_5', 'Тотал Больше 215.5');
            addMarket('total_under_215_5', 'Тотал Меньше 215.5');
            addMarket('total_over_225_5', 'Тотал Больше 225.5');
            addMarket('total_under_225_5', 'Тотал Меньше 225.5');
            addMarket('handicap_home_plus_5_5', 'Фора 1 (+5.5)');
            addMarket('handicap_home_minus_5_5', 'Фора 1 (-5.5)');
            addMarket('handicap_away_plus_5_5', 'Фора 2 (+5.5)');
            addMarket('handicap_away_minus_5_5', 'Фора 2 (-5.5)');
            break;
        case 'hockey':
            addMarket('p1_main', 'П1 (осн. время)');
            addMarket('x_main', 'X (осн. время)');
            addMarket('p2_main', 'П2 (осн. время)');
            addMarket('p1_final', 'П1 (вкл. ОТ и буллиты)');
            addMarket('p2_final', 'П2 (вкл. ОТ и буллиты)');
            addMarket('total_over_5_5', 'Тотал Больше 5.5');
            addMarket('total_under_5_5', 'Тотал Меньше 5.5');
            addMarket('total_over_4_5', 'Тотал Больше 4.5');
            addMarket('total_under_4_5', 'Тотал Меньше 4.5');
            break;
        default: // football
            addMarket('p1', 'П1');
            addMarket('x', 'X');
            addMarket('p2', 'П2');
            addMarket('one_x', '1X');
            addMarket('x_two', 'X2');
            addMarket('total_over_2_5', 'Тотал Больше 2.5');
            addMarket('total_under_2_5', 'Тотал Меньше 2.5');
            addMarket('both_to_score_yes', 'Обе забьют - Да');
            addMarket('both_to_score_no', 'Обе забьют - Нет');
            break;
    }

    const prompt = `Проанализируй спортивное событие: ${matchName} (${sport}).

**ИНСТРУКЦИИ ПО АНАЛИЗУ:**
Для КАЖДОГО из предложенных рынков, оцени его применимость к данному матчу и рассчитай НЕЗАВИСИМУЮ вероятность исхода.

**КЛЮЧЕВЫЕ ФАКТОРЫ ДЛЯ АНАЛИЗА КАЖДОГО РЫНКА:**
- Статистика, форма, личные встречи, мотивация, составы.
- Если предложенный рынок (например, конкретная фора или тотал) является нетипичным или маловероятным для этого матча, укажи это в обосновании и присвой соответствующую (возможно, очень низкую) вероятность.

**ВАЖНО:**
- Каждая вероятность рассчитывается НЕЗАВИСИМО.
- НЕ нормализуй суммы вероятностей.

**ТРЕБОВАНИЯ К РАСЧЕТАМ:**
Верни строго структурированный ответ в соответствии с JSON-схемой. Для каждого рынка укажи:
- Вероятность от 0 до 1 (где 1 = 100%)
- Краткое обоснование расчета, включая оценку реалистичности рынка, если необходимо.
- Реалистичный букмекерский коэффициент (строго > 1.01).`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            market_analysis: {
                type: Type.OBJECT,
                properties: marketProperties,
                description: "Object containing analysis for each individual market."
            }
        },
        required: ["market_analysis"]
    };

    return { prompt, schema, keyMapping };
};

async function processSport(sport: string, env: Env): Promise<SharedPrediction[]> {
    console.log(`[CRON] Starting a fresh update for sport: ${sport}`);

    let games = await getTodaysGamesBySport(sport, env);
    
    // FIX: Add a robust filter to remove any malformed game data from the API response.
    // This prevents crashes if a game is missing team information.
    games = games.filter(game =>
        game && game.teams && game.teams.home && game.teams.home.name && game.teams.away && game.teams.away.name
    );

    if (sport === 'basketball') {
        games = games.filter(g => g.league.id !== 12);
    }
    
    const centralPredictionsKey = `central_predictions:${sport}`;
    
    const allTimePredictionsForSport = (await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[]) || [];
    const allTimePredictionsMap = new Map<string, SharedPrediction>(allTimePredictionsForSport.map(p => [`${sport}-${p.id}`, p]));

    // Even if no new games, proceed to update statuses of existing ones
    if (games.length > 0) {
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

                // 1. Handle finished matches (update result)
                if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null) {
                    if (prediction && prediction.status === AIPredictionStatus.Pending) {
                        const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
                        prediction.matchResult = { winner, scores: { home: game.scores.home, away: game.scores.away } };
                        
                        let mostLikelyOutcome: string | null = null;
                        try { 
                            const data = JSON.parse(prediction.prediction); 
                            mostLikelyOutcome = data?.most_likely_outcome || data?.recommended_outcome || null; 
                        } catch (e) { console.error(`Failed to parse prediction for ${matchName}`); }

                        if (mostLikelyOutcome) {
                             const result = resolveMarketOutcome(mostLikelyOutcome, game.scores, winner);
                             if (result === 'correct') {
                                prediction.status = AIPredictionStatus.Correct;
                            } else {
                                prediction.status = AIPredictionStatus.Incorrect;
                            }
                        } else {
                            prediction.status = AIPredictionStatus.Incorrect;
                        }
                    }
                } 
                // 2. Handle new predictions
                else if (game.status.short === 'NS' && !prediction) {
                    if (aiCallCount < MAX_AI_CALLS_PER_RUN) {
                        try {
                            aiCallCount++; // Increment counter
                            const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
                            const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ parts: [{ text: prompt }] }], config: { responseMimeType: "application/json", responseSchema: schema } });
                            const rawPredictionData = JSON.parse(response.text);

                            if (rawPredictionData && rawPredictionData.market_analysis) {
                                const marketAnalysis = rawPredictionData.market_analysis;
                                const remappedAnalysis: Record<string, any> = {};
                                for (const key in marketAnalysis) {
                                    const readableKey = keyMapping[key] || key;
                                    remappedAnalysis[readableKey] = marketAnalysis[key];
                                }

                                let mostLikelyKey = 'N/A';
                                let maxProb = -1;
                                for (const market in remappedAnalysis) {
                                    const { probability } = remappedAnalysis[market];
                                    const prob = parseFloat(probability);
                                    if (!isNaN(prob) && prob > maxProb) { maxProb = prob; mostLikelyKey = market; }
                                }
                                const mostLikelyOutcome = mostLikelyKey;

                                prediction = {
                                    id: `${game.id}-${new Date().getTime()}`, createdAt: new Date().toISOString(), sport: sport,
                                    matchName: matchName, prediction: JSON.stringify({ market_analysis: remappedAnalysis, most_likely_outcome: mostLikelyOutcome }), status: AIPredictionStatus.Pending,
                                };
                            }
                        } catch (error) { 
                            console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); 
                        }
                    } else {
                        console.log(`[CRON] Skipping prediction for ${matchName} due to rate limits (${aiCallCount}/${MAX_AI_CALLS_PER_RUN})`);
                    }
                }

                const d = new Date(game.timestamp * 1000);
                const formattedDate = `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
                
                allTimePredictionsMap.set(uniqueGameId, {
                    ...(game as any),
                    id: game.id,
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
            
            try {
                await Promise.all(batchPromises);
            } catch (batchError) {
                console.error(`[CRON] Error processing batch for ${sport}:`, batchError);
                // Continue to next batch/sport instead of crashing entirely
            }
            
            // Add a small delay between batches to be nice to the CPU time limit
            await delay(1000); 
        }
    }
    
    const finalPredictions = Array.from(allTimePredictionsMap.values())
        .sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || b.timestamp - a.timestamp);
        
    const now = Date.now();
    const cutoff = now - (48 * 60 * 60 * 1000); // 48 hours ago cutoff for keeping non-finished games

    const prunedPredictions = finalPredictions.filter(p => {
        if (FINISHED_STATUSES.includes(p.status.short)) {
            return true;
        }
        if (p.timestamp * 1000 >= cutoff) {
            return true;
        }
        return false;
    });

    // Save safely
    try {
        await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify(prunedPredictions));
        console.log(`[CRON] Pruned ${finalPredictions.length - prunedPredictions.length} old games. Storing ${prunedPredictions.length} total predictions for ${sport}.`);
    } catch (saveError) {
        console.error(`[CRON] Failed to save predictions for ${sport} to KV:`, saveError);
    }
    
    return prunedPredictions;
}

export async function runUpdateTask(env: Env) {
    await env.BOT_STATE.put('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);
    
    aiCallCount = 0; // Reset counter for this execution

    try {
        const allSportPredictions: SharedPrediction[] = [];

        // Process all sports sequentially with a delay to stagger load
        for (const sport of SPORTS_TO_PROCESS) {
            console.log(`[Updater Task] Processing sport: ${sport}`);
            try {
                const sportPredictions = await processSport(sport, env);
                if (sportPredictions && sportPredictions.length > 0) {
                     allSportPredictions.push(...sportPredictions);
                }
            } catch (sportError) {
                console.error(`[Updater Task] Failed to process sport ${sport}, continuing to next. Error:`, sportError);
                await env.BOT_STATE.put('last_run_error', JSON.stringify({
                    timestamp: new Date().toISOString(),
                    sport: sport,
                    message: sportError instanceof Error ? sportError.message : String(sportError),
                    stack: sportError instanceof Error ? sportError.stack : undefined,
                }));
            }
            // Add a delay to stagger the API calls for the next sport
            await delay(5000); // 5-second delay
        }
        
        const uniqueAllPredictions = Array.from(new Map(allSportPredictions.map(p => [`${p.sport.toLowerCase()}-${p.id}`, p])).values());

        await env.BOT_STATE.put('central_predictions:all', JSON.stringify(uniqueAllPredictions));
        console.log(`[Updater Task] Completed all sports. Total unique predictions now: ${uniqueAllPredictions.length}`);
        
        await env.BOT_STATE.put('last_successful_run_timestamp', new Date().toISOString());
        console.log('[Updater Task] Successfully recorded run timestamp for the full cycle.');

    } catch (error) {
        console.error(`[Updater Task] A critical error occurred during the update task:`, error);
        await env.BOT_STATE.put('last_run_error', JSON.stringify({
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        }));
        throw error; // Re-throw to indicate failure to the runtime.
    }
}


export const onCron: PagesFunction<Env> = async ({ env, waitUntil }) => {
    waitUntil(runUpdateTask(env));
    return new Response('Cron task initiated.', { status: 202 });
};
