// functions/api/matches-with-predictions.ts
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../telegram/matches';
import { Env, SportGame, AIPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";

interface EventContext {
    request: Request;
    env: Env;
}

const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳';
    switch (status.short) {
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P': case 'LIVE': case 'INTR': return '🔴';
        case 'FT': case 'AET': case 'PEN': case 'POST': case 'CANC': case 'ABD': case 'AWD': case 'WO': return '🏁';
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
    try {
        const url = new URL(request.url);
        const sport = url.searchParams.get('sport');

        if (!sport) {
            return new Response(JSON.stringify({ error: 'Sport parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const games = await getTodaysGamesBySport(sport, env);
        if (games.length === 0) {
            return new Response(JSON.stringify({ matches: [], newPredictions: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        const teamNames = games.flatMap(game => [game?.teams?.home?.name, game?.teams?.away?.name]).filter((name): name is string => !!name);
        const uniqueTeamNames = Array.from(new Set(teamNames));
        const translationMap = await translateTeamNames(uniqueTeamNames, env);
        
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const predictionPromises = games.map(async (game) => {
            try {
                if (game.status.short !== 'NS') return null;

                const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
                const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
                const matchName = `${homeTeam} vs ${awayTeam}`;
                
                const { prompt, schema } = getAiPayloadForSport(sport, matchName);

                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: schema }
                });
                
                return {
                    sport: sport,
                    matchName: matchName,
                    prediction: response.text,
                };
            } catch (error) {
                console.error(`Failed to get AI prediction for match ID ${game.id}:`, error);
                return null;
            }
        });

        const newPredictions = (await Promise.all(predictionPromises)).filter((p): p is Omit<AIPrediction, 'id'|'createdAt'|'status'> => p !== null);

        const translatedGames = games.map(game => {
            const gameData: any = {
                sport: sport,
                eventName: game.league.name,
                teams: `${translationMap[game.teams.home.name] || game.teams.home.name} vs ${translationMap[game.teams.away.name] || game.teams.away.name}`,
                date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
                isHotMatch: false, 
                status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
            };
            
            if (FINISHED_STATUSES.includes(game.status.short) && game.scores && game.scores.home !== null && game.scores.away !== null) {
                gameData.score = `${game.scores.home} - ${game.scores.away}`;
                gameData.scores = { home: game.scores.home, away: game.scores.away };
                 if (sport === 'hockey' || sport === 'basketball' || sport === 'nba') {
                    gameData.winner = game.scores.home > game.scores.away ? 'home' : 'away';
                } else { // Football etc.
                    if (game.scores.home > game.scores.away) gameData.winner = 'home';
                    else if (game.scores.away > game.scores.home) gameData.winner = 'away';
                    else gameData.winner = 'draw';
                }
            }

            return gameData;
        });

        return new Response(JSON.stringify({ matches: translatedGames, newPredictions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        });

    } catch (error) {
        console.error('Error in /api/matches-with-predictions:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch matches with predictions.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};