// functions/api/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';


interface ApiProxyRequest {
    endpoint: string;
    payload: any;
}

interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;

// --- Логика из фоновой задачи для генерации по требованию ---

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

const getAiPayloadForSport = (sport: string, matchName: string): { prompt: string; schema: any } => {
    let outcomes: any;
    let promptOutcomes: string;

    switch (sport) {
        case 'basketball': case 'nba':
            promptOutcomes = 'П1 (с ОТ), П2 (с ОТ), Тотал Больше 215.5, Тотал Меньше 215.5, Тотал Больше 225.5, Тотал Меньше 225.5';
            outcomes = { "П1 (с ОТ)": { type: Type.NUMBER }, "П2 (с ОТ)": { type: Type.NUMBER }, "Тотал Больше 215.5": { type: Type.NUMBER }, "Тотал Меньше 215.5": { type: Type.NUMBER }, "Тотал Больше 225.5": { type: Type.NUMBER }, "Тотал Меньше 225.5": { type: Type.NUMBER }};
            break;
        case 'hockey':
            promptOutcomes = 'П1 (осн. время), X (осн. время), П2 (осн. время), П1 (вкл. ОТ и буллиты), П2 (вкл. ОТ и буллиты), Тотал Больше 5.5, Тотал Меньше 5.5';
            outcomes = { "П1 (осн. время)": { type: Type.NUMBER }, "X (осн. время)": { type: Type.NUMBER }, "П2 (осн. время)": { type: Type.NUMBER }, "П1 (вкл. ОТ и буллиты)": { type: Type.NUMBER }, "П2 (вкл. ОТ и буллиты)": { type: Type.NUMBER }, "Тотал Больше 5.5": { type: Type.NUMBER }, "Тотал Меньше 5.5": { type: Type.NUMBER } };
            break;
        default: // football
            promptOutcomes = 'П1, X, П2, 1X, X2, "Тотал Больше 2.5", "Тотал Меньше 2.5", "Обе забьют - Да"';
            outcomes = { "П1": { type: Type.NUMBER }, "X": { type: Type.NUMBER }, "П2": { type: Type.NUMBER }, "1X": { type: Type.NUMBER }, "X2": { type: Type.NUMBER }, "Тотал Больше 2.5": { type: Type.NUMBER }, "Тотал Меньше 2.5": { type: Type.NUMBER }, "Обе забьют - Да": { type: Type.NUMBER } };
            break;
    }

    const prompt = `Сгенерируй JSON с вероятностями и коэффициентами для спортивного матча: вид спорта - "${sport}", матч - "${matchName}".`;

    const schema = {
        type: Type.OBJECT, properties: {
            probabilities: { type: Type.OBJECT, properties: outcomes, description: "Вероятности исходов в процентах." },
            coefficients: { type: Type.OBJECT, properties: outcomes, description: "Примерные коэффициенты для исходов." },
        }, required: ["probabilities", "coefficients"]
    };

    return { prompt, schema };
};

