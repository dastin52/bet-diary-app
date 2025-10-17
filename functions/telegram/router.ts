// functions/telegram/router.ts
import { TelegramCallbackQuery, UserState, Env } from './types';
import { reportError, answerCallbackQuery } from './telegramApi';
import { handleAddBet, handleStats, handleLogin, handleRegister, handleAiAnalyst, handleShowDetailedReport, handleDownloadReport } from './commands';
import { showMainMenu, showLoginOptions } from './ui';
import { manageBets } from './manageBets';
import { startAiChatDialog } from './dialogs';

export const MANAGE_PREFIX = 'm';

// Centralized Callback Data constants
export const CB = {
    // General
    BACK_TO_MAIN: 'main_menu',
    
    // Auth
    LOGIN: 'login',
    REGISTER: 'register',
    
    // Main Menu
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    MANAGE_BETS: `${MANAGE_PREFIX}|list|0`,
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    SHOW_AI_ANALYST: 'show_ai_analyst',

    // Analytics
    SHOW_DETAILED_ANALYTICS: 'analytics_detailed',
    DOWNLOAD_ANALYTICS_REPORT: 'analytics_download',
};

// Actions for the manageBets module
export const MANAGE_ACTIONS = {
    LIST: 'l',          // list
    VIEW: 'v',          // view
    PROMPT_STATUS: 'ps',// prompt_status
    SET_STATUS: 'ss',   // set_status
    PROMPT_DELETE: 'pd',// prompt_delete
    CONFIRM_DELETE: 'cd',// confirm_delete
};

/**
 * Builds a callback data string for the manageBets module.
 * e.g., buildManageCb('v', 'bet123', 0) -> "m|v|bet123|0"
 */
export function buildManageCb(...parts: (string | number)[]): string {
    return [MANAGE_PREFIX, ...parts].join('|');
}


// This is the main router for all non-dialog callback queries
export async function routeCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // High-priority router for bet management module
    if (data.startsWith(`${MANAGE_PREFIX}|`)) {
        if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
        await manageBets(callbackQuery, state, env);
        return;
    }

    try {
        switch (data) {
            // Auth
            case CB.LOGIN:
                await handleLogin(callbackQuery, state, env);
                break;
            case CB.REGISTER:
                await handleRegister(callbackQuery, state, env);
                break;

            // Main Navigation
            case CB.BACK_TO_MAIN:
                await showMainMenu(callbackQuery, env);
                break;
            
            // Core Features
            case CB.ADD_BET:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleAddBet(chatId, state, env);
                break;
            case CB.SHOW_STATS:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleStats(callbackQuery, state, env);
                break;
            case CB.SHOW_AI_ANALYST:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleAiAnalyst(callbackQuery, state, env);
                break;

            // Analytics Features
            case CB.SHOW_DETAILED_ANALYTICS:
                 if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                 await handleShowDetailedReport(callbackQuery, state, env);
                 break;
            case CB.DOWNLOAD_ANALYTICS_REPORT:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleDownloadReport(callbackQuery, state, env);
                break;

            // Placeholders
            case CB.SHOW_COMPETITIONS:
            case CB.SHOW_GOALS:
                await answerCallbackQuery(callbackQuery.id, env, 'Этот раздел в разработке.');
                break;
                
            default:
                console.warn(`Unhandled callback in router: ${data}`);
                await answerCallbackQuery(callbackQuery.id, env, 'Неизвестное действие.');
        }
    } catch (error) {
        await reportError(chatId, env, `Callback Router (${data})`, error);
    }
}
