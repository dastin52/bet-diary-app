// functions/telegram/predictions.ts
import { TelegramUpdate, UserState, Env, AIPrediction, AIPredictionStatus } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { SPORTS } from '../constants';

export const PRED_PREFIX = 'aipred|';
const PREDS_PER_PAGE = 5;

const ACTIONS = {
    LIST: 'list',
    FILTER_SPORT: 'fs',
    FILTER_OUTCOME: 'fo',
};

const buildPredCb = (action: string, ...args: (string | number)[]): string => `${PRED_PREFIX}${action}|${args.join('|')}`;

const getStatusEmoji = (status: AIPredictionStatus): string => {
    switch (status) {
        case AIPredictionStatus.Correct: return '✅';
        case AIPredictionStatus.Incorrect: return '❌';
        default: return '⏳';
    }
};

export async function startPredictionLog(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const messageId = update.callback_query ? message.message_id : null;
    await showPredictionLog(message.chat.id, messageId, state, env, 0, 'all', 'all');
}

function calculateStats(predictions: AIPrediction[]) {
    const settled = predictions.filter(p => p.status !== AIPredictionStatus.Pending);
    const correct = settled.filter(p => p.status === AIPredictionStatus.Correct).length;
    const total = settled.length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    return { total, correct, accuracy };
}

async function showPredictionLog(chatId: number, messageId: number | null, state: UserState, env: Env, page: number, sportFilter: string, outcomeFilter: string) {
    const allPredictions = state.aiPredictions || [];
    
    const filteredPredictions = allPredictions.filter(p => {
        const sportMatch = sportFilter === 'all' || p.sport === sportFilter;
        let outcomeMatch = outcomeFilter === 'all';
        if (outcomeFilter !== 'all') {
            try {
                const data = JSON.parse(p.prediction);
                outcomeMatch = data.recommended_outcome === outcomeFilter;
            } catch {
                outcomeMatch = false; // Old format doesn't match
            }
        }
        return sportMatch && outcomeMatch;
    });

    const stats = calculateStats(filteredPredictions);
    let text = `*🔮 База прогнозов AI*\n\n`;
    text += `*Точность (${sportFilter}/${outcomeFilter}):* ${stats.accuracy.toFixed(1)}% (${stats.correct}/${stats.total})\n\n`;

    const totalPages = Math.ceil(filteredPredictions.length / PREDS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const start = currentPage * PREDS_PER_PAGE;
    const end = start + PREDS_PER_PAGE;
    const predsOnPage = filteredPredictions.slice(start, end);

    if (predsOnPage.length > 0) {
        predsOnPage.forEach(p => {
            let recommended = '';
            try {
                const data = JSON.parse(p.prediction);
                recommended = `${data.recommended_outcome} (${data.probabilities[data.recommended_outcome]}%)`;
            } catch {
                recommended = p.prediction.split(',')[0];
            }
            text += `${getStatusEmoji(p.status)} *${p.matchName}*\n`;
            text += `_${p.sport} | ${recommended}_\n\n`;
        });
    } else {
        text += '_Нет прогнозов, соответствующих фильтрам._\n';
    }
    
    const sportButtons = [
        { text: sportFilter === 'all' ? '[Все]' : 'Все', callback_data: buildPredCb(ACTIONS.LIST, 0, 'all', outcomeFilter) },
        ...SPORTS.slice(0, 4).map(s => ({ text: sportFilter === s ? `[${s}]` : s, callback_data: buildPredCb(ACTIONS.LIST, 0, s, outcomeFilter) }))
    ];
    
    const outcomeButtons = [
        { text: outcomeFilter === 'all' ? '[Все исх.]' : 'Все исх.', callback_data: buildPredCb(ACTIONS.LIST, 0, sportFilter, 'all') },
        ...['П1', 'X', 'П2'].map(o => ({ text: outcomeFilter === o ? `[${o}]` : o, callback_data: buildPredCb(ACTIONS.LIST, 0, sportFilter, o) }))
    ];

    const navButtons = [];
    if (currentPage > 0) navButtons.push({ text: '⬅️', callback_data: buildPredCb(ACTIONS.LIST, currentPage - 1, sportFilter, outcomeFilter) });
    if (currentPage < totalPages - 1) navButtons.push({ text: '➡️', callback_data: buildPredCb(ACTIONS.LIST, currentPage + 1, sportFilter, outcomeFilter) });

    const keyboard = makeKeyboard([
        sportButtons,
        outcomeButtons,
        navButtons,
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handlePredictionCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    const [_, action, pageStr, sportFilter, outcomeFilter] = cb.data.split('|');
    const page = parseInt(pageStr) || 0;

    if (action === ACTIONS.LIST) {
        await showPredictionLog(cb.message.chat.id, cb.message.message_id, state, env, page, sportFilter, outcomeFilter);
    }
}