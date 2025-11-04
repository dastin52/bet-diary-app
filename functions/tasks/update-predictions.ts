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
    const marketProperties: any = {};
    const keyMapping: Record<string, string> = {};

    const addMarket = (key: string, description: string) => {
        marketProperties[key] = {
            type: Type.OBJECT,
            description: `Analysis for market: ${description}`,
            properties: {
                probability: { type: Type.NUMBER, description: "Independent probability of this outcome from 0.0 to 1.0." },
                justification: { type: Type.STRING, description: "Brief justification for the calculated probability." },
                coefficient: { type: Type.NUMBER, description: "Example coefficient for this outcome." }
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
Для КАЖДОГО рынка рассчитай НЕЗАВИСИМУЮ вероятность от 0% до 100%, отражающую вероятность прохождения именно этого исхода.

**КЛЮЧЕВЫЕ ФАКТОРЫ ДЛЯ АНАЛИЗА КАЖДОГО РЫНКА:**
- Статистика команд/игроков, релевантная конкретному рынку
- Последняя форма (последние 5-10 матчей)
- Личные встречи между командами
- Мотивация и турнирное положение
- Домашнее/гостевое преимущество
- Травмы и составы
- Специфичные факторы для каждого типа рынка

**ВАЖНО:**
- Каждая вероятность рассчитывается НЕЗАВИСИМО для каждого рынка
- НЕ нормализуй суммы вероятностей к 100%
- Для взаимоисключающих исходов (П1/X/П2) вероятности могут суммироваться НЕ в 100%
- Фокусируйся на объективной оценке вероятности прохождения КАЖДОГО конкретного исхода

**ТРЕБОВАНИЯ К РАСЧЕТАМ:**
Верни строго структурированный ответ в соответствии с JSON-схемой. Для каждого рынка укажи:
- Вероятность от 0 до 1 (где 1 = 100%)
- Краткое обоснование расчета
- Примерный коэффициент`;

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

    if (sport === 'basketball') {
        games = games.filter(g => g.league.id !== 12);
    }
    
    const centralPredictionsKey = `central_predictions:${sport}`;

    if (games.length === 0) {
        console.log(`[CRON] No new games found for ${sport} today. Keeping existing data.`);
        const existingData = await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[] | null;
        return existingData || [];
    }
    
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
                    // Step 1: ALWAYS record the match result if the game is finished.
                    const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
                    prediction.matchResult = { winner, scores: { home: game.scores.home, away: game.scores.away } };

                    // Step 2: Try to resolve the status based on the value bet.
                    let valueBetOutcome: string | null = null;
                    try { 
                        const data = JSON.parse(prediction.prediction); 
                        valueBetOutcome = data?.value_bet_outcome || null; 
                    } catch (e) { console.error(`Failed to parse prediction for ${matchName}`); }

                    if (valueBetOutcome && valueBetOutcome !== 'Нет выгодной ставки') {
                        const result = resolveMarketOutcome(valueBetOutcome, game.scores, winner);
                        if (result === 'correct') {
                            prediction.status = AIPredictionStatus.Correct;
                        } else {
                            // It could be 'incorrect' or 'unknown', but in either case, the prediction is settled and wasn't correct.
                            prediction.status = AIPredictionStatus.Incorrect;
                        }
                    } else {
                        // If there's no value bet, the prediction is settled. Mark as incorrect for status purposes.
                        // The UI will still be able to evaluate the 'most_likely' outcome correctly using the stored matchResult.
                        prediction.status = AIPredictionStatus.Incorrect;
                    }
                }
            } else if (game.status.short === 'NS' && !prediction) {
                try {
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

                        let valueBetKey = 'Нет выгодной ставки';
                        let maxValue = -Infinity;
                        for (const market in remappedAnalysis) {
                            const { probability, coefficient } = remappedAnalysis[market];
                            const prob = parseFloat(probability); const coeff = parseFloat(coefficient);
                            if (!isNaN(prob) && !isNaN(coeff) && coeff > 1) {
                                const value = prob * coeff - 1;
                                if (value > maxValue) { maxValue = value; valueBetKey = market; }
                            }
                        }
                        const valueBetOutcome = maxValue > 0.05 ? valueBetKey : 'Нет выгодной ставки';
                        
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
                            matchName: matchName, prediction: JSON.stringify({ market_analysis: remappedAnalysis, value_bet_outcome: valueBetOutcome, most_likely_outcome: mostLikelyOutcome }), status: AIPredictionStatus.Pending,
                        };
                    }
                } catch (error) { console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); }
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
        await Promise.all(batchPromises);
    }
    
    const finalPredictions = Array.from(allTimePredictionsMap.values())
        .sort((a,b) => getStatusPriority(a.status.short) - getStatusPriority(b.status.short) || b.timestamp - a.timestamp);

    await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify(finalPredictions));
    console.log(`[CRON] Successfully processed and stored ${finalPredictions.length} total predictions for ${sport}.`);
    return finalPredictions;
}

export async function runUpdateTask(env: Env) {
    await env.BOT_STATE.put('last_run_triggered_timestamp', new Date().toISOString());
    console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);

    try {
        const hour = new Date().getUTCHours();
        const sportToProcess = SPORTS_TO_PROCESS[hour % SPORTS_TO_PROCESS.length];
        
        console.log(`[Updater Task] Current hour is ${hour}, processing sport: ${sportToProcess}`);

        const sportPredictions = await processSport(sportToProcess, env);

        const allPredictionsRaw = await env.BOT_STATE.get('central_predictions:all', { type: 'json' }) as SharedPrediction[] | null;
        const allPredictions = allPredictionsRaw || [];

        const otherSportsPredictions = allPredictions.filter(p => p.sport.toLowerCase() !== sportToProcess.toLowerCase());
        const combinedPredictions = [...otherSportsPredictions, ...sportPredictions];
        const uniqueAllPredictions = Array.from(new Map(combinedPredictions.map(p => [`${p.sport}-${p.id}`, p])).values());

        await env.BOT_STATE.put('central_predictions:all', JSON.stringify(uniqueAllPredictions));
        console.log(`[Updater Task] Updated '${sportToProcess}'. Total unique predictions now: ${uniqueAllPredictions.length}`);
        
        await env.BOT_STATE.put('last_successful_run_timestamp', new Date().toISOString());
        await env.BOT_STATE.delete('last_run_error');
        console.log('[Updater Task] Successfully recorded run timestamp.');

    } catch (error) {
        console.error(`[Updater Task] A critical error occurred during the update task:`, error);
        await env.BOT_STATE.put('last_run_error', JSON.stringify({
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        }));
        throw error;
    }
}


export const onCron: PagesFunction<Env> = async ({ env, waitUntil }) => {
    waitUntil(runUpdateTask(env));
    return new Response('Cron task initiated.', { status: 202 });
};