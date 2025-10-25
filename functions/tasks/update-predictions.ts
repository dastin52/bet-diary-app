// functions/tasks/update-predictions.ts
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';
import { resolveMarketOutcome } from '../utils/predictionUtils';

// This defines the environment variables and bindings expected by this function
interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


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
    console.log(`[CRON] Starting a fresh update for sport: ${sport}`);

    // 1. Fetch today's games. This is our source of truth for what should be displayed.
    let games = await getTodaysGamesBySport(sport, env);
    const centralPredictionsKey = `central_predictions:${sport}`;

    if (games.length === 0) {
        console.log(`[CRON] No games found for ${sport} today. Clearing existing data.`);
        await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify([]));
        return [];
    }

    // 2. Fetch existing predictions to avoid re-generating them.
    const existingPredictions = (await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[]) || [];
    const existingPredictionDataMap = new Map<string, AIPrediction | null>(existingPredictions.map(p => [p.teams, p.prediction]));

    // 3. Translate names
    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter((n): n is string => !!n);
    const uniqueTeamNames = Array.from(new Set(teamNames));
    const translationMap = await translateTeamNames(uniqueTeamNames, env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    // This will hold the final list for today.
    const todaysSharedPredictions: SharedPrediction[] = [];

    // 4. Process each game for today
    for (const game of games) {
        const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
        const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        
        let prediction = existingPredictionDataMap.get(matchName) ?? null;

        // A. If game is finished and prediction was pending, resolve it.
        if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null && game.scores.away !== null) {
            if (prediction && prediction.status === AIPredictionStatus.Pending) {
                let recommendedOutcome: string | null = null;
                try {
                    const data = JSON.parse(prediction.prediction);
                    recommendedOutcome = data?.recommended_outcome || null;
                } catch (e) { console.error(`Failed to parse prediction for ${matchName}`); }

                if (recommendedOutcome) {
                    const winner = game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw';
                    const result = resolveMarketOutcome(recommendedOutcome, game.scores, winner);
                    if (result !== 'unknown') {
                        prediction.status = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                        prediction.matchResult = { winner, scores: game.scores };
                    }
                }
            }
        // B. If game has not started and we don't have a prediction for it, generate one.
        } else if (game.status.short === 'NS' && !prediction) {
            try {
                const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
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
                    
                    prediction = {
                        id: `${game.id}-${new Date().getTime()}`, createdAt: new Date().toISOString(), sport: sport,
                        matchName: matchName, prediction: JSON.stringify(finalPredictionData), status: AIPredictionStatus.Pending,
                    };
                }
            } catch (error) { console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); }
        }

        // 5. Construct the final SharedPrediction object for today's list
        const sharedPrediction: SharedPrediction = {
            ...(game as any), // Cast to any to handle type diffs temporarily
            sport: sport,
            eventName: game.league.name,
            teams: matchName,
            date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU'),
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow', timeZoneName: 'short' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction: prediction, // Use the existing, updated, or newly created prediction
            score: (game.scores && game.scores.home !== null) ? `${game.scores.home} - ${game.scores.away}` : undefined,
            scores: (game.scores && game.scores.home !== null) ? game.scores : undefined,
            winner: (game.scores && game.scores.home !== null) ? (game.scores.home > game.scores.away ? 'home' : game.scores.away > game.scores.home ? 'away' : 'draw') : undefined,
        };
        todaysSharedPredictions.push(sharedPrediction);
    }

    const finalPredictions = todaysSharedPredictions.sort((a,b) => {
         const priorityA = getStatusPriority(a.status.short);
         const priorityB = getStatusPriority(b.status.short);
         if (priorityA !== priorityB) return priorityA - priorityB;
         return a.timestamp - b.timestamp;
    });

    // 6. Overwrite the KV store with the fresh list for today.
    await env.BOT_STATE.put(centralPredictionsKey, JSON.stringify(finalPredictions));
    console.log(`[CRON] Successfully processed and stored ${finalPredictions.length} fresh predictions for ${sport}.`);
    return finalPredictions;
}

export async function runUpdateTask(env: Env) {
     try {
        console.log(`[Updater Task] Triggered at ${new Date().toISOString()}`);
        
        const allSportsResults = await Promise.allSettled(
            SPORTS_TO_PROCESS.map(sport => processSport(sport, env))
        );

        allSportsResults.forEach((result, index) => {
            const sport = SPORTS_TO_PROCESS[index];
            if (result.status === 'rejected') {
                console.error(`[Updater Task] A sport failed to process: ${sport}`, result.reason);
            } else {
                 console.log(`[Updater Task] Sport processed successfully: ${sport}`);
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
        console.log('[Updater Task] Combined "all" predictions key updated.');

    } catch (error) {
        console.error('[Updater Task] A critical error occurred during execution:', error);
    }
}

// CORRECT EXPORT for Cloudflare Pages scheduled functions
export const onCron: PagesFunction<Env> = async ({ env, waitUntil }) => {
    waitUntil(runUpdateTask(env));
    // Scheduled functions in Pages don't return a Response, but we return a simple one to satisfy the type.
    // The platform ignores this response.
    return new Response('Cron task initiated.', { status: 202 });
};
