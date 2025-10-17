// functions/telegram/handlers.ts

import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset, showStats, showCompetitions, showGoals, handleAuth } from './commands';
import { continueDialog, startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { showMainMenu, showLoginOptions } from './ui';
import { CB, MANAGE_PREFIX } from './router';
import { manageBets } from './manageBets';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';

/**
 * Main router for incoming text messages and commands.
 * @param message The incoming Telegram message.
 * @param env The Cloudflare environment.
 */
export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Prioritize global commands that should always work
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/start':
                case '/menu':
                    state.dialog = null; // Force exit any active dialog
                    await handleStart(message, state, env);
                    return;
                case '/help':
                    await handleHelp(chatId, env);
                    return;
                case '/reset':
                    await handleReset(chatId, env);
                    return;
            }
        }
        
        // 2. If a dialog is active, let it handle the input
        if (state.dialog) {
            await continueDialog(message, state, env);
            return;
        }

        // 3. Handle 6-digit auth code if not in a dialog
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }

        // 4. Default response if no command or dialog is matched
        if (text.startsWith('/')) {
            await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help для просмотра списка.", env);
        } else if (state.user) {
            // If user is logged in and just sends random text, show main menu
             await showMainMenu(message, env);
        } else {
            // If user is not logged in, prompt to log in
            await showLoginOptions(message, env);
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}

/**
 * Main router for incoming callback queries (button presses).
 * @param callbackQuery The incoming Telegram callback query.
 * @param env The Cloudflare environment.
 */
export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        // Acknowledge the button press immediately
        await answerCallbackQuery(callbackQuery.id, env);
        
        const data = callbackQuery.data;

        // 1. If a dialog is active, let it handle the callback
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        // 2. NEW: Route all bet management actions to its dedicated module
        if (data.startsWith(MANAGE_PREFIX + '|')) {
            await manageBets(callbackQuery, state, env);
            return;
        }
        
        // 3. Handle simple, stateless callbacks
        switch (data) {
            case CB.ADD_BET:
                await startAddBetDialog(chatId, state, env);
                break;
            case CB.SHOW_STATS:
                await showStats(callbackQuery, state, env);
                break;
            case CB.SHOW_COMPETITIONS:
                await showCompetitions(callbackQuery, env);
                break;
            case CB.SHOW_GOALS:
                await showGoals(callbackQuery, state, env);
                break;
            case CB.MANAGE_BETS: // Entry point for the manage module
                await manageBets(callbackQuery, state, env);
                break;
            case CB.SHOW_AI_ANALYST:
                await startAiChatDialog(chatId, state, env);
                break;
            case CB.LOGIN:
                 await startLoginDialog(chatId, state, env, callbackQuery.message.message_id);
                break;
            case CB.REGISTER:
                await startRegisterDialog(chatId, state, env, callbackQuery.message.message_id);
                break;
            case CB.BACK_TO_MAIN:
                 await showMainMenu(callbackQuery, env);
                 break;
            default:
                console.warn(`Unhandled callback_query data in main handler: ${data} for chat ${chatId}`);
                await sendMessage(chatId, "Эта кнопка больше не активна.", env);
                break;
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}