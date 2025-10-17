import { TelegramMessage, TelegramCallbackQuery, Env } from './types';
import { getUserState } from './state';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError } from './telegramApi';
import { mainCallbackRouter, commandRouter, globalCommandRouter, MANAGE_PREFIX, unauthenticatedRoutes } from './router';
import { manageBets } from './manageBets';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Handle global commands first (they should interrupt anything)
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            const globalHandler = globalCommandRouter[command];
            if (globalHandler) {
                await globalHandler({ message }, state, env);
                return;
            }
        }

        // 2. If a dialog is active, let it handle the message
        if (state.dialog) {
            await continueDialog({ message }, state, env);
            return;
        }

        // 3. Handle regular commands if authenticated
        if (state.user) {
            if (text.startsWith('/')) {
                const command = text.split(' ')[0];
                const handler = commandRouter[command];
                if (handler) {
                    await handler({ message }, state, env);
                } else {
                     await reportError(chatId, env, 'Unknown Command', `Команда не найдена: ${command}`);
                }
                return;
            }
        }
        
        // 4. Handle 6-digit auth code
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            const authHandler = commandRouter['/auth']; // Special case
            if (authHandler) {
                 await authHandler({ message }, state, env, authCodeMatch[0]);
            }
            return;
        }

        // 5. If not authenticated and not a command, prompt to log in
        if (!state.user) {
            const { showLoginOptions } = await import('./ui');
            await showLoginOptions(message, env, 'Пожалуйста, войдите или зарегистрируйтесь, чтобы продолжить.');
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        await answerCallbackQuery(callbackQuery.id, env);
        
        const callbackData = callbackQuery.data;

        // 1. If a dialog is active, let it handle the callback
        if (state.dialog) {
            await continueDialog({ callbackQuery }, state, env);
            return;
        }

        // 2. Handle prefixed callbacks (like manage bets)
        if (callbackData.startsWith(MANAGE_PREFIX)) {
            await manageBets(callbackQuery, state, env);
            return;
        }
        
        // 3. Handle main router callbacks
        let handler = mainCallbackRouter[callbackData];

        // 4. If not found and user is not authenticated, check unauthenticated routes
        if (!handler && !state.user) {
            handler = unauthenticatedRoutes[callbackData];
        }

        if (handler) {
            await handler({ callbackQuery }, state, env);
            return;
        }

        console.warn(`Received unhandled callback_query data: ${callbackData} for chat ${chatId}`);

    } catch (error) {
        await reportError(chatId, env, `Callback Router (${callbackQuery.data})`, error);
    }
}
