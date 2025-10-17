
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
        [{ text: '📊 Статистика', callback_data: CB.SHOW_STATS }, { text: '📝 Добавить ставку', callback_data: CB.ADD_BET }],
        [{ text: '🏆 Соревнования', callback_data: CB.SHOW_COMPETITIONS }, { text: '🎯 Мои цели', callback_data: CB.SHOW_GOALS }],
        [{ text: '📈 Управление ставками', callback_data: CB.MANAGE_BETS }],
        [{ text: '🤖 AI-Аналитик', callback_data: CB.SHOW_AI_ANALYST }]
    ]);

    if (isCallback(update) && update.message) {
        await editMessageText(chatId, update.message.message_id, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function showLoginOptions(update: TelegramMessage | TelegramCallbackQuery, env: Env, customText?: string) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    const text = customText || 'Чтобы начать, войдите или зарегистрируйтесь.';
    
    const keyboard = makeKeyboard([
        [{ text: '🔑 Войти', callback_data: CB.LOGIN }, { text: '📝 Регистрация', callback_data: CB.REGISTER }]
    ]);

    if (isCallback(update) && update.message) {
        await editMessageText(chatId, update.message.message_id, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}
