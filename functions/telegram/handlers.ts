// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import {
    handleStart, handleAuth, handleLogin, handleRegister, showMainMenu, handleHelp, handleReset,
    handleShowStatsCommand, handleShowStatsCallback,
    handleStartAddBetCommand, handleStartAddBetCallback,
    handleShowCompetitionsCommand, handleShowCompetitionsCallback,
    handleShowGoalsCommand, handleShowGoalsCallback,
    handleStartAiChatCommand, handleStartAiChatCallback,
    handleViewLeaderboard
} from './commands';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';

// --- Command and Callback Maps ---

const unauthenticatedCommandMap: { [key: string]: (msg: TelegramMessage, env: Env) => Promise<void> } = {
    '/start': handleStart,
};

const authenticatedCommandMap: { [key: string]: (msg: TelegramMessage, state: UserState, env: Env) => Promise<void> } = {
    '/start': (msg, state, env) => showMainMenu(msg.chat.id, `Вы уже вошли как ${state.user?.nickname}.`, env),
    '/stats': handleShowStatsCommand,
    '/addbet': handleStartAddBetCommand,
    '/competitions': handleShowCompetitionsCommand,
    '/goals': handleShowGoalsCommand,
    '/ai': handleStartAiChatCommand,
};

const commonCommandMap: { [key: string]: (msg: TelegramMessage, env: Env) => Promise<void> } = {
    '/help': handleHelp,
    '/reset': handleReset,
};

const unauthenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, env: Env) => Promise<void> } = {
    'register': handleRegister,
    'login': handleLogin,
};

const authenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, state: UserState, env: Env) => Promise<void> } = {
    'show_stats': handleShowStatsCallback,
    'add_bet': handleStartAddBetCallback,
    'show_competitions': handleShowCompetitionsCallback,
    'show_goals': handleShowGoalsCallback,
    'ai_chat': handleStartAiChatCallback,
    'main_menu': (cb, state, env) => showMainMenu(cb.message.chat.id, "Главное меню", env, cb.message.message_id),
    'view_leaderboard': handleViewLeaderboard,
};


// --- Main Handlers ---

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        if (text.startsWith('/')) {
            const command = text.split(' ')[0];

            if (state.user) {
                const handler = authenticatedCommandMap[command];
                if (handler) {
                    await handler(message, state, env);
                    return;
                }
            } else {
                const handler = unauthenticatedCommandMap[command];
                if (handler) {
                    await handler(message, env);
                    return;
                }
            }
            
            const commonHandler = commonCommandMap[command];
            if (commonHandler) {
                await commonHandler(message, env);
                return;
            }
        }
        
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch && !state.dialog) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }
        
        if (text.startsWith('/')) {
             await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help для списка команд.", env);
        } else if (state.user) {
             // Do nothing for random text when logged in, to avoid spamming the user
        } else {
            await handleStart(message, env);
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const action = callbackQuery.data.split(':')[0];

        await answerCallbackQuery(callbackQuery.id, env);

        if (action.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }
        
        if (state.user) {
            const handler = authenticatedCallbackMap[action];
            if (handler) {
                await handler(callbackQuery, state, env);
                return;
            }
        } else {
            const handler = unauthenticatedCallbackMap[action];
            if (handler) {
                await handler(callbackQuery, env);
                return;
            }
        }

        console.warn(`Received unhandled callback_query data: ${callbackQuery.data} for chat ${chatId}`);

    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
