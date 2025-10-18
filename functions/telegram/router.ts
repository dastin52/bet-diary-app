// functions/telegram/router.ts
import { TelegramCallbackQuery, UserState, Env, TelegramUpdate } from './types';
import { answerCallbackQuery, reportError } from './telegramApi';
import { handleCompetitionCallback, showCompetitionsMenu } from './competition';
import { manageBets, startManageBets } from './manageBets';
import { showMainMenu } from './ui';
import { handleGoalCallback, startManageGoals } from './goals';
import { handleAddBet, handleAiChat, handleStats, showLinkAccountInfo } from './commands';
import { startLoginDialog, startRegistrationDialog } from './dialogs';

// Callback Data prefixes
export const COMP_PREFIX = 'c|';
export const GOAL_PREFIX = 'g|';
export const MANAGE_PREFIX = 'm|';

// General callback actions
export const CB = {
    // Main Menu
    SHOW_STATS: 'stats',
    ADD_BET: 'add_bet',
    COMPETITIONS: 'comps',
    GOALS: 'goals',
    MANAGE_BETS: 'manage',
    AI_CHAT: 'ai_chat',
    BACK_TO_MAIN: 'main_menu',
    
    // Auth Menu
    START_REGISTER: 'start_register',
    START_LOGIN: 'start_login',
    SHOW_LINK_INFO: 'show_link_info',

    // Stats Menu
    SHOW_DETAILED_ANALYTICS: 'stats_detailed',
    DOWNLOAD_ANALYTICS_REPORT: 'stats_download',
};

// Actions for manageBets
export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_del',
    CONFIRM_DELETE: 'c_del',
};
export const buildManageCb = (action: string, ...args: (string | number)[]): string => `${MANAGE_PREFIX}${action}|${args.join('|')}`;


export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery?.data) return;

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    try {
        await answerCallbackQuery(callbackQuery.id, env); // Acknowledge the callback

        const data = callbackQuery.data;

        if (data.startsWith(COMP_PREFIX)) {
            await handleCompetitionCallback(update, state, env);
        } else if (data.startsWith(GOAL_PREFIX)) {
            await handleGoalCallback(callbackQuery, state, env);
        } else if (data.startsWith(MANAGE_PREFIX)) {
            await manageBets(callbackQuery, state, env);
        } else {
            // Handle general callbacks
            switch (data) {
                // Auth
                case CB.START_REGISTER:
                    await startRegistrationDialog(chatId, state, env, messageId);
                    break;
                case CB.START_LOGIN:
                    await startLoginDialog(chatId, state, env, messageId);
                    break;
                case CB.SHOW_LINK_INFO:
                    await showLinkAccountInfo(chatId, messageId, env);
                    break;

                // Main Menu
                case CB.BACK_TO_MAIN:
                    await showMainMenu(chatId, messageId, env);
                    break;
                case CB.SHOW_STATS:
                    await handleStats(update, state, env);
                    break;
                case CB.ADD_BET:
                     await handleAddBet(update, state, env);
                    break;
                case CB.MANAGE_BETS:
                    await startManageBets(update, state, env);
                    break;
                case CB.COMPETITIONS:
                    await showCompetitionsMenu(update, state, env);
                    break;
                case CB.GOALS:
                    await startManageGoals(update, state, env);
                    break;
                case CB.AI_CHAT:
                    await handleAiChat(update, state, env);
                    break;

                 // Analytics callbacks are handled within the stats command/menu itself
                case CB.SHOW_DETAILED_ANALYTICS:
                case CB.DOWNLOAD_ANALYTICS_REPORT:
                     await handleStats(update, state, env);
                    break;
            }
        }
    } catch (error) {
        await reportError(chatId, env, `Callback Router (${callbackQuery.data})`, error);
    }
}