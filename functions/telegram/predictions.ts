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
    ANALYTICS: 'analytics',
};

const buildPredCb = (action: string, ...args: (string | number)[]): string => `${PRED_PREFIX}${action}|${args.join('|')}`;

const getStatusEmoji = (status: AIPredictionStatus): string => {
    switch (status) {
        case AIPredictionStatus.Correct: return '✅';
        case AIPredictionStatus.Incorrect: return '❌';
        default: return '⏳';
    }
};

const resolveMarketOutcome = (market: string, scores: { home: number; away: number }): 'correct' | 'incorrect' | 'unknown' => {
    const { home, away } = scores;
    const total = home + away;

    switch (market) {
        case 'П1': return home > away ? 'correct' : 'incorrect';
        case 'X': return home === away ? 'correct' : 'incorrect';
        case 'П2': return away > home ? 'correct' : 'incorrect';
        case '1X': return home >= away ? 'correct' : 'incorrect';
        case 'X2': return away >= home ? 'correct' : 'incorrect';
        case 'Обе забьют - Да': return home > 0 && away > 0 ? 'correct' : 'incorrect';
        default:
            const totalMatch = market.match(/Тотал (Больше|Меньше) (\d+\.\d+)/);
            if (totalMatch) {
                const type = totalMatch[1];
                const value = parseFloat(totalMatch[2]);
                if (type === 'Больше') return total > value ? 'correct' : 'incorrect';
                if (type === 'Меньше') return total < value ? 'correct' : 'incorrect';
            }
            return 'unknown';
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

async function showDeepAnalytics(chatId: number, messageId: number, state: UserState, env: Env, sportFilter: string) {
    const predictionsToAnalyze = (state.aiPredictions || []).filter(p => 
        p.status !== AIPredictionStatus.Pending && 
        p.matchResult &&
        (sportFilter === 'all' || p.sport === sportFilter)
    );

    const deepAnalyticsData = predictionsToAnalyze.reduce<Record<string, { correct: number, total: number }>>((acc, p) => {
        try {
            const data = JSON.parse(p.prediction);
            if (data.probabilities && p.matchResult) {
                for (const market in data.probabilities) {
                    if (!acc[market]) acc[market] = { correct: 0, total: 0 };
                    const result = resolveMarketOutcome(market, p.matchResult.scores);
                    if (result !== 'unknown') {
                        acc[market].total++;
                        if (result === 'correct') acc[market].correct++;
                    }
                }
            }
        } catch {}
        return acc;
    }, {});

    const sortedAnalytics = Object.entries(deepAnalyticsData)
        .map(([market, data]) => ({
            market,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            count: data.total,
        }))
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);

    let text = `*📊 Глубокая аналитика по исходам*\n`;
    text += `_Фильтр по спорту: ${sportFilter}_\n\n`;

    if (sortedAnalytics.length === 0) {
        text += "_Нет данных для анализа._";
    } else {
        sortedAnalytics.forEach(item => {
            text += `*${item.market}*: ${item.accuracy.toFixed(1)}% (${item.count} оценок)\n`;
        });
    }

    const keyboard = makeKeyboard([
        [{ text: '◀️ Назад к списку', callback_data: buildPredCb(ACTIONS.LIST, 0, sportFilter, 'all') }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}


async function showPredictionLog(chatId: number, messageId: number | null, state: UserState, env: Env, page: number, sportFilter: string, outcomeFilter: string) {
    const allPredictions = state.aiPredictions || [];
    
    const filteredPredictions = allPredictions.filter(p => {
        const sportMatch = sportFilter === 'all' || p.sport === sportFilter;
        let outcomeMatch = outcomeFilter === 'all';
        if (outcomeFilter !== 'all') {
            try {
                const data = JSON.parse(p.prediction);
                outcomeMatch = (data.recommended_outcome === outcomeFilter) || (outcomeFilter in data.probabilities);
            } catch {
                outcomeMatch = false;
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
    
    const availableOutcomes = Array.from(new Set(allPredictions.flatMap(p => {
        try { return Object.keys(JSON.parse(p.prediction).probabilities) } catch { return [] }
    }))).sort();

    const outcomeButtons = [
        { text: outcomeFilter === 'all' ? '[Все исх.]' : 'Все исх.', callback_data: buildPredCb(ACTIONS.LIST, 0, sportFilter, 'all') },
        ...['П1', 'X', 'П2'].map(o => ({ text: outcomeFilter === o ? `[${o}]` : o, callback_data: buildPredCb(ACTIONS.LIST, 0, sportFilter, o) }))
    ];

    const navButtons = [];
    if (currentPage > 0) navButtons.push({ text: '⬅️', callback_data: buildPredCb(ACTIONS.LIST, currentPage - 1, sportFilter, outcomeFilter) });
    if (totalPages > 1) navButtons.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'noop' });
    if (currentPage < totalPages - 1) navButtons.push({ text: '➡️', callback_data: buildPredCb(ACTIONS.LIST, currentPage + 1, sportFilter, outcomeFilter) });

    const keyboard = makeKeyboard([
        sportButtons,
        outcomeButtons,
        navButtons,
        [{ text: '📊 Глубокая аналитика', callback_data: buildPredCb(ACTIONS.ANALYTICS, 0, sportFilter, 'all') }],
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

    switch (action) {
        case ACTIONS.LIST:
            await showPredictionLog(cb.message.chat.id, cb.message.message_id, state, env, page, sportFilter, outcomeFilter);
            break;
        case ACTIONS.ANALYTICS:
            await showDeepAnalytics(cb.message.chat.id, cb.message.message_id, state, env, sportFilter);
            break;
    }
}