async function generatePredictionsForSport(sport: string, env: Env): Promise<SharedPrediction[]> {
    console.log(`[API On-Demand] Starting processing for sport: ${sport}`);
    let games = await getTodaysGamesBySport(sport, env);
    if (games.length === 0) {
        console.log(`[API On-Demand] No games found for ${sport}.`);
        return [];
    }

    games.sort((a, b) => {
        const priorityA = getStatusPriority(a.status.short);
        const priorityB = getStatusPriority(b.status.short);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.timestamp - b.timestamp;
    });

    const teamNames = games.flatMap(g => [g.teams.home.name, g.teams.away.name]).filter((n): n is string => !!n);
    const uniqueTeamNames = Array.from(new Set(teamNames));
    const translationMap = await translateTeamNames(uniqueTeamNames, env);

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    const processedGames: SharedPrediction[] = await Promise.all(games.map(async (game): Promise<SharedPrediction> => {
        const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
        const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
        const matchName = `${homeTeam} vs ${awayTeam}`;
        let prediction: AIPrediction | null = null;

        if (game.status.short === 'NS') {
            try {
                const { prompt, schema } = getAiPayloadForSport(sport, matchName);
                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: schema }
                });
                const predictionData = JSON.parse(response.text);

                if (predictionData && predictionData.probabilities) {
                    let bestOutcome = ''; let maxValue = -Infinity;
                    for (const outcome in predictionData.probabilities) {
                        const prob = parseFloat(predictionData.probabilities[outcome]);
                        const coeff = parseFloat(predictionData.coefficients[outcome]);
                        if (!isNaN(prob) && !isNaN(coeff) && coeff > 1) {
                            const value = (prob / 100) * coeff - 1;
                            if (value > maxValue) { maxValue = value; bestOutcome = outcome; }
                        }
                    }
                    predictionData.recommended_outcome = bestOutcome || 'Нет выгодной ставки';

                    prediction = {
                        id: `${game.id}-${new Date().getTime()}`, createdAt: new Date().toISOString(), sport: sport,
                        matchName: matchName, prediction: JSON.stringify(predictionData), status: AIPredictionStatus.Pending,
                    };
                }
            } catch (error) { console.error(`[API On-Demand] Failed AI prediction for ${matchName}:`, error); }
        }

        const sharedPredictionData: any = {
            ...game, sport: sport, eventName: game.league.name, teams: matchName,
            date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU'),
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            prediction: prediction
        };

        if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null && game.scores.away !== null) {
            sharedPredictionData.score = `${game.scores.home} - ${game.scores.away}`;
            sharedPredictionData.scores = { home: game.scores.home, away: game.scores.away };
            if (game.scores.home > game.scores.away) sharedPredictionData.winner = 'home';
            else if (game.scores.away > game.scores.home) sharedPredictionData.winner = 'away';
            else sharedPredictionData.winner = 'draw';
        }
        return sharedPredictionData;
    }));

    return processedGames;
}

// Helper function to generate all predictions on-demand if the main cache is missed.
async function generateAllPredictions(env: Env): Promise<SharedPrediction[]> {
    console.warn(`[API On-Demand] Generating predictions for ALL sports due to cache miss.`);
    const allSportsPredictions = await Promise.all(
        ['football', 'hockey', 'basketball', 'nba'].map(sport => generatePredictionsForSport(sport, env))
    );
    return allSportsPredictions.flat();
}


export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
    try {
        const body = await request.json() as ApiProxyRequest;
        const { endpoint, payload } = body;

        if (!env.GEMINI_API_KEY) {
            return new Response(JSON.stringify({ error: 'API Key for Gemini is not configured on the server.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        let responseData;
        
        switch (endpoint) {
             case 'getAllPredictions': {
                const cacheKey = 'central_predictions:all';
                const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });

                if (cachedData) {
                    return new Response(JSON.stringify(cachedData), {
                        status: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
                    });
                }

                // Fallback: if the main cache is missing, generate everything on the fly.
                const predictions = await generateAllPredictions(env);
                // Store the result in the cache for next time.
                waitUntil(env.BOT_STATE.put(cacheKey, JSON.stringify(predictions)));

                responseData = predictions;
                break;
            }
            case 'getMatchesWithPredictions': {
                const { sport } = payload;
                 if (!sport) {
                    return new Response(JSON.stringify({ error: 'Sport parameter is required' }), {
                        status: 400, headers: { 'Content-Type': 'application/json' },
                    });
                }
                const cacheKey = `central_predictions:${sport}`;
                const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });

                if (cachedData) {
                    return new Response(JSON.stringify(cachedData), {
                        status: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
                    });
                }
                
                console.warn(`[API] Cache MISS for sport: ${sport}. Generating predictions on-demand.`);
                const predictions = await generatePredictionsForSport(sport, env);

                waitUntil(env.BOT_STATE.put(cacheKey, JSON.stringify(predictions)));

                responseData = predictions;
                break;
            }
            case 'generateContent':
            default:
                const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
                const result = await ai.models.generateContent(payload);
                responseData = { 
                    text: result.text, 
                    sources: result.candidates?.[0]?.groundingMetadata?.groundingChunks 
                };
                break;
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Cloudflare Function error:', error);
        return new Response(JSON.stringify({ error: 'An error occurred in the serverless function.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};