// functions/telegram/handlers.ts
import { TelegramUpdate, Env, UserState } from './types';
import { getUserState, setUserState } from './state';
import { reportError, sendMessage } from './telegramApi';
import { routeCallbackQuery } from './router';
// FIX: Import startAiChatDialog to resolve reference error.
import { continueDialog, startAiChatDialog } from './dialogs';
import { handleStart, handleHelp, handleReset, handleAddBet, handleStats, handleAuth, handleManageBets, handleCompetitions, handleGoals, handleAiChat } from './commands';

const GLOBAL_COMMANDS = ['/start', '/help', '/reset'];

export async function handleMessage(update: TelegramUpdate, env: Env) {
    const message = update.message;
    if (!message) return;
    const chatId = message.chat.id;

    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // Global commands can interrupt dialogs
        if (GLOBAL_COMMANDS.includes(text)) {
            if (state.dialog) {
                // Clean up previous dialog message if it exists
                if (state.dialog.messageId) {
                    try {
                       await (await import('./telegramApi')).deleteMessage(chatId, state.dialog.messageId, env);
                    } catch (e) { console.warn(`Could not delete previous dialog message: ${e}`); }
                }
                state.dialog = null;
                await setUserState(chatId, state, env);
            }
            switch (text) {
                case '/start': await handleStart(update, state, env); return;
                case '/help': await handleHelp(message, env); return;
                case '/reset': await handleReset(message, env); return;
            }
        }
        
        if (state.dialog) {
            await continueDialog(update, state, env);
            return;
        }

        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/addbet': await handleAddBet(update, state, env); return;
                case '/stats': await handleStats(update, state, env); return;
                case '/manage': await handleManageBets(update, state, env); return;
                case '/competitions': await handleCompetitions(update, state, env); return;
                case '/goals': await handleGoals(update, state, env); return;
                case '/ai': await startAiChatDialog(chatId, state, env); return; // Direct call to start dialog
                default:
                     await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help.", env);
                    return;
            }
        }
        
        if (text.match(/^\d{6}$/)) {
            await handleAuth(message, text, env);
            return;
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(update: TelegramUpdate, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        await routeCallbackQuery(update, state, env);
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}