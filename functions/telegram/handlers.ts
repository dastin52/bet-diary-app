// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env } from './types';
import { getUserState } from './state';
import { handleAuth, handleUnknownCommand } from './commands';
import { continueDialog } from './dialogs';
import { authenticatedRoutes, unauthenticatedRoutes } from './router';
import { answerCallbackQuery, reportError } from './telegramApi';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Приоритет у активных диалогов (кроме команды /reset)
        if (state.dialog && !text.startsWith('/reset')) {
            await continueDialog(message, state, env);
            return;
        }

        // 2. Обработка специальных вводов (код авторизации)
        if (/^\d{6}$/.test(text)) {
            await handleAuth(message, text, env);
            return;
        }

        // 3. Поиск и выполнение команды из роутера
        const routes = state.user ? authenticatedRoutes : unauthenticatedRoutes;
        const command = text.split(' ')[0];
        const handler = routes[command];

        if (handler) {
            await handler(message, state, env);
        } else if (text.startsWith('/')) {
            await handleUnknownCommand(message, state, env);
        }
        // Обычный текст без команды и вне диалога игнорируется

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}

export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        // Немедленно подтверждаем нажатие кнопки
        await answerCallbackQuery(callbackQuery.id, env);
        const state = await getUserState(chatId, env);
        const data = callbackQuery.data;

        // 1. Приоритет у диалогов
        if (state.dialog && data.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        // 2. Поиск и выполнение действия из роутера
        const routes = state.user ? authenticatedRoutes : unauthenticatedRoutes;
        const handler = routes[data];

        if (handler) {
            await handler(callbackQuery, state, env);
        } else {
            console.warn(`[WARN] Unhandled callback_query data: '${data}' for chat ${chatId}`);
            // Не отвечаем пользователю на неизвестную кнопку, чтобы избежать спама
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
