// functions/tasks/update-predictions.ts
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';
import { resolveMarketOutcome } from '../utils/predictionUtils';

// This defines the environment variables and bindings expected by this function
interface EventContext {
    request: Request;
    env: Env;
    waitUntil: (promise: Promise<any>) => void;
}

const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];

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
            break;
        case 'hockey':
            addOutcome('p1_main', 'П1 (осн. время)');
            addOutcome('x_main', 'X (осн. время)');
            addOutcome('p2_main', 'П2 (осн. время)');
            addOutcome('p1_final', 'П1 (вкл. ОТ и буллиты)');
            addOutcome('p2_final', 'П2 (вкл. ОТ и буллиты)');
            addOutcome('total_over_5_5', 'Тотал Больше 5.5');
            addOutcome('total_under_5_5', 'Тотал Меньше 5.5');
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
    console.log(`[CRON] Starting processing for sport: ${sport}`);
    
    // 1. Fetch existing predictions and games
    const centralPredictionsKey = `central_predictions:${sport}`;
    const existingPredictions = (await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[]) || [];
    const existingPredictionsMap = new Map<string, SharedPrediction>(existingPredictions.map(p => [p.teams, p]));

    let games = await getTodaysGamesBySport(sport, env);
    if (games.length === 0) {
        console.log(`[CRON] No games found for ${sport}.`);
        return [];
    }

    // 2. Translate names
    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter((n): n is string => !!n);
    const uniqueTeamNames = Array.from(new Set(teamNames));
    const translationMap = await translateTeamNames(uniqueTeamNames, env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

    // 3. Process each game, updating existing predictions or creating new ones
    for (const game of games) {
        const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
        const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        const existingPrediction = existingPredictionsMap.get(matchName);

        // A. If game is finished
        if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null && game.scores.away !== null) {
            if (existingPrediction && existingPrediction.prediction && existingPrediction.prediction.status === AIPredictionStatus.Pending) {
                // This prediction needs its status updated
                let recommendedOutcome: string | null = null;
                try {
                    const data = JSON.parse(existingPrediction.prediction.prediction);
                    recommendedOutcome = data?.recommended_outcome || null;
                } catch (e) { console.error(`Failed to parse prediction for ${matchName}`); }

                if (recommendedOutcome) {
                    const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
                    const result = resolveMarketOutcome(recommendedOutcome, game.scores, winner);
                    if (result !== 'unknown') {
                        existingPrediction.prediction.status = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                        existingPrediction.prediction.matchResult = { winner, scores: game.scores };
                    }
                }
            }
             // Always update match data for finished games
            if(existingPrediction) {
                existingPrediction.status = { ...game.status, emoji: getMatchStatusEmoji(game.status) };
                existingPrediction.score = `${game.scores.home} - ${game.scores.away}`;
                existingPrediction.scores = game.scores;
                existingPrediction.winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
            }

        // B. If game has not started and we don't have a prediction for it
        } else if (game.status.short === 'NS' && !existingPrediction) {
            let newPrediction: AIPrediction | null = null;
            try {
                const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
                // FIX: Use 'config' instead of 'generationConfig' and correct the model name
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema,
                    },
                });
                const rawPredictionData = JSON.parse(response.text);

                if (rawPredictionData && rawPredictionData.probabilities) {
                     const remapObjectKeys = (obj: Record<string, any>, mapping: Record<string, string>) => {
                        if (!obj) return {};
                        const newObj: Record<string, any> = {};
                        for (const key in obj) {
                            const newKey = mapping[key] || key;
                            newObj[newKey] = obj[key];
                        }
                        return newObj;
                    };

                    const remappedProbabilities = remapObjectKeys(rawPredictionData.probabilities, keyMapping);
                    const remappedCoefficients = remapObjectKeys(rawPredictionData.coefficients, keyMapping);
                    
                    let bestOutcomeKey = ''; let maxValue = -Infinity;
                    for (const key in rawPredictionData.probabilities) {
                        const prob = parseFloat(rawPredictionData.probabilities[key]);
                        const coeff = parseFloat(rawPredictionData.coefficients[key]);
                        if (!isNaN(prob) && !isNaN(coeff) && coeff > 1) {
                            const value = (prob / 100) * coeff - 1;
                            if (value > maxValue) { maxValue = value; bestOutcomeKey = key; }
                        }
                    }
                    const recommendedOutcome = keyMapping[bestOutcomeKey] || 'Нет выгодной ставки';

                    const finalPredictionData = {
                        probabilities: remappedProbabilities,
                        coefficients: remappedCoefficients,
                        recommended_outcome: recommendedOutcome,
                    };
                    
                    newPrediction = {
                        id: `${game.id}-${new Date().getTime()}`, createdAt: new Date().toISOString(), sport: sport,
                        matchName: matchName, prediction: JSON.stringify(finalPredictionData), status: AIPredictionStatus.Pending,
                    };

                    const newSharedPrediction: SharedPrediction = {
                        ...(game as any), sport: sport, eventName: game.league.name, teams: matchName,
                        date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU'),
                        time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow', timeZoneName: 'short' }),
                        status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
                        prediction: newPrediction,
                    };
                    existingPredictionsMap.set(matchName, newSharedPrediction);
                }
            } catch (error) { console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); }
        }
    }

    const finalPredictions = Array.from(existingPredictionsMap.values()).sort((a,b) => {
         const priorityA = getStatusPriority(a.status.short);
         const priorityB = getStatusPriority(b.status.short);
         if (priorityA !== priorityB) return priorityA - priorityB;
         return a.timestamp - b.timestamp;
    });

    await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify(finalPredictions));
    console.log(`[CRON] Successfully processed and stored ${finalPredictions.length} predictions for ${sport}.`);
    return finalPredictions;
}


// This is the entry point for the scheduled Cloudflare Worker
export default {
    async scheduled(controller: any, env: Env, ctx: any): Promise<void> {
        ctx.waitUntil(
            (async () => {
                try {
                    console.log(`[CRON] Triggered at ${new Date().toISOString()}`);
                    
                    const allSportsResults = await Promise.allSettled(
                        SPORTS_TO_PROCESS.map(sport => processSport(sport, env))
                    );

                    allSportsResults.forEach((result, index) => {
                        const sport = SPORTS_TO_PROCESS[index];
                        if (result.status === 'rejected') {
                            console.error(`[CRON] A sport failed to process: ${sport}`, result.reason);
                        } else {
                             console.log(`[CRON] Sport processed successfully: ${sport}`);
                        }
                    });

                    // After processing all individual sports, create the combined 'all' key
                    const combinedPredictions: SharedPrediction[] = [];
                    for(const sport of SPORTS_TO_PROCESS) {
                        const sportPredictions = await env.BOT_STATE.get(`central_predictions:${sport}`, { type: 'json' }) as SharedPrediction[] | null;
                        if(sportPredictions) {
                            combinedPredictions.push(...sportPredictions);
                        }
                    }
                    await env.BOT_STATE.put('central_predictions:all', JSON.stringify(combinedPredictions));
                    console.log('[CRON] Combined "all" predictions key updated.');

                } catch (error) {
                    console.error('[CRON] A critical error occurred during execution:', error);
                }
            })()
        );
    }
};