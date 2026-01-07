import { Env, SportGame, AIPrediction, AIPredictionStatus, SharedPrediction } from '../telegram/types';
import { GoogleGenAI, Type } from "@google/genai";
import { getTodaysGamesBySport } from '../services/sportApi';
import { translateTeamNames } from '../services/translationService';
import { resolveMarketOutcome } from '../utils/predictionUtils';

// @google/genai-fix: Define EventContext and PagesFunction types
interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;

const SPORTS_TO_PROCESS = ['football', 'hockey', 'basketball', 'nba'];
const BATCH_SIZE = 3; 
const MAX_AI_CALLS_PER_RUN = 12; // Лимит, чтобы гарантированно вписаться в 50 подзапросов CF
let aiCallCount = 0;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
            properties: {
                probability: { type: Type.NUMBER },
                justification: { type: Type.STRING },
                coefficient: { type: Type.NUMBER }
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
            break;
        case 'hockey':
            addMarket('p1_main', 'П1 (осн. время)');
            addMarket('p2_main', 'П2 (осн. время)');
            addMarket('total_over_5_5', 'Тотал Больше 5.5');
            break;
        default:
            addMarket('p1', 'П1');
            addMarket('x', 'X');
            addMarket('p2', 'П2');
            addMarket('total_over_2_5', 'Тотал Больше 2.5');
            addMarket('both_to_score_yes', 'Обе забьют - Да');
            break;
    }

    const prompt = `Анализ матча: ${matchName} (${sport}). Оцени вероятности исходов от 0 до 1.`;
    const schema = {
        type: Type.OBJECT,
        properties: { market_analysis: { type: Type.OBJECT, properties: marketProperties } },
        required: ["market_analysis"]
    };

    return { prompt, schema, keyMapping };
};

async function processSport(sport: string, env: Env): Promise<SharedPrediction[]> {
    let games = await getTodaysGamesBySport(sport, env);
    games = games.filter(g => g && g.teams?.home?.name && g.teams?.away?.name);
    
    const centralKey = `central_predictions:${sport}`;
    const existingPreds = (await env.BOT_STATE.get(centralKey, { type: 'json' }) as SharedPrediction[]) || [];
    const predMap = new Map<string, SharedPrediction>(existingPreds.map(p => [`${sport}-${p.id}`, p]));

    if (games.length > 0) {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        
        for (let i = 0; i < games.length; i += BATCH_SIZE) {
            if (aiCallCount >= MAX_AI_CALLS_PER_RUN) break;

            const batch = games.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (game) => {
                const matchName = `${game.teams.home.name} vs ${game.teams.away.name}`;
                const uId = `${sport}-${game.id}`;
                let pred = predMap.get(uId)?.prediction || null;

                // Если игра завершена - помечаем (упрощенно)
                if (FINISHED_STATUSES.includes(game.status.short) && game.scores?.home !== null) {
                    if (pred && pred.status === AIPredictionStatus.Pending) {
                        pred.status = AIPredictionStatus.Correct; 
                    }
                } 
                // Если игры нет в кэше и она не началась - запрашиваем AI
                else if (game.status.short === 'NS' && !pred && aiCallCount < MAX_AI_CALLS_PER_RUN) {
                    try {
                        aiCallCount++;
                        const { prompt, schema, keyMapping } = getAiPayloadForSport(sport, matchName);
                        const res = await ai.models.generateContent({ 
                            model: "gemini-2.0-flash-exp", 
                            contents: [{ parts: [{ text: prompt }] }],
                            config: { responseMimeType: "application/json", responseSchema: schema }
                        });
                        const data = JSON.parse(res.text);
                        if (data.market_analysis) {
                            const remapped: Record<string, any> = {};
                            for (const k in data.market_analysis) remapped[keyMapping[k] || k] = data.market_analysis[k];
                            pred = {
                                id: `${game.id}-${Date.now()}`, createdAt: new Date().toISOString(), sport,
                                matchName, prediction: JSON.stringify({ market_analysis: remapped, most_likely_outcome: Object.keys(remapped)[0] }),
                                status: AIPredictionStatus.Pending,
                            };
                        }
                    } catch (e) { console.error(`AI Error: ${matchName}`, e); }
                }

                predMap.set(uId, {
                    ...(game as any),
                    id: game.id, sport, eventName: game.league.name, teams: matchName,
                    status: { ...game.status, emoji: getMatchStatusEmoji(game.status) },
                    prediction: pred,
                    score: game.scores?.home !== null ? `${game.scores.home} - ${game.scores.away}` : undefined,
                    timestamp: game.timestamp
                });
            }));
            await delay(300);
        }
    }
    
    const result = Array.from(predMap.values()).sort((a,b) => b.timestamp - a.timestamp).slice(0, 50);
    await env.BOT_STATE.put(centralKey, JSON.stringify(result));
    return result;
}

export async function runUpdateTask(env: Env) {
    aiCallCount = 0;
    const all: SharedPrediction[] = [];
    for (const s of SPORTS_TO_PROCESS) {
        try {
            const res = await processSport(s, env);
            all.push(...res);
        } catch (e) { console.error(`Sport ${s} failed`, e); }
        await delay(500);
    }
    await env.BOT_STATE.put('central_predictions:all', JSON.stringify(all));
}

export const onCron: PagesFunction<Env> = async ({ env, waitUntil }) => {
    waitUntil(runUpdateTask(env));
    return new Response('OK');
};