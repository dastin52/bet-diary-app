// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset } from './commands';
import { continueDialog } from './dialogs';
import { answerCallbackQuery, reportError } from './telegramApi';
import { handleRoute } from './router';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // If a dialog is active, all text messages go to it, unless it's a command.
        if (state.dialog && !text.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        // Handle commands
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/start':
                case '/help':
                    await handleStart(message, state, env);
                    return;
                case '/reset':
                    await handleReset(message, env);
                    return;
                default:
                     await handleStart(message, state, env);
                     break;
            }
        } else {
             await handleStart(message, state, env);
        }
    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}

export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        // Acknowledge the button press immediately
        await answerCallbackQuery(callbackQuery.id, env);

        // If data starts with 'dialog_', it's part of an active conversation
        if (callbackQuery.data.startsWith('dialog_')) {
            await continueDialog(callbackQuery, state, env);
        } else {
            // Otherwise, it's a menu button or other action, handled by the router
            await handleRoute(callbackQuery, state, env);
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
