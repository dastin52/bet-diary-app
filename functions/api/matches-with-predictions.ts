// functions/api/matches-with-predictions.ts
import { Env, SportGame, AIPrediction, AIPredictionStatus } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';

interface EventContext {
    request: Request;
    env: Env;
}

interface SharedPrediction extends SportGame {
  prediction: AIPrediction | null;
}

// TTL for the main cache in seconds (1 hour)
const CACHE_TTL_SECONDS = 3600;

const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'Finished': return '🏁';
        default: return '⏳';
    }
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

function getAiPayloadForSport(sport: string, matchName: string): { prompt: string; schema: any } {
    let outcomes: any;
    let recommendedEnum: string[];
    let promptOutcomes: string;

    switch (sport) {
        case 'basketball':
        case 'nba':
            promptOutcomes = 'П1 (с ОТ), П2 (с ОТ), Тотал Больше 215.5, Тотал Меньше 215.5, Тотал Больше 225.5, Тотал Меньше 225.5';
            outcomes = { "П1 (с ОТ)": { type: Type.NUMBER }, "П2 (с ОТ)": { type: Type.NUMBER }, "Тотал Больше 215.5": { type: Type.NUMBER }, "Тотал Меньше 215.5": { type: Type.NUMBER }, "Тотал Больше 225.5": { type: Type.NUMBER }, "Тотал Меньше 225.5": { type: Type.NUMBER }};
            recommendedEnum = ["П1 (с ОТ)", "П2 (с ОТ)"];
            break;
        case 'hockey':
            promptOutcomes = 'П1 (осн. время), X (осн. время), П2 (осн. время), П1 (с ОТ), П2 (с ОТ), Тотал Больше 5.5, Тотал Меньше 5.5';
            outcomes = { "П1 (осн. время)": { type: Type.NUMBER }, "X (осн. время)": { type: Type.NUMBER }, "П2 (осн. время)": { type: Type.NUMBER }, "П1 (с ОТ)": { type: Type.NUMBER }, "П2 (с ОТ)": { type: Type.NUMBER }, "Тотал Больше 5.5": { type: Type.NUMBER }, "Тотал Меньше 5.5": { type: Type.NUMBER } };
            recommendedEnum = ["П1 (осн. время)", "X (осн. время)", "П2 (осн. время)"];
            break;
        case 'football':
        default:
            promptOutcomes = 'П1, X, П2, 1X, X2, "Тотал Больше 2.5", "Тотал Меньше 2.5", "Обе забьют - Да"';
            outcomes = { "П1": { type: Type.NUMBER }, "X": { type: Type.NUMBER }, "П2": { type: Type.NUMBER }, "1X": { type: Type.NUMBER }, "X2": { type: Type.NUMBER }, "Тотал Больше 2.5": { type: Type.NUMBER }, "Тотал Меньше 2.5": { type: Type.NUMBER }, "Обе забьют - Да": { type: Type.NUMBER } };
            recommendedEnum = ["П1", "X", "П2"];
            break;
    }

    const prompt = `Проанализируй матч по виду спорта "${sport}": ${matchName}. Дай прогноз на вероятность прохода и ПРИМЕРНЫЙ коэффициент для следующих исходов: ${promptOutcomes}. Предоставь ответ ТОЛЬКО в формате JSON. JSON должен содержать три ключа: "probabilities", "coefficients" и "recommended_outcome".
- "probabilities" должен быть объектом, где ключи - это названия исходов, а значения - их вероятности в процентах (число от 0 до 100).
- "coefficients" должен быть объектом, где ключи - это названия исходов, а значения - ПРИМЕРНЫЙ коэффициент для этого исхода (число, например 1.85).
- "recommended_outcome" должен быть строкой, содержащей ОДИН наиболее вероятный исход из списка [${recommendedEnum.map(e => `"${e}"`).join(', ')}].`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            probabilities: { type: Type.OBJECT, properties: outcomes, description: "Вероятности исходов в процентах." },
            coefficients: { type: Type.OBJECT, properties: outcomes, description: "Примерные коэффициенты для исходов." },
            recommended_outcome: { type: Type.STRING, enum: recommendedEnum, description: "Самый вероятный исход из П1/X/П2." }
        },
        required: ["probabilities", "recommended_outcome", "coefficients"]
    };

    return { prompt, schema };
}

export const onRequestGet = async ({ request, env }: EventContext): Promise<Response> => {
    const url = new URL(request.url);
    const sport = url.searchParams.get('sport');
    if (!sport) {
        return new Response(JSON.stringify({ error: 'Sport parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const currentHour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const cacheKey = `central_predictions:${sport}:${currentHour}`;
    
    // 1. Check cache first
    const cachedData = await env.BOT_STATE.get(cacheKey, { type: 'json' });
    if (cachedData) {
        return new Response(JSON.stringify(cachedData), { status: 200, headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
    }

    try {
        // 2. Cache miss: Fetch fresh data
        const games = await getTodaysGamesBySport(sport, env);
        if (games.length === 0) {
            await env.BOT_STATE.put(cacheKey, JSON.stringify([]), { expirationTtl: CACHE_TTL_SECONDS });
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        
        const processedGames: SharedPrediction[] = await Promise.all(games.map(async (game): Promise<SharedPrediction> => {
            const matchName = `${game.teams.home.name} vs ${game.teams.away.name}`;
            let prediction: AIPrediction | null = null;

            if (game.status.short === 'NS') {
                try {
                    const { prompt, schema } = getAiPayloadForSport(sport, matchName);
                    const response = await ai.models.generateContent({
                        model: "gemini-2.5-flash",
                        contents: prompt,
                        config: { responseMimeType: "application/json", responseSchema: schema }
                    });
                    prediction = {
                        id: `${game.id}-${new Date().getTime()}`,
                        createdAt: new Date().toISOString(),
                        sport: sport,
                        matchName: matchName,
                        prediction: response.text,
                        status: AIPredictionStatus.Pending,
                    };
                } catch (error) {
                    console.error(`Failed to get AI prediction for match ID ${game.id}:`, error);
                }
            }

            // Map to frontend-friendly format
            const sharedPredictionData: any = {
                sport: sport,
                eventName: game.league.name,
                teams: matchName,
                date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU'),
                time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
                isHotMatch: false, 
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
        
        // Resolve statuses for predictions on finished games (if any were created in a past hour's cache)
         const resolvedGames = processedGames.map(game => {
            if (game.prediction && game.prediction.status === AIPredictionStatus.Pending && game.winner) {
                 try {
                    const predictionData = JSON.parse(game.prediction.prediction);
                    const recommended = predictionData.recommended_outcome;
                    const outcomeMap: Record<string, 'home' | 'draw' | 'away'> = { 'П1': 'home', 'X': 'draw', 'П2': 'away' };
                    if (outcomeMap[recommended] === game.winner) {
                        game.prediction.status = AIPredictionStatus.Correct;
                    } else {
                         game.prediction.status = AIPredictionStatus.Incorrect;
                    }
                } catch(e) {/* ignore */}
            }
            return game;
         });


        // 3. Store in cache and return
        await env.BOT_STATE.put(cacheKey, JSON.stringify(resolvedGames), { expirationTtl: CACHE_TTL_SECONDS });

        return new Response(JSON.stringify(resolvedGames), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
        });

    } catch (error) {
        console.error('Error in /api/matches-with-predictions:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch matches with predictions.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
