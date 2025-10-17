// functions/telegram/router.ts

import { TelegramCallbackQuery, UserState, Env } from './types';
import { showLoginOptions, showMainMenu } from './ui';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { handleStats } from './commands';
import { manageBets } from './manageBets';
import { editMessageText } from './telegramApi';
import { showAnalytics } from './analytics';

// Callback Data constants
export const CB = {
    LOGIN: 'login',
    REGISTER: 'register',
    BACK_TO_MAIN: 'back_to_main',
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    SHOW_ANALYTICS: 'show_analytics',
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    MANAGE_BETS: 'manage_bets',
    SHOW_AI_ANALYST: 'show_ai_analyst',
};

// Prefix for manage bets callbacks to distinguish them
export const MANAGE_PREFIX = 'mng';

export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_del',
    CONFIRM_DELETE: 'c_del',
};

export function buildManageCb(action: string, ...args: (string | number)[]): string {
    return [MANAGE_PREFIX, action, ...args].join('|');
}


export async function handleRoute(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    
    if (!state.user && ![CB.LOGIN, CB.REGISTER].includes(data)) {
        await showLoginOptions(callbackQuery, env, "Пожалуйста, войдите в систему, чтобы продолжить.");
        return;
    }

    if (data.startsWith(MANAGE_PREFIX)) {
        await manageBets(callbackQuery, state, env);
        return;
    }

    switch (data) {
        case CB.LOGIN:
            await startLoginDialog(chatId, state, env, message.message_id);
            break;
        case CB.REGISTER:
            await startRegisterDialog(chatId, state, env, message.message_id);
            break;
        case CB.BACK_TO_MAIN:
            await showMainMenu(callbackQuery, env);
            break;
        case CB.ADD_BET:
            await startAddBetDialog(chatId, state, env);
            break;
        case CB.SHOW_STATS:
            await handleStats(message, env);
            break;
        case CB.SHOW_ANALYTICS:
            await showAnalytics(message, state, env);
            break;
        case CB.MANAGE_BETS:
             // The action starts the list view with page 0
            callbackQuery.data = buildManageCb(MANAGE_ACTIONS.LIST, 0);
            await manageBets(callbackQuery, state, env);
            break;
        case CB.SHOW_AI_ANALYST:
            await startAiChatDialog(chatId, state, env);
            break;
        case CB.SHOW_COMPETITIONS:
        case CB.SHOW_GOALS:
            await editMessageText(chatId, message.message_id, "🚧 Этот раздел находится в разработке.", env, {
                inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]]
            });
            break;
        default:
            console.warn(`Unhandled route callback: ${data}`);
            break;
    }
}
