// src/telegram/handlers.ts
import { handleDialog } from './dialogs';
import { getUserState } from './state';
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { 
    handleStart, handleMenu, handleAuthCode, handleUnknownCommand, 
    handleStartRegister, handleStartLogin, handleShowStats, handleStartAddBet, 
    handleShowCompetitions, handleShowGoals, handleStartAiChat, handleCancelDialog 
} from './commands';
// FIX: Removed unused import 'showLoginOptions' which is not exported from './telegramApi'.
import { showStartMenu } from './telegramApi';

// Command map for authenticated users' callback queries
const authenticatedCallbackMap: { [key: string]: (chatId: number, state: UserState, env: Env, messageId: number, data: string) => Promise<void> } = {
    'show_stats': handleShowStats,
    'add_bet': handleStartAddBet,
    'show_competitions': handleShowCompetitions,
    'show_goals': handleShowGoals,
    'ai_chat': handleStartAiChat,
    'cancel_dialog': handleCancelDialog,
};

// Command map for unauthenticated users' callback queries
const unauthenticatedCallbackMap: { [key: string]: (chatId: number, state: UserState, env: Env, messageId: number, data: string) => Promise<void> } = {
    'start_register': handleStartRegister,
    'start_login': handleStartLogin,
    'login_password': (chatId, state, env, mid) => handleDialog(chatId, 'start_login_password', state, env, mid),
    'login_code': (chatId, state, env, mid) => handleDialog(chatId, 'start_login_code', state, env, mid),
    'cancel_dialog': handleCancelDialog,
};


export async function handleMessage(message: TelegramMessage, env: Env): Promise<void> {
    const chatId = message.chat.id;
    const text = message.text?.trim() ?? '';
    const state = await getUserState(chatId, env);

    // 1. Prioritize active dialogs
    if (state.dialog?.step) {
        await handleDialog(chatId, text, state, env, message.message_id);
        return;
    }

    // 2. Handle commands
    if (text.startsWith('/start')) {
        await handleStart(chatId, state, env);
    } else if (text.startsWith('/menu')) {
        await handleMenu(chatId, state, env);
    } 
    // 3. Handle specific patterns like auth codes
    else if (/^\d{6}$/.test(text)) {
        await handleAuthCode(chatId, text, state, env);
    } 
    // 4. Default handler for unknown messages
    else {
        await handleUnknownCommand(chatId, state, env);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env): Promise<void> {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const state = await getUserState(chatId, env);

    // Always answer the callback query to remove the loading spinner on the user's side
    await env.TELEGRAM.answerCallbackQuery({ callback_query_id: callbackQuery.id });

    const command = data.split(':')[0];

    if (state.user) {
        const handler = authenticatedCallbackMap[command];
        if (handler) {
            await handler(chatId, state, env, messageId, data);
        } else {
            console.warn(`Unknown authenticated callback command: ${command}`);
            await handleMenu(chatId, state, env, "Неизвестное действие.");
        }
    } else {
        const handler = unauthenticatedCallbackMap[command];
        if (handler) {
            await handler(chatId, state, env, messageId, data);
        } else {
            console.warn(`Unknown unauthenticated callback command: ${command}`);
            await showStartMenu(chatId, env, "Пожалуйста, сначала войдите.", messageId);
        }
    }
}