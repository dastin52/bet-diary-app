// functions/api/matches-with-predictions.ts
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../telegram/matches';
import { Env, SportGame, AIPrediction } from '../telegram/types';
import { GoogleGenAI } from "@google/genai";

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
                const homeTeam = translationMap[game.teams.home.name] || game.teams.home.name;
                const awayTeam = translationMap[game.teams.away.name] || game.teams.away.name;
                const matchName = `${homeTeam} vs ${awayTeam}`;

                const prompt = `Дай краткий прогноз проходимости в процентах для матча по виду спорта "${sport}": ${matchName}. Формат ответа должен быть только таким: "П1 - X%, X - Y%, П2 - Z%". Не добавляй никаких других слов или объяснений.`;
                
                const result = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
                
                const predictionText = result.text.trim();
                 if (!/П1\s*-\s*\d+%\s*,\s*X\s*-\s*\d+%\s*,\s*П2\s*-\s*\d+%/i.test(predictionText)) {
                    console.warn(`AI returned malformed prediction for "${matchName}": ${predictionText}`);
                    return null; // Skip malformed predictions
                }

                return {
                    sport: sport,
                    matchName: matchName,
                    prediction: predictionText,
                };
            } catch (error) {
                console.error(`Failed to get AI prediction for match ID ${game.id}:`, error);
                return null;
            }
        });

        const newPredictions = (await Promise.all(predictionPromises)).filter((p): p is Omit<AIPrediction, 'id'|'createdAt'|'status'> => p !== null);

        const translatedGames = games.map(game => ({
            sport: sport,
            eventName: game.league.name,
            teams: `${translationMap[game.teams.home.name] || game.teams.home.name} vs ${translationMap[game.teams.away.name] || game.teams.away.name}`,
            date: new Date(game.timestamp * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            time: new Date(game.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }),
            isHotMatch: false, 
            status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
        }));

        return new Response(JSON.stringify({ matches: translatedGames, newPredictions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
        });

    } catch (error) {
        console.error('Error in /api/matches-with-predictions:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch matches with predictions.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};
