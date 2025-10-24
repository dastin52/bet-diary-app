// functions/tasks/update-predictions.ts
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';

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
        default:
            promptOutcomes = 'П1, X, П2, 1X, X2, "Тотал Больше 2.5", "Тотал Меньше 2.5", "Обе забьют - Да"';
            outcomes = { "П1": { type: Type.NUMBER }, "X": { type: Type.NUMBER }, "П2": { type: Type.NUMBER }, "1X": { type: Type.NUMBER }, "X2": { type: Type.NUMBER }, "Тотал Больше 2.5": { type: Type.NUMBER }, "Тотал Меньше 2.5": { type: Type.NUMBER }, "Обе забьют - Да": { type: Type.NUMBER } };
            break;
    }

    const prompt = `Проанализируй матч по виду спорта "${sport}": ${matchName}. Дай прогноз на вероятность прохода и ПРИМЕРНЫЙ коэффициент для следующих исходов: ${promptOutcomes}.`;

    const schema = {
        type: Type.OBJECT, properties: {
            probabilities: { type: Type.OBJECT, properties: outcomes },
            coefficients: { type: Type.OBJECT, properties: outcomes },
        }, required: ["probabilities", "coefficients"]
    };

    return { prompt, schema };
};

async function processSport(sport: string, env: Env): Promise<SharedPrediction[]> {
    console.log(`[CRON] Starting processing for sport: ${sport}`);
    let games = await getTodaysGamesBySport(sport, env);
    if (games.length === 0) {
        console.log(`[CRON] No games found for ${sport}.`);
        return [];
    }

    games.sort((a, b) => {
        const priorityA = getStatusPriority(a.status.short);
        const priorityB = getStatusPriority(b.status.short);
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.timestamp - b.timestamp;
    });

    const teamNames = games.flatMap(g => [g?.teams?.home?.name, g?.teams?.away?.name]).filter((n): n is string => !!n);
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
            } catch (error) { console.error(`[CRON] Failed AI prediction for ${matchName}:`, error); }
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
    
    // Store individual sport predictions for potential fallback/specific queries
    await env.BOT_STATE.put(`central_predictions:${sport}`, JSON.stringify(processedGames));
    console.log(`[CRON] Successfully processed and stored ${processedGames.length} predictions for ${sport}.`);
    return processedGames;
}

export const onRequest: (context: EventContext) => Promise<Response> = async ({ env, waitUntil }) => {
    try {
        console.log(`[CRON] Triggered at ${new Date().toISOString()}`);
        const allSportsPredictions = await Promise.all(SPORTS_TO_PROCESS.map(sport => processSport(sport, env)));
        const combinedPredictions = allSportsPredictions.flat();
        
        // Save the combined list to a single key for optimized fetching
        waitUntil(env.BOT_STATE.put('central_predictions:all', JSON.stringify(combinedPredictions)));
        console.log(`[CRON] Successfully stored a combined total of ${combinedPredictions.length} predictions.`);

        console.log('[CRON] All sports processed successfully.');
        return new Response('Cron job executed successfully.', { status: 200 });
    } catch (error) {
        console.error('[CRON] A critical error occurred during execution:', error);
        return new Response('Cron job failed.', { status: 500 });
    }
};