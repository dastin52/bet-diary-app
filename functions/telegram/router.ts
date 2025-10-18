// functions/telegram/router.ts
import { UserState, Env, TelegramUpdate } from './types';
import { showMainMenu } from './ui';
import { continueDialog } from './dialogs';
import { manageBets } from './manageBets';
import { handleAddBet, handleStats, handleShowDetailedReport, handleDownloadReport, handleManageBets, handleCompetitions, handleGoals, handleAiChat } from './commands';
import { reportError } from './telegramApi';
import { handleCompetitionCallback, COMP_PREFIX } from './competition';
import { handleGoalCallback, GOAL_PREFIX } from './goals';

export const CB = {
    BACK_TO_MAIN: 'main_menu',
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    MANAGE_BETS: 'manage_bets',
    COMPETITIONS: 'competitions',
    GOALS: 'goals',
    AI_CHAT: 'ai_chat',
    // Analytics
    SHOW_DETAILED_ANALYTICS: 'show_detailed_analytics',
    DOWNLOAD_ANALYTICS_REPORT: 'download_analytics_report',
};

// Prefixes to route callbacks to the correct module
export const MANAGE_PREFIX = 'm|';
export const buildManageCb = (action: string, ...args: (string | number)[]): string => {
    return `${MANAGE_PREFIX}${action}|${args.join('|')}`;
};
export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_delete',
    CONFIRM_DELETE: 'c_delete',
};


export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    await (await import('./telegramApi')).answerCallbackQuery(callbackQuery.id, env);

    try {
        // Route by prefix
        if (data.startsWith(MANAGE_PREFIX)) {
            await manageBets(callbackQuery, state, env);
            return;
        }
        if (data.startsWith(COMP_PREFIX)) {
            await handleCompetitionCallback(callbackQuery, state, env);
            return;
        }
        if (data.startsWith(GOAL_PREFIX)) {
            await handleGoalCallback(callbackQuery, state, env);
            return;
        }

        // Route by exact match
        switch (data) {
            case CB.BACK_TO_MAIN:
                await showMainMenu(chatId, callbackQuery.message.message_id, env);
                break;
            case CB.ADD_BET:
                await handleAddBet(update, state, env);
                break;
            case CB.SHOW_STATS:
                await handleStats(update, state, env);
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
                await handleShowDetailedReport(update, state, env);
                break;
            case CB.DOWNLOAD_ANALYTICS_REPORT:
                await handleDownloadReport(update, state, env);
                break;
            default:
                // If no global match, it might be a dialog action
                if (state.dialog) {
                    await continueDialog(update, state, env);
                } else {
                    console.warn(`Unhandled callback query data: ${data}`);
                }
                break;
        }
    } catch (error) {
        await reportError(chatId, env, `Callback Router (${data})`, error);
    }
}