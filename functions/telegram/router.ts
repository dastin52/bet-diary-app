// functions/telegram/router.ts
import { TelegramCallbackQuery, UserState, Env } from './types';
import { reportError, answerCallbackQuery } from './telegramApi';
import { handleAddBet, handleStats } from './commands';
import { showMainMenu, showLoginOptions } from './ui';
import { manageBets } from './manageBets';
import { startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';

export const MANAGE_PREFIX = 'm';

export const CB = {
    BACK_TO_MAIN: 'main_menu',
    LOGIN: 'login',
    REGISTER: 'register',
    ADD_BET: 'add_bet',
    SHOW_STATS: 'show_stats',
    MANAGE_BETS: `${MANAGE_PREFIX}|list|0`,
    SHOW_COMPETITIONS: 'show_competitions',
    SHOW_GOALS: 'show_goals',
    SHOW_AI_ANALYST: 'show_ai_analyst',
};

export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_del',
    CONFIRM_DELETE: 'c_del',
};

export function buildManageCb(...parts: (string | number)[]): string {
    return [MANAGE_PREFIX, ...parts].join('|');
}

export async function routeCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    try {
        if (data.startsWith(MANAGE_PREFIX)) {
            if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
            await manageBets(callbackQuery, state, env);
            return;
        }

        switch (data) {
            case CB.LOGIN:
                await startLoginDialog(chatId, state, env, messageId);
                break;
            case CB.REGISTER:
                await startRegisterDialog(chatId, state, env, messageId);
                break;
            case CB.BACK_TO_MAIN:
                await showMainMenu(callbackQuery, env);
                break;
            case CB.ADD_BET:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleAddBet(chatId, state, env);
                break;
            case CB.SHOW_STATS:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await handleStats(chatId, state, env);
                break;
            case CB.SHOW_AI_ANALYST:
                if (!state.user) return showLoginOptions(callbackQuery, env, 'Действие требует авторизации.');
                await startAiChatDialog(chatId, state, env);
                break;
            
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
