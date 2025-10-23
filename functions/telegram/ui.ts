// functions/telegram/ui.ts
import { Env } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { CB, buildStatsCb } from './router';
import { AnalyticsPeriod } from './analytics';

export const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

export async function showMainMenu(chatId: number, messageId: number | null, env: Env, text?: string) {
    const messageText = text || '👋 Чем могу помочь?';
    const keyboard = makeKeyboard([
        [
            { text: '📊 Статистика', callback_data: CB.SHOW_STATS },
            { text: '📝 Добавить ставку', callback_data: CB.ADD_BET },
        ],
        [
            { text: '🏆 Соревнования', callback_data: CB.COMPETITIONS },
            { text: '🎯 Мои цели', callback_data: CB.GOALS }
        ],
        [
            { text: '📈 Управление ставками', callback_data: CB.MANAGE_BETS },
            { text: '🏒 Актуальные матчи', callback_data: CB.MATCHES }
        ],
        [
            { text: '🤖 AI-Аналитик', callback_data: CB.AI_CHAT },
            { text: '🔮 База прогнозов AI', callback_data: CB.AI_PREDICTIONS }
        ]
    ]);
    if (messageId) {
        try {
            await editMessageText(chatId, messageId, messageText, env, keyboard);
        } catch (e) {
            await sendMessage(chatId, messageText, env, keyboard);
        }
    } else {
        await sendMessage(chatId, messageText, env, keyboard);
    }
}

const periodLabels: Record<AnalyticsPeriod, string> = {
    week: 'Неделя',
    month: 'Месяц',
    quarter: 'Квартал',
    year: 'Год',
    all_time: 'Все время',
};

export async function showStatsMenu(chatId: number, messageId: number | null, text: string, currentPeriod: AnalyticsPeriod, env: Env) {
    
    const periodButtonsRow1 = (['week', 'month', 'quarter'] as AnalyticsPeriod[]).map(p => ({
        text: currentPeriod === p ? `[ ${periodLabels[p]} ]` : periodLabels[p],
        callback_data: buildStatsCb('show', p)
    }));

    const periodButtonsRow2 = (['year', 'all_time'] as AnalyticsPeriod[]).map(p => ({
        text: currentPeriod === p ? `[ ${periodLabels[p]} ]` : periodLabels[p],
        callback_data: buildStatsCb('show', p)
    }));

    const keyboard = makeKeyboard([
        periodButtonsRow1,
        periodButtonsRow2,
        [
            { text: '📝 Подробный отчет', callback_data: buildStatsCb('detailed', currentPeriod) },
            { text: '📥 Скачать HTML', callback_data: buildStatsCb('download', currentPeriod) }
        ],
        [{ text: '⬅️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    const titleText = text; // Main text now includes period

    if (messageId) {
         await editMessageText(chatId, messageId, titleText, env, keyboard);
    } else {
        await sendMessage(chatId, titleText, env, keyboard);
    }
}