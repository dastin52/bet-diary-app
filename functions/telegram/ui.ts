// functions/telegram/ui.ts
import { Env, TelegramMessage, TelegramCallbackQuery } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { CB } from './router';

export const makeKeyboard = (options: { text: string, callback_data: string }[][]) => {
    return { inline_keyboard: options };
};

const isCallback = (update: TelegramMessage | TelegramCallbackQuery): update is TelegramCallbackQuery => 'data' in update;

export async function showMainMenu(update: TelegramMessage | TelegramCallbackQuery, env: Env) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    const text = 'Главное меню';
    const keyboard = makeKeyboard([
        [{ text: '📊 Статистика', callback_data: CB.SHOW_STATS }, { text: '➕ Добавить ставку', callback_data: CB.ADD_BET }],
        [{ text: '🏆 Соревнования', callback_data: CB.SHOW_COMPETITIONS }, { text: '🎯 Мои цели', callback_data: CB.SHOW_GOALS }],
        [{ text: '📈 Управление ставками', callback_data: CB.MANAGE_BETS }],
        [{ text: '🤖 AI-Аналитик', callback_data: CB.SHOW_AI_ANALYST }]
    ]);

    if (isCallback(update)) {
        // Если это нажатие кнопки, редактируем существующее сообщение
        await editMessageText(chatId, update.message.message_id, text, env, keyboard);
    } else {
        // Если это команда, отправляем новое сообщение
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function showLoginOptions(update: TelegramMessage | TelegramCallbackQuery, env: Env, customText?: string) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    const text = customText || 'Чтобы начать, привяжите свой аккаунт, отправив 6-значный код из веб-приложения.';
    
    // В будущем здесь можно добавить кнопку со ссылкой на сайт
    const keyboard = undefined;

    if (isCallback(update)) {
        await editMessageText(chatId, update.message.message_id, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}
