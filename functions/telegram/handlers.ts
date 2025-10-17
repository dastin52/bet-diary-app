// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState, setUserState } from './state';
import { handleAuth, handleUnknownCommand } from './commands';
import { continueDialog } from './dialogs';
import { authenticatedRoutes, unauthenticatedRoutes, unauthenticatedDialogRoutes, globalRoutes } from './router';
import { answerCallbackQuery, reportError } from './telegramApi';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';
        const command = text.split(' ')[0];

        // 1. Handle global commands first, as they can interrupt anything.
        const globalHandler = globalRoutes[command];
        if (globalHandler) {
            if (state.dialog) {
                state.dialog = null;
                // No need to wait, let it run in the background
                setUserState(chatId, state, env);
            }
            await globalHandler(message, state, env);
            return;
        }
        
        // 2. If a dialog is active, it handles ALL non-global input (including commands like /stop).
        if (state.dialog) {
            await continueDialog(message, state, env);
            return;
        }
        
        // 3. If no dialog is active, handle auth code for non-authed users.
        if (!state.user && /^\d{6}$/.test(text)) {
            await handleAuth(message, text, env);
            return;
        }

        // 4. If no dialog, route other commands based on auth status.
        if (text.startsWith('/')) {
            const handler = (state.user ? authenticatedRoutes : unauthenticatedRoutes)[command];
            if (handler) {
                await handler(message, state, env);
            } else {
                await handleUnknownCommand(message, state, env);
            }
            return;
        }
        
        // 5. If it's just plain text with no active dialog, treat as unknown.
        await handleUnknownCommand(message, state, env);

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        await answerCallbackQuery(callbackQuery.id, env);
        const state = await getUserState(chatId, env);
        const data = callbackQuery.data;

        // 1. If a dialog is active, it gets priority for all callbacks.
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        // 2. Handle specific dialog start buttons for non-authed users
        const unauthDialogHandler = unauthenticatedDialogRoutes[data];
        if (!state.user && unauthDialogHandler) {
             await unauthDialogHandler(callbackQuery, state, env);
             return;
        }

        // 3. Route all other callbacks using the router based on auth status
        const handler = state.user ? authenticatedRoutes[data] : unauthenticatedRoutes[data];

        if (handler) {
            await handler(callbackQuery, state, env);
        } else {
            console.warn(`[WARN] Unhandled callback_query data: '${data}' for chat ${chatId}`);
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}