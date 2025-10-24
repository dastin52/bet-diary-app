// functions/telegram/matches.ts
import { TelegramUpdate, UserState, Env, SportGame, AIPredictionStatus, AIPrediction, SharedPrediction } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { getTodaysGamesBySport } from '../services/sportApi';
import { GoogleGenAI } from "@google/genai";
import { updateAndSyncState } from './state';
import { translateTeamNames } from '../services/translationService';

export const MATCH_PREFIX = 'match|';
export const MATCH_SPORT_PREFIX = 'match_sport|';

const LEAGUES_PER_PAGE = 5;

const ACTIONS = {
    LIST: 'list',
    SELECT_SPORT: 'select_sport',
};

const buildMatchCb = (sport: string, action: string, page: number) => `${MATCH_PREFIX}${sport}|${action}|${page}`;
const buildSportSelectionCb = (sport: string) => `${MATCH_SPORT_PREFIX}${sport}`;

const AVAILABLE_SPORTS = [
    { key: 'hockey', label: '🏒 Хоккей' },
    { key: 'football', label: '⚽️ Футбол' },
    { key: 'basketball', label: '🏀 Баскетбол' },
    { key: 'nba', label: '🏀 NBA' },
];

const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];


/**
 * Returns an emoji based on the match status short code.
 */
const getMatchStatusEmoji = (status: { short: string } | undefined): string => {
    if (!status) return '⏳'; // Default to scheduled/unknown

    switch (status.short) {
        // Live statuses
        case '1H': case 'HT': case '2H': case 'ET': case 'BT': case 'P':  case 'LIVE': case 'INTR':
            return '🔴'; // Live
        // Finished statuses
        case 'FT': case 'AET': case 'PEN': case 'Finished': case 'POST': case 'CANC': case 'ABD':  case 'AWD': case 'WO':
            return '🏁'; // Finished or Concluded
        // Scheduled statuses
        case 'NS': case 'TBD':
        default:
            return '⏳'; // Scheduled
    }
};

export async function resolvePredictionsInState(state: UserState, finishedMatches: SportGame[], translationMap: Record<string,string>): Promise<UserState> {
    if (finishedMatches.length === 0) return state;

    let hasChanged = false;
    const updatedPredictions = state.aiPredictions.map(p => {
        if (p.status !== AIPredictionStatus.Pending) return p;

        const match = finishedMatches.find(m => {
             const homeTeam = translationMap[m.teams.home.name] || m.teams.home.name;
             const awayTeam = translationMap[m.teams.away.name] || m.teams.away.name;
             const matchName = `${homeTeam} vs ${awayTeam}`;
             return p.matchName === matchName;
        });
        
        if (!match || !match.scores || match.scores.home === null || match.scores.away === null) return p;

        let recommendedOutcome: string | null = null;
        try {
            const predictionData = JSON.parse(p.prediction);
            recommendedOutcome = predictionData?.recommended_outcome || null;
        } catch (e) {
            console.warn(`Could not parse prediction JSON for "${p.matchName}"`);
        }
        
        if (!recommendedOutcome) return p;

        const winner: 'home' | 'away' | 'draw' = match.scores.home > match.scores.away ? 'home' : match.scores.away > match.scores.home ? 'away' : 'draw';
        const outcomeMap: Record<string, 'home' | 'draw' | 'away'> = { 'П1': 'home', 'X': 'draw', 'П2': 'away', 'П1 (осн. время)': 'home', 'X (осн. время)': 'draw', 'П2 (осн. время)': 'away' };
        const aiWinner = outcomeMap[recommendedOutcome];
        
        if (!aiWinner) return p;
        
        hasChanged = true;
        const newStatus = aiWinner === winner ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;

        return { 
            ...p, 
            status: newStatus,
            matchResult: { winner, scores: { home: match.scores.home, away: match.scores.away } }
        };
    });

    return hasChanged ? { ...state, aiPredictions: updatedPredictions } : state;
}



export async function handleMatchesCommand(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    await showSportSelectionMenu(message.chat.id, message.message_id, env);
}

export async function handleSportSelectionCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;
    const sport = cb.data.replace(MATCH_SPORT_PREFIX, '');
    await showMatchesList(cb.message.chat.id, cb.message.message_id, state, env, sport, 0);
}

export async function handleMatchesCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    const [_, sport, action, pageStr] = cb.data.split('|');
    const page = parseInt(pageStr) || 0;

    if (action === ACTIONS.LIST) {
        await showMatchesList(cb.message.chat.id, cb.message.message_id, state, env, sport, page);
    }
}

