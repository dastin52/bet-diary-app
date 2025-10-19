// functions/telegram/router.ts
import { TelegramUpdate, UserState, Env } from './types';
import { handleGoalCallback, GOAL_PREFIX } from './goals';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { manageBets, MANAGE_PREFIX } from './manageBets';
import { showMainMenu } from './ui';
import { handleStats, showLinkAccountInfo, handleAddBet, handleManageBets, handleCompetitions, handleGoals, handleAiChat, showStartMenu } from './commands';
import { answerCallbackQuery } from './telegramApi';
import { startAddBetDialog, startScreenshotDialog } from './dialogs';

export const STATS_PREFIX = 'stats|';

export const buildStatsCb = (action: string, period: string) => `${STATS_PREFIX}${action}|${period}`;

export const CB = {
    // start
    START_REGISTER: 'start_register',
    START_LOGIN: 'start_login',
    SHOW_LINK_INFO: 'show_link_info',
    START_MENU_BACK: 'start_menu_back',

    // main menu
    SHOW_STATS: buildStatsCb('show', 'week'),
    ADD_BET: 'add_bet',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    AI_CHAT: 'ai_chat',
    
    // stats menu is handled by STATS_PREFIX now
    BACK_TO_MAIN: 'back_to_main',

    // Add bet dialog
    ADD_BET_SCREENSHOT: 'add_bet_screenshot',
    ADD_BET_MANUAL: 'add_bet_manual',
    CONFIRM_PARSED_BET: 'confirm_parsed_bet',
    RETRY_PARSE_BET: 'retry_parse_bet',
};

export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    // It's good practice to answer the callback query immediately to remove the loading spinner on the user's client.
    await answerCallbackQuery(cb.id, env);
    
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (cb.data.startsWith(STATS_PREFIX)) {
        await handleStats(update, state, env);
        return;
    }
    if (cb.data.startsWith(MANAGE_PREFIX)) {
        await manageBets(update, state, env);
        return;
    }
    if (cb.data.startsWith(GOAL_PREFIX)) {
        await handleGoalCallback(cb, state, env);
        return;
    }
    if (cb.data.startsWith(COMP_PREFIX)) {
        await handleCompetitionCallback(update, state, env);
        return;
    }

    switch (cb.data) {
        // Main menu routing
        case CB.SHOW_STATS:
            await handleStats(update, state, env);
            break;
        case CB.ADD_BET:
            await startAddBetDialog(chatId, state, env, messageId);
            break;
        case CB.ADD_BET_SCREENSHOT:
            await startScreenshotDialog(chatId, messageId, state, env);
            break;
        case CB.MANAGE_BETS:
            await handleManageBets(update, state, env);
            break;
        case CB.COMPETITIONS:
            await handleCompetitions(update, state, env);
            break;
        case CB.GOALS:
            await handleGoals(update, state, env);
            break;
        case CB.AI_CHAT:
            await handleAiChat(update, state, env);
            break;
        
        // Other routes
        case CB.START_REGISTER:
        case CB.START_LOGIN:
        case CB.SHOW_LINK_INFO:
            await showLinkAccountInfo(chatId, messageId, env);
            break;
        
        case CB.START_MENU_BACK:
            await showStartMenu(chatId, env, messageId);
            break;

        case CB.BACK_TO_MAIN:
            await showMainMenu(chatId, messageId, env, 'Главное меню');
            break;
            
        default:
            console.warn(`Unhandled callback query: ${cb.data}`);
            break;
    }
}