// functions/telegram/handlers.ts
import { TelegramUpdate, Env, UserState } from './types';
import { getUserState, setUserState } from './state';
import { reportError, sendMessage, deleteMessage } from './telegramApi';
import { routeCallbackQuery } from './router';
import { continueDialog } from './dialogs';
import { handleStart, handleHelp, handleReset, handleAddBet, handleStats, handleAuth, handleManageBets, handleCompetitions, handleGoals, handleAiChat, handlePredictions } from './commands';

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
            if (state.dialog && state.dialog.messageId) {
                try {
                   await deleteMessage(chatId, state.dialog.messageId, env);
                } catch (e) { console.warn(`Could not delete previous dialog message: ${e}`); }
            }
            const cleanState = { ...state, dialog: null };
            await setUserState(chatId, cleanState, env);
            
            switch (text) {
                case '/start': await handleStart(update, cleanState, env); return;
                case '/help': await handleHelp(message, env); return;
                case '/reset': await handleReset(message, env); return;
            }
        }
        
        if (state.dialog) {
            // Special handling for photo uploads in a dialog
            if (state.dialog.name === 'add_bet' && state.dialog.step === 'awaiting_screenshot' && message.photo) {
                await continueDialog(update, state, env);
                return;
            }
            if(state.dialog && text) {
                await continueDialog(update, state, env);
                return;
            }
        }

        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/addbet': await handleAddBet(update, state, env); return;
                case '/stats': await handleStats(update, state, env); return;
                case '/manage': await handleManageBets(update, state, env); return;
                case '/competitions': await handleCompetitions(update, state, env); return;
                case '/goals': await handleGoals(update, state, env); return;
                case '/ai': await handleAiChat(update, state, env); return;
                case '/aipredictions': await handlePredictions(update, state, env); return;
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
        // Pass to dialog if active, otherwise route normally
        if (state.dialog) {
            await continueDialog(update, state, env);
        } else {
            await routeCallbackQuery(update, state, env);
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}