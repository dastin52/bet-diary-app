// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import {
    handleStart, handleAuth, handleShowStats, handleStartAddBet,
    handleShowCompetitions, handleShowGoals, handleStartAiChat, handleViewLeaderboard, handleLogin, handleRegister, showMainMenu, handleHelp, handleReset
} from './commands';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';

// --- Command and Callback Maps ---

const unauthenticatedCommandMap: { [key: string]: (msg: TelegramMessage, env: Env) => Promise<void> } = {
    '/start': handleStart,
};

const authenticatedCommandMap: { [key: string]: (msg: TelegramMessage, state: UserState, env: Env) => Promise<void> } = {
    '/start': (msg, state, env) => showMainMenu(msg.chat.id, `Вы уже вошли как ${state.user?.nickname}.`, env, msg.message_id),
    '/stats': handleShowStats,
    '/addbet': handleStartAddBet,
    '/competitions': handleShowCompetitions,
    '/goals': handleShowGoals,
    '/ai': handleStartAiChat,
};

// Common commands available to everyone
const commonCommandMap: { [key: string]: (msg: TelegramMessage, env: Env) => Promise<void> } = {
    '/help': handleHelp,
    '/reset': handleReset,
};

const unauthenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, env: Env) => Promise<void> } = {
    'register': handleRegister,
    'login': handleLogin,
};

const authenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, state: UserState, env: Env) => Promise<void> } = {
    'show_stats': handleShowStats,
    'add_bet': handleStartAddBet,
    'show_competitions': handleShowCompetitions,
    'show_goals': handleShowGoals,
    'ai_chat': handleStartAiChat,
    'main_menu': (cb, state, env) => showMainMenu(cb.message.chat.id, "Главное меню", env, cb.message.message_id),
    'exit_ai_chat': (cb, state, env) => showMainMenu(cb.message.chat.id, "Вы вышли из чата с AI.", env, cb.message.message_id),
    'view_leaderboard': handleViewLeaderboard,
};


// --- Main Handlers ---

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Handle active dialogs first (for non-command messages)
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        // 2. Handle commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];

            // Check auth-specific commands first
            if (state.user) {
                const handler = authenticatedCommandMap[command];
                if (handler) {
                    await handler(message, state, env);
                    return;
                }
            } else { // Not authenticated
                const handler = unauthenticatedCommandMap[command];
                if (handler) {
                    await handler(message, env);
                    return;
                }
            }
            
            // If no specific handler was found, check common commands
            const commonHandler = commonCommandMap[command];
            if (commonHandler) {
                await commonHandler(message, env);
                return;
            }
        }
        
        // 3. Handle 6-digit auth code (if not in a dialog)
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch && !state.dialog) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }
        
        // 4. Fallback for unknown commands or unhandled text
        if (text.startsWith('/')) {
             await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help для списка команд.", env);
        } else if (state.user) {
             await sendMessage(chatId, "Непонятно. Пожалуйста, используйте команды или кнопки меню.", env);
        } else {
            // If not logged in and not a command, show start/login options
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

        // Acknowledge the button press immediately
        await answerCallbackQuery(callbackQuery.id, env);

        // 1. Handle dialog actions first
        if (action.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }
        
        // 2. Handle regular callback actions based on auth state
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

        // 3. Fallback for unhandled actions
        console.warn(`Received unhandled callback_query data: ${callbackQuery.data} for chat ${chatId}`);
        // Do not send a message here to avoid interrupting the user if they click an old button
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
