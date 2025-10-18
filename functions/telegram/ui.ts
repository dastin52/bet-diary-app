// functions/telegram/ui.ts
import { Env, TelegramUpdatePayload } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { CB } from './router';

export const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

export async function showMainMenu(chatId: number, messageId: number | null, env: Env, text?: string) {
    const messageText = text || '👋 Привет! Чем могу помочь?';
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
        ],
        [
             { text: '🤖 AI-Аналитик', callback_data: CB.AI_CHAT }
        ]
    ]);
    if (messageId) {
        try {
            await editMessageText(chatId, messageId, messageText, env, keyboard);
        } catch (e) {
            // Message might have been deleted, send a new one
            await sendMessage(chatId, messageText, env, keyboard);
        }
    } else {
        await sendMessage(chatId, messageText, env, keyboard);
    }
}

export async function showStatsMenu(chatId: number, messageId: number, text: string, env: Env) {
    const keyboard = makeKeyboard([
        [
            { text: '📝 Подробный отчет', callback_data: CB.SHOW_DETAILED_ANALYTICS },
            { text: '📥 Скачать отчет', callback_data: CB.DOWNLOAD_ANALYTICS_REPORT }
        ],
        [{ text: '⬅️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}
