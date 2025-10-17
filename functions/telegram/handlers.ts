// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env } from './types';
import { getUserState } from './state';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError } from './telegramApi';
import { mainCallbackRouter, commandRouter, globalCommandRouter } from './router';

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

        // 3. Handle regular commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            const handler = commandRouter[command];
            if (handler) {
                await handler({ message }, state, env);
            } else {
                 await reportError(chatId, env, 'Unknown Command', `Command not found: ${command}`);
            }
            return;
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

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        // Acknowledge the button press immediately
        await answerCallbackQuery(callbackQuery.id, env);
        
        const callbackData = callbackQuery.data;

        // 1. Handle dialog callbacks
        if (state.dialog) {
            await continueDialog({ callbackQuery }, state, env);
            return;
        }

        // 2. Handle main router callbacks
        const handler = mainCallbackRouter[callbackData];
        if (handler) {
            await handler({ callbackQuery }, state, env);
            return;
        }

        // 3. Handle prefixed callbacks (like manage bets)
        const prefix = callbackData.split('|')[0];
        const prefixedHandler = mainCallbackRouter[prefix];
        if (prefixedHandler) {
            await prefixedHandler({ callbackQuery }, state, env);
            return;
        }

        console.warn(`Received unhandled callback_query data: ${callbackData} for chat ${chatId}`);

    } catch (error) {
        await reportError(chatId, env, `Callback Router (${callbackQuery.data})`, error);
    }
}
