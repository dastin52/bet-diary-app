// functions/telegram/router.ts
import { TelegramCallbackQuery, UserState, Env, TelegramUpdate } from './types';
import { showMainMenu } from './ui';
import { continueDialog } from './dialogs';
import { manageBets } from './manageBets';
// FIX: Import missing command handlers.
import { handleAddBet, handleStats, handleShowDetailedReport, handleDownloadReport, handleManageBets, handleCompetitions, handleGoals, handleAiChat } from './commands';
import { reportError } from './telegramApi';

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

// FIX: Defined and exported MANAGE_ACTIONS to resolve import errors in other files.
export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_delete',
    CONFIRM_DELETE: 'c_delete',
};

// ... (buildManageCb and other helpers remain the same)
export const MANAGE_PREFIX = 'm|';
export const buildManageCb = (action: string, ...args: (string | number)[]): string => {
    return `${MANAGE_PREFIX}${action}|${args.join('|')}`;
};


// FIX: Changed signature to accept the full TelegramUpdate object to resolve type errors.
export async function routeCallbackQuery(update: TelegramUpdate, state: UserState, env: Env) {
    // FIX: Extracted callbackQuery from the full update object.
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    try {
        if (data.startsWith(MANAGE_PREFIX)) {
            await manageBets(callbackQuery, state, env);
            return;
        }

        switch (data) {
            case CB.BACK_TO_MAIN:
                await showMainMenu(chatId, callbackQuery.message.message_id, env);
                break;
            // FIX: Pass the full update object to command handlers.
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