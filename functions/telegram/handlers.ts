// functions/telegram/handlers.ts

import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset, showStats, showCompetitions, showGoals, handleAuth } from './commands';
import { continueDialog, startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { showMainMenu, showLoginOptions } from './ui';
import { CB } from './router';
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

        // 1. If a dialog is active, all text messages go to it, unless it's a command.
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }
        
        // 2. Handle commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/start':
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

        // 3. Handle 6-digit auth code
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }

        // 4. Default response if no command or dialog is matched
        if (text.startsWith('/')) {
            await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help, чтобы увидеть список доступных команд.", env);
        } else if (state.user) {
            // If user is logged in and not in a dialog, just show main menu
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
    const messageId = callbackQuery.message.message_id;
    try {
        const state = await getUserState(chatId, env);
        
        // Acknowledge the button press immediately to remove the "loading" state on the button.
        await answerCallbackQuery(callbackQuery.id, env);

        // 1. If a dialog is active, all callbacks go to it.
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        const data = callbackQuery.data;

        // 2. Handle router actions for a clean state
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
            case CB.MANAGE_BETS:
                await manageBets(callbackQuery, state, env);
                break;
            case CB.SHOW_AI_ANALYST:
                await startAiChatDialog(chatId, state, env);
                break;
            case CB.LOGIN:
                 await startLoginDialog(chatId, state, env, messageId);
                break;
            case CB.REGISTER:
                await startRegisterDialog(chatId, state, env, messageId);
                break;
            case CB.BACK_TO_MAIN:
                 await showMainMenu(callbackQuery, env);
                 break;
            default:
                // Handle complex callbacks that include prefixes (e.g., pagination, item IDs)
                if (data.startsWith(CB.LIST_BETS) || data.startsWith(CB.VIEW_BET) || data.startsWith(CB.NEXT_PAGE) || data.startsWith(CB.PREV_PAGE)) {
                    await manageBets(callbackQuery, state, env);
                } else {
                    console.warn(`Unhandled callback_query data: ${data} for chat ${chatId}`);
                }
                break;
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
