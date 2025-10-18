// functions/telegram/router.ts
import { TelegramUpdate, UserState, Env } from './types';
import { answerCallbackQuery } from './telegramApi';
import { showMainMenu } from './ui';
import { handleStats, handleAddBet, handleManageBets, handleCompetitions, handleGoals, handleAiChat, showLinkAccountInfo } from './commands';
import { manageBets, MANAGE_PREFIX } from './manageBets';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { handleGoalCallback, GOAL_PREFIX } from './goals';

// Callback Data constants
export const CB = {
    BACK_TO_MAIN: 'main_menu',
    SHOW_STATS: 'show_stats',
    ADD_BET: 'add_bet',
    MANAGE_BETS: 'manage_bets',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    AI_CHAT: 'ai_chat',
    SHOW_DETAILED_ANALYTICS: 'stats_detailed',
    DOWNLOAD_ANALYTICS_REPORT: 'stats_download',
    START_REGISTER: 'start_register',
    START_LOGIN: 'start_login',
    SHOW_LINK_INFO: 'show_link_info',
};

export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery || !callbackQuery.data) return;

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    // Answer the callback query immediately to remove the "loading" state on the button
    await answerCallbackQuery(callbackQuery.id, env);

    const data = callbackQuery.data;

    // Prefix-based routing for modules
    if (data.startsWith(MANAGE_PREFIX)) {
        await manageBets(callbackQuery, state, env);
        return;
    }
    if (data.startsWith(COMP_PREFIX)) {
        await handleCompetitionCallback(update, state, env);
        return;
    }
    if (data.startsWith(GOAL_PREFIX)) {
        await handleGoalCallback(callbackQuery, state, env);
        return;
    }

    // General routing
    switch (data) {
        case CB.BACK_TO_MAIN:
            await showMainMenu(chatId, messageId, env);
            break;
        case CB.SHOW_STATS:
        case CB.SHOW_DETAILED_ANALYTICS:
        case CB.DOWNLOAD_ANALYTICS_REPORT:
            await handleStats(update, state, env);
            break;
        case CB.ADD_BET:
            await handleAddBet(update, state, env);
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
        case CB.SHOW_LINK_INFO:
            await showLinkAccountInfo(chatId, messageId, env);
            break;
        // Cases for registration/login dialogs would go here if they were callback-driven
        // For now they are part of the /start command flow and dialog handler
        default:
            console.warn(`Unhandled callback query data: ${data}`);
            break;
    }
}
