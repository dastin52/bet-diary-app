// functions/telegram/handlers.ts
// FIX: Changed import to TelegramUpdate to match the updated type.
import { TelegramMessage, TelegramCallbackQuery, Env, UserState, TelegramUpdate } from './types';
import { getUserState, setUserState } from './state';
import { reportError } from './telegramApi';
// FIX: Imported router and dialog handlers
import { routeCallbackQuery } from './router';
import { continueDialog } from './dialogs';
import { handleStart, handleHelp, handleReset, handleAddBet, handleStats, handleAuth, handleManageBets, handleCompetitions, handleGoals, handleAiChat } from './commands';

const GLOBAL_COMMANDS = ['/start', '/help', '/reset'];

// FIX: Changed signature to accept the full TelegramUpdate object.
export async function handleMessage(update: TelegramUpdate, env: Env) {
    // FIX: Extracted message and chatId from the full update object.
    const message = update.message;
    if (!message) return;
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // Global commands override everything
        if (GLOBAL_COMMANDS.includes(text)) {
            if (state.dialog) {
                state.dialog = null;
                await setUserState(chatId, state, env);
            }
            switch (text) {
                // FIX: Pass the full update object to command handlers.
                case '/start': await handleStart(update, state, env); return;
                case '/help': await handleHelp(message, env); return;
                case '/reset': await handleReset(message, env); return;
            }
        }
        
        // Handle active dialogs
        if (state.dialog) {
            await continueDialog(update, state, env);
            return;
        }

        // Handle other commands
        if (text.startsWith('/')) {
            switch (text) {
                // FIX: Pass the full update object to command handlers.
                case '/addbet': await handleAddBet(update, state, env); return;
                case '/stats': await handleStats(update, state, env); return;
                case '/manage': await handleManageBets(update, state, env); return;
                case '/competitions': await handleCompetitions(update, state, env); return;
                case '/goals': await handleGoals(update, state, env); return;
                case '/ai': await handleAiChat(update, state, env); return;
            }
        }
        
        // Handle 6-digit auth code
        if (text.match(/^\d{6}$/)) {
            await handleAuth(message, text, env);
            return;
        }

        if (text.startsWith('/')) {
            await reportError(chatId, env, 'Message Handler', new Error(`Unknown command: ${text}`));
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


// FIX: Changed signature to accept the full TelegramUpdate object.
export async function handleCallbackQuery(update: TelegramUpdate, env: Env) {
    // FIX: Extracted callbackQuery and chatId from the full update object.
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        // FIX: Pass the full update object to the router.
        await routeCallbackQuery(update, state, env);
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}