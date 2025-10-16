// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import {
    handleStart, handleAuth, handleShowStats, handleStartAddBet,
    handleShowCompetitions, handleShowGoals, handleStartAiChat, handleViewLeaderboard, handleLogin, handleRegister
} from './commands';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';

// Command mapping for unauthenticated users
const unauthenticatedCommandMap: { [key: string]: (msg: TelegramMessage, env: Env) => Promise<void> } = {
    '/start': handleStart,
};
const unauthenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, env: Env) => Promise<void> } = {
    'register': handleRegister,
    'login': handleLogin,
};

// Command mapping for authenticated users
const authenticatedCommandMap: { [key: string]: (msg: TelegramMessage, state: UserState, env: Env) => Promise<void> } = {
    '/start': (msg, state, env) => sendMessage(msg.chat.id, `Вы уже вошли как ${state.user?.nickname}.`, env),
    '/stats': handleShowStats,
    '/addbet': handleStartAddBet,
    '/competitions': handleShowCompetitions,
    '/goals': handleShowGoals,
    '/ai': handleStartAiChat,
};
const authenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, state: UserState, env: Env) => Promise<void> } = {
    'show_stats': handleShowStats,
    'add_bet': handleStartAddBet,
    'show_competitions': handleShowCompetitions,
    'show_goals': handleShowGoals,
    'ai_chat': handleStartAiChat,
    'exit_ai_chat': (cb, state, env) => handleStart(cb.message, env), // Go back to main menu
    'view_leaderboard': handleViewLeaderboard,
};

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Handle active dialogs first
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        // 2. Handle commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            const handler = state.user ? authenticatedCommandMap[command] : unauthenticatedCommandMap[command];
            if (handler) {
                // @ts-ignore
                await handler(message, state, env);
                return;
            }
        }

        // 3. Handle 6-digit auth code if not in a dialog
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch && !state.dialog) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }
        
        // 4. Fallback for unknown commands
        if (text.startsWith('/')) {
             await sendMessage(chatId, "🤔 Неизвестная команда.", env);
        } else if (state.user) {
             await sendMessage(chatId, "Неизвестное действие. Пожалуйста, используйте кнопки меню.", env);
        } else {
            await handleStart(message, env); // Show login/register options
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

        // Acknowledge the button press immediately
        await answerCallbackQuery(callbackQuery.id, env);

        // 1. Handle dialog actions
        if (action.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }
        
        // 2. Handle regular callback actions
        const handler = state.user ? authenticatedCallbackMap[action] : unauthenticatedCallbackMap[action];
        if (handler) {
            // @ts-ignore
            await handler(callbackQuery, state, env);
        } else {
             console.warn(`Received unhandled callback_query data: ${callbackQuery.data} for chat ${chatId}`);
             await reportError(chatId, env, "Callback Handler", new Error(`Unknown action: ${action}`));
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
