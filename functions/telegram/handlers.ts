// functions/telegram/handlers.ts
// This file acts as the main router for incoming Telegram updates.

import { TelegramMessage, TelegramCallbackQuery, Env } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset, handleAddBet, handleStats, handleAuth } from './commands';
import { continueAddBetDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);

        // If a dialog is active, all text messages go to it, unless it's a command.
        if (state.dialog && message.text && !message.text.startsWith('/')) {
            await continueAddBetDialog(message, state, env);
            return;
        }

        const text = message.text || '';

        // Check for commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/start':
                    await handleStart(message, env);
                    return;
                case '/help':
                    await handleHelp(message, env);
                    return;
                case '/reset':
                    await handleReset(message, env);
                    return;
                case '/addbet':
                    await handleAddBet(message, env);
                    return;
                case '/stats':
                    await handleStats(message, env);
                    return;
            }
        }
        
        // Check for 6-digit auth code
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }

        // Default response if no command or dialog is matched
        if (text.startsWith('/')) {
            await sendMessage(chatId, "🤔 Неизвестная команда. Используйте /help, чтобы увидеть список доступных команд.", env);
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        // Acknowledge the button press immediately to remove the "loading" state on the button.
        await answerCallbackQuery(callbackQuery.id, env);

        if (state.dialog && callbackQuery.data.startsWith('dialog_')) {
            await continueAddBetDialog(callbackQuery, state, env);
        } else {
            console.warn(`Received unhandled callback_query data: ${callbackQuery.data} for chat ${chatId}`);
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