export async function showSportSelectionMenu(chatId: number, messageId: number, env: Env) {
    const text = "Выберите вид спорта для просмотра матчей:";
    const sportButtons = AVAILABLE_SPORTS.map(sport => ({
        text: sport.label,
        callback_data: buildSportSelectionCb(sport.key),
    }));
    const keyboard = makeKeyboard([
        sportButtons,
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}


async function showMatchesList(chatId: number, messageId: number | null, state: UserState, env: Env, sport: string, page: number) {
    let loadingMessageId = messageId;
    
    try {
        const sportLabel = AVAILABLE_SPORTS.find(s => s.key === sport)?.label || sport;
        if (loadingMessageId) {
            await editMessageText(chatId, loadingMessageId, `Загружаю актуальные матчи... (${sportLabel})`, env);
        } else {
            const sentMessage = await sendMessage(chatId, `Загружаю актуальные матчи... (${sportLabel})`, env);
            loadingMessageId = sentMessage.result.message_id;
        }

        const centralPredictionsKey = `central_predictions:${sport}`;
        const games = await env.BOT_STATE.get(centralPredictionsKey, { type: 'json' }) as SharedPrediction[] | null;

        if (!games || games.length === 0) {
            const text = `На сегодня матчей по виду спорта "${sportLabel}" не найдено или они еще генерируются. Попробуйте через минуту.`;
            const keyboard = makeKeyboard([[{ text: '◀️ Назад к выбору спорта', callback_data: CB.MATCHES }], [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
            if (loadingMessageId) await editMessageText(chatId, loadingMessageId, text, env, keyboard);
            return;
        }
        
        const gamesByLeague = games.reduce((acc, game) => {
            const leagueName = game.league.name || 'Неизвестная лига';
            if (!acc[leagueName]) acc[leagueName] = [];
            acc[leagueName].push(game);
            return acc;
        }, {} as Record<string, SharedPrediction[]>);

        const leagues = Object.keys(gamesByLeague);
        const totalPages = Math.ceil(leagues.length / LEAGUES_PER_PAGE);
        const currentPage = Math.max(0, Math.min(page, totalPages - 1));
        const start = currentPage * LEAGUES_PER_PAGE;
        const end = start + LEAGUES_PER_PAGE;
        const leaguesOnPage = leagues.slice(start, end);
        
        const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        let text = `*${sportLabel} на сегодня (${today})*\n\n`;

        leaguesOnPage.forEach(leagueName => {
            text += `*🏆 ${leagueName}*\n`;
            gamesByLeague[leagueName].forEach(game => {
                const gameTime = game.time;
                // FIX: Use the helper function to get the emoji, as the property doesn't exist on the base type.
                const statusEmoji = getMatchStatusEmoji(game.status);
                const matchName = game.teams;
                // FIX: Use optional chaining on `game.score` as it's an optional property.
                const scoreText = game.score ? ` *[${game.score}]*` : '';
                
                let predictionText = '';
                const prediction = game.prediction;
                if (prediction) {
                    try {
                        const data = JSON.parse(prediction.prediction);
                        predictionText = ` _AI: ${data.recommended_outcome} (${data.probabilities[data.recommended_outcome]}%)_`;
                    } catch {}
                }

                text += `${statusEmoji} *${gameTime}* - ${matchName}${scoreText}${predictionText}\n`;
            });
            text += '\n';
        });

        const navButtons = [];
        if (currentPage > 0) navButtons.push({ text: '⬅️ Пред.', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage - 1) });
        if (currentPage < totalPages - 1) navButtons.push({ text: 'След. ➡️', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage + 1) });

        const keyboard = makeKeyboard([
            navButtons,
            [
                { text: '🔄 Обновить', callback_data: buildMatchCb(sport, ACTIONS.LIST, currentPage) },
                { text: '◀️ К выбору спорта', callback_data: CB.MATCHES }
            ],
            [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
        ]);

        if(loadingMessageId) await editMessageText(chatId, loadingMessageId, text, env, keyboard);

    } catch (error) {
        console.error("Error in showMatchesList:", error);
        const userFriendlyError = `🚫 Произошла ошибка при загрузке матчей. Попробуйте позже.`;
        const keyboard = makeKeyboard([[{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]);
        if (loadingMessageId) await editMessageText(chatId, loadingMessageId, userFriendlyError, env, keyboard);
    }
}