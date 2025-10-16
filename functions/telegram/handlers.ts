// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import {
    handleStart, handleAuth, handleLogin, handleRegister, handleHelp, handleReset,
    handleShowStatsCommand, handleShowStatsCallback,
    handleStartAddBetCommand, handleStartAddBetCallback,
    handleShowCompetitionsCommand, handleShowCompetitionsCallback,
    handleShowGoalsCommand, handleShowGoalsCallback,
    handleStartAiChatCommand, handleStartAiChatCallback,
    handleViewLeaderboard
} from './commands';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';
import { showMainMenu } from './ui';

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

// Map for exact callback data matches
const authenticatedCallbackMap: { [key: string]: (cb: TelegramCallbackQuery, state: UserState, env: Env) => Promise<void> } = {
    'show_stats': handleShowStatsCallback,
    'add_bet': handleStartAddBetCallback,
    'show_competitions': handleShowCompetitionsCallback,
    'show_goals': handleShowGoalsCallback,
    'ai_chat': handleStartAiChatCallback,
    'main_menu': (cb, state, env) => showMainMenu(cb.message.chat.id, "Главное меню", env, cb.message.message_id),
};


// --- Main Handlers ---

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Highest priority: Active dialogs (unless a command is issued)
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        // 2. Handle commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            let handlerFound = false;

            if (state.user) {
                const handler = authenticatedCommandMap[command];
                if (handler) {
                    await handler(message, state, env);
                    handlerFound = true;
                }
            } else {
                const handler = unauthenticatedCommandMap[command];
                if (handler) {
                    await handler(message, env);
                    handlerFound = true;
                }
            }
            
            if (!handlerFound) {
                const commonHandler = commonCommandMap[command];
                if (commonHandler) {
                    await commonHandler(message, env);
                    handlerFound = true;
                }
            }

            if (handlerFound) {
                return;
            }
        }
        
        // 3. Handle 6-digit auth code if not in a dialog
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch && !state.dialog) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }
        
        // 4. Fallback behavior
        if (text.startsWith('/')) {
             await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help для списка команд.", env);
        } else if (!state.user && !state.dialog) {
            // If the user is not logged in and not in a dialog, show the start message for any text
            await handleStart(message, env);
        }
        // If logged in and it's not a command or dialog, do nothing to avoid spam.

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const data = callbackQuery.data;

        // Acknowledge the button press immediately.
        await answerCallbackQuery(callbackQuery.id, env);

        // --- ROUTING LOGIC ---

        // 1. Dialog actions are highest priority
        if (data.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
            return;
        }
        
        // 2. Handle based on authentication status
        if (state.user) {
            // Check for exact matches in the authenticated map first
            const staticHandler = authenticatedCallbackMap[data];
            if (staticHandler) {
                await staticHandler(callbackQuery, state, env);
                return;
            }
            
            // Check for parameterized authenticated actions
            if (data.startsWith('view_leaderboard:')) {
                await handleViewLeaderboard(callbackQuery, state, env);
                return;
            }

        } else { // User is NOT authenticated
            const unauthHandler = unauthenticatedCallbackMap[data];
            if (unauthHandler) {
                await unauthHandler(callbackQuery, env);
                return;
            }
        }

        // 3. Fallback for unhandled callbacks
        console.warn(`Received unhandled callback_query data: "${data}" for chat ${chatId}`);
        // Optionally, send a message to the user that the button is outdated or invalid.
        // await sendMessage(chatId, "Эта кнопка больше не активна.", env);

    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}