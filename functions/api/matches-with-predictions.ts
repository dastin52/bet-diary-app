// functions/api/matches-with-predictions.ts
// FIX: Import SharedPrediction from the central types file.
import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';

interface EventContext {
    request: Request;
    env: Env;
}

// TTL for the main cache in seconds (1 hour)
const CACHE_TTL_SECONDS = 3600;

const getStatusPriority = (statusShort: string): number => {
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    const scheduled = ['NS', 'TBD'];
    if (live.includes(statusShort)) return 1;
    if (scheduled.includes(statusShort)) return 2;
    return 3; // Finished, Postponed, etc.
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

const resolveMarketOutcome = (market: string, scores: { home: number; away: number }, winner: 'home' | 'away' | 'draw'): 'correct' | 'incorrect' | 'unknown' => {
    const { home, away } = scores;
    const total = home + away;

    switch (true) {
        // Winner markets (main time)
        case market === 'П1':
        case market === 'П1 (осн. время)':
            return (home > away) ? 'correct' : 'incorrect';
        case market === 'X':
        case market === 'X (осн. время)':
            return home === away ? 'correct' : 'incorrect';
        case market === 'П2':
        case market === 'П2 (осн. время)':
            return (away > home) ? 'correct' : 'incorrect';
        
        // Winner markets (including OT/SO)
        case market.startsWith('П1'):
            return winner === 'home' ? 'correct' : 'incorrect';
        case market.startsWith('П2'):
            return winner === 'away' ? 'correct' : 'incorrect';

        // Double chance
        case market === '1X': return home >= away ? 'correct' : 'incorrect';
        case market === 'X2': return away >= home ? 'correct' : 'incorrect';
        case market === '12': return home !== away ? 'correct' : 'incorrect';

        // Both teams to score
        case market === 'Обе забьют - Да': return home > 0 && away > 0 ? 'correct' : 'incorrect';
        case market === 'Обе забьют - Нет': return home === 0 || away === 0 ? 'correct' : 'incorrect';
        
        // Totals
        case market.includes('Тотал Больше'): {
            const value = parseFloat(market.split(' ')[2]);
            return !isNaN(value) && total > value ? 'correct' : 'incorrect';
        }
        case market.includes('Тотал Меньше'): {
            const value = parseFloat(market.split(' ')[2]);
            return !isNaN(value) && total < value ? 'correct' : 'incorrect';
        }
        
        default:
            return 'unknown';
    }
};


function getAiPayloadForSport(sport: string, matchName: string): { prompt: string; schema: any } {
    let outcomes: any;
    let promptOutcomes: string;

    switch (sport) {
        case 'basketball':
        case 'nba':
            promptOutcomes = 'П1 (с ОТ), П2 (с ОТ), Тотал Больше 215.5, Тотал Меньше 215.5, Тотал Больше 225.5, Тотал Меньше 225.5';
            outcomes = { "П1 (с ОТ)": { type: Type.NUMBER }, "П2 (с ОТ)": { type: Type.NUMBER }, "Тотал Больше 215.5": { type: Type.NUMBER }, "Тотал Меньше 215.5": { type: Type.NUMBER }, "Тотал Больше 225.5": { type: Type.NUMBER }, "Тотал Меньше 225.5": { type: Type.NUMBER }};
            break;
        case 'hockey':
            promptOutcomes = 'П1 (осн. время), X (осн. время), П2 (осн. время), П1 (вкл. ОТ и буллиты), П2 (вкл. ОТ и буллиты), Тотал Больше 5.5, Тотал Меньше 5.5';
            outcomes = { "П1 (осн. время)": { type: Type.NUMBER }, "X (осн. время)": { type: Type.NUMBER }, "П2 (осн. время)": { type: Type.NUMBER }, "П1 (вкл. ОТ и буллиты)": { type: Type.NUMBER }, "П2 (вкл. ОТ и буллиты)": { type: Type.NUMBER }, "Тотал Больше 5.5": { type: Type.NUMBER }, "Тотал Меньше 5.5": { type: Type.NUMBER } };
            break;
        case 'football':
        default:
            promptOutcomes = 'П1, X, П2, 1X, X2, "Тотал Больше 2.5", "Тотал Меньше 2.5", "Обе забьют - Да"';
            outcomes = { "П1": { type: Type.NUMBER }, "X": { type: Type.NUMBER }, "П2": { type: Type.NUMBER }, "1X": { type: Type.NUMBER }, "X2": { type: Type.NUMBER }, "Тотал Больше 2.5": { type: Type.NUMBER }, "Тотал Меньше 2.5": { type: Type.NUMBER }, "Обе забьют - Да": { type: Type.NUMBER } };
            break;
    }

    const prompt = `Проанализируй матч по виду спорта "${sport}": ${matchName}. Дай прогноз на вероятность прохода и ПРИМЕРНЫЙ коэффициент для следующих исходов: ${promptOutcomes}. Предоставь ответ ТОЛЬКО в формате JSON. JSON должен содержать два ключа: "probabilities" и "coefficients".
- "probabilities" должен быть объектом, где ключи - это названия исходов, а значения - их вероятности в процентах (число от 0 до 100).
- "coefficients" должен быть объектом, где ключи - это названия исходов, а значения - ПРИМЕРНЫЙ коэффициент для этого исхода (число, например 1.85).`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            probabilities: { type: Type.OBJECT, properties: outcomes, description: "Вероятности исходов в процентах." },
            coefficients: { type: Type.OBJECT, properties: outcomes, description: "Примерные коэффициенты для исходов." },
        },
        required: ["probabilities", "coefficients"]
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
        let games = await getTodaysGamesBySport(sport, env);
        if (games.length === 0) {
            await env.BOT_STATE.put(cacheKey, JSON.stringify([]), { expirationTtl: CACHE_TTL_SECONDS });
            return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        
        // Sort games: Live > Scheduled > Finished
        games.sort((a, b) => {
            const priorityA = getStatusPriority(a.status.short);
            const priorityB = getStatusPriority(b.status.short);
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            return a.timestamp - b.timestamp;
        });

        const teamNames = games.flatMap(game => [game?.teams?.home?.name, game?.teams?.away?.name]).filter((name): name is string => !!name);
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
                        let bestOutcome = '';
                        let maxValue = -Infinity;

                        const probabilities = predictionData.probabilities;
                        const coefficients = predictionData.coefficients;

                        if (probabilities && coefficients) {
                            for (const outcome in probabilities) {
                                if (Object.prototype.hasOwnProperty.call(probabilities, outcome) && Object.prototype.hasOwnProperty.call(coefficients, outcome)) {
                                    const probability = parseFloat(probabilities[outcome]);
                                    const coefficient = parseFloat(coefficients[outcome]);

                                    if (!isNaN(probability) && !isNaN(coefficient) && coefficient > 1) {
                                        const value = (probability / 100) * coefficient - 1;
                                        if (value > maxValue) {
                                            maxValue = value;
                                            bestOutcome = outcome;
                                        }
                                    }
                                }
                            }
                        }
                        
                        predictionData.recommended_outcome = bestOutcome || 'Нет выгодной ставки';

                        prediction = {
                            id: `${game.id}-${new Date().getTime()}`,
                            createdAt: new Date().toISOString(),
                            sport: sport,
                            matchName: matchName,
                            prediction: JSON.stringify(predictionData),
                            status: AIPredictionStatus.Pending,
                        };
                    } else {
                        console.warn(`AI did not return 'probabilities' for match ID ${game.id}. Skipping prediction.`);
                    }
                } catch (error) {
                    console.error(`Failed to get AI prediction for match ID ${game.id}:`, error);
                }
            }

            const sharedPredictionData: any = {
                ...game, 
                sport: sport,
                eventName: game.league.name,
                teams: matchName,
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
        
        const resolvedGames = processedGames.map(game => {
            if (game.prediction && game.prediction.status === AIPredictionStatus.Pending && game.winner && game.scores) {
                 try {
                    const predictionData = JSON.parse(game.prediction.prediction);
                    const recommended = predictionData.recommended_outcome;
                    
                    const result = resolveMarketOutcome(recommended, game.scores, game.winner);

                    if (result !== 'unknown') {
                        game.prediction.status = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                        game.prediction.matchResult = { winner: game.winner, scores: game.scores };
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