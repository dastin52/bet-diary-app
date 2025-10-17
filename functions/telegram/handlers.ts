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
                await setUserState(chatId, state, env); // Clear dialog before proceeding
            }
            await globalHandler(message, state, env);
            return;
        }

        // 2. If a dialog is active, all non-command messages go to it.
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }
        
        // 3. Handle 6-digit auth code if no dialog is active and user is not authenticated.
        if (!state.user && /^\d{6}$/.test(text)) {
            await handleAuth(message, text, env);
            return;
        }

        // 4. Handle other contextual commands.
        if (text.startsWith('/')) {
            const handler = (state.user ? authenticatedRoutes : unauthenticatedRoutes)[command];
            if (handler) {
                await handler(message, state, env);
            } else {
                await handleUnknownCommand(message, state, env);
            }
            return;
        }
        
        // 5. If it's just plain text with no active dialog, guide the user.
        if (!state.dialog) {
             await handleUnknownCommand(message, state, env);
        }

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

        // 1. Dialogs have priority for callbacks starting with 'dialog_'
        if (state.dialog && data.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        // 2. Handle specific dialog start buttons for non-authed users
        const unauthDialogHandler = unauthenticatedDialogRoutes[data];
        if (!state.user && unauthDialogHandler) {
             await unauthDialogHandler(callbackQuery, state, env);
             return;
        }

        // 3. Route all other callbacks using the router
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
