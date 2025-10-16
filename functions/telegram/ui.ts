// functions/telegram/ui.ts
import { Env } from './types';
import { editMessageText, sendMessage } from './telegramApi';

export async function showMainMenu(chatId: number, text: string, env: Env, messageId?: number) {
    const keyboard = {
        inline_keyboard: [
            [{ text: '📊 Статистика', callback_data: 'show_stats' }, { text: '➕ Добавить ставку', callback_data: 'add_bet' }],
            [{ text: '🏆 Соревнования', callback_data: 'show_competitions' }, { text: '🎯 Мои цели', callback_data: 'show_goals' }],
            [{ text: '🤖 AI-Аналитик', callback_data: 'ai_chat' }],
        ]
    };
    if (messageId) {
        try {
            await editMessageText(chatId, messageId, text, env, keyboard);
        } catch (e) {
            // If editing fails (e.g., message is too old), send a new one.
            await sendMessage(chatId, text, env, keyboard);
        }
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function showLoginOptions(chatId: number, env: Env, messageId?: number) {
    const text = `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, войдите в свой аккаунт, зарегистрируйтесь или привяжите существующий аккаунт с помощью кода с сайта.`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '➡️ Войти', callback_data: 'login' }, { text: '📝 Регистрация', callback_data: 'register' }],
        ]
    };
     if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}
