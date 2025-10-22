// functions/telegram/router.ts
import { TelegramUpdate, UserState, Env } from './types';
import { handleGoalCallback, GOAL_PREFIX } from './goals';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { manageBets, MANAGE_PREFIX } from './manageBets';
import { showMainMenu } from './ui';
import { handleStats, showLinkAccountInfo, handleAddBet, handleManageBets, handleCompetitions, handleGoals, handleAiChat, showStartMenu, handleMatches } from './commands';
import { answerCallbackQuery } from './telegramApi';
import { continueDialog, startAddBetDialog, startScreenshotDialog, startBotRegisterDialog, startBotLoginDialog } from './dialogs';
import { handleMatchesCallback, handleSportSelectionCallback, MATCH_PREFIX, MATCH_SPORT_PREFIX } from './matches';

export const STATS_PREFIX = 'stats|';

export const buildStatsCb = (action: string, period: string) => `${STATS_PREFIX}${action}|${period}`;

export const CB = {
    // start
    START_REGISTER: 'start_register', // DEPRECATED, now points to link info
    START_LOGIN: 'start_login',     // DEPRECATED, now points to link info
    SHOW_LINK_INFO: 'show_link_info',
    START_MENU_BACK: 'start_menu_back',
    BOT_REGISTER: 'bot_register',
    BOT_LOGIN: 'bot_login',

    // main menu
    SHOW_STATS: buildStatsCb('show', 'week'),
    ADD_BET: 'add_bet',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    MATCHES: 'matches',
    AI_CHAT: 'ai_chat',
    AI_CHAT_PERFORMANCE: 'ai_perf',
    AI_CHAT_MATCH: 'ai_match',
    
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
    if (cb.data.startsWith(MATCH_SPORT_PREFIX)) {
        await handleSportSelectionCallback(update, state, env);
        return;
    }
    if (cb.data.startsWith(MATCH_PREFIX)) {
        await handleMatchesCallback(update, state, env);
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
        case CB.AI_CHAT_PERFORMANCE:
        case CB.AI_CHAT_MATCH:
            await continueDialog(update, state, env); // Handled by the dialog
            break;
        case CB.MATCHES:
            await handleMatches(update, state, env);
            break;
        
        // New start menu routes
        case CB.BOT_REGISTER:
            await startBotRegisterDialog(chatId, state, env, messageId);
            break;
        case CB.BOT_LOGIN:
            await startBotLoginDialog(chatId, state, env, messageId);
            break;

        // Old routes now point to the same link info page for clarity
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