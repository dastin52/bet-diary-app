// functions/telegram/router.ts
import { TelegramUpdate, UserState, Env } from './types';
import { handleGoalCallback, GOAL_PREFIX } from './goals';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { manageBets, MANAGE_PREFIX } from './manageBets';
import { showMainMenu } from './ui';
import { handleStats, showLinkAccountInfo, handleAddBet, handleManageBets, handleCompetitions, handleGoals, handleAiChat } from './commands';
import { answerCallbackQuery } from './telegramApi';
import { startAddBetDialog } from './dialogs';

export const CB = {
    // start
    START_REGISTER: 'start_register',
    START_LOGIN: 'start_login',
    SHOW_LINK_INFO: 'show_link_info',

    // main menu
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    MANAGE_BETS: 'manage_bets',
    AI_CHAT: 'ai_chat',
    
    // stats menu
    SHOW_DETAILED_ANALYTICS: 'show_detailed_analytics',
    DOWNLOAD_ANALYTICS_REPORT: 'download_analytics_report',
    BACK_TO_MAIN: 'back_to_main',
};

export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    await answerCallbackQuery(cb.id, env);
    
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;

    if (cb.data.startsWith(MANAGE_PREFIX)) {
        // FIX: Pass the entire update object instead of just the callback query.
        await manageBets(update, state, env);
        return;
    }
    if (cb.data.startsWith(GOAL_PREFIX)) {
        await handleGoalCallback(cb, state, env);
        return;
    }
    if (cb.data.startsWith(COMP_PREFIX)) {
        await handleCompetitionCallback(cb, state, env);
        return;
    }

    switch (cb.data) {
        case CB.SHOW_STATS:
            await handleStats(update, state, env);
            break;
        case CB.ADD_BET:
            await startAddBetDialog(chatId, state, env, messageId);
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
        case CB.SHOW_DETAILED_ANALYTICS:
        case CB.DOWNLOAD_ANALYTICS_REPORT:
            await handleStats(update, state, env);
            break;
        case CB.SHOW_LINK_INFO:
            await showLinkAccountInfo(chatId, messageId, env);
            break;
        case CB.BACK_TO_MAIN:
            await showMainMenu(chatId, messageId, env, 'Главное меню');
            break;
        default:
            console.warn(`Unhandled callback query: ${cb.data}`);
            break;
    }
}