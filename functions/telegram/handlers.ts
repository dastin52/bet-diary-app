// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import { continueDialog, startAiChatDialog } from './dialogs';
import { routeCallback, CB } from './router';
import { handleAuth, handleStart, handleHelp, handleReset, handleAddBet, handleStats } from './commands';
import { reportError, answerCallbackQuery } from './telegramApi';
import { showLoginOptions } from './ui';
import { manageBets } from './manageBets';

async function executeCommand(command: string, message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;
    switch(command) {
        case '/start':
            await handleStart(message, env);
            break;
        case '/help':
            await handleHelp(chatId, env);
            break;
        case '/reset':
            await handleReset(chatId, env);
            break;
        case '/addbet':
            if (!state.user) return showLoginOptions(message, env, 'Действие требует авторизации.');
            await handleAddBet(chatId, state, env);
            break;
        case '/stats':
            if (!state.user) return showLoginOptions(message, env, 'Действие требует авторизации.');
            await handleStats(chatId, state, env);
            break;
        case '/manage':
             if (!state.user) return showLoginOptions(message, env, 'Действие требует авторизации.');
             const fakeCallbackQuery: TelegramCallbackQuery = {
                 id: 'fake_cq_id_from_manage', from: message.from, message,
                 data: 'm|list|0'
             };
             await manageBets(fakeCallbackQuery, state, env);
            break;
        case '/ai':
            if (!state.user) return showLoginOptions(message, env, 'Действие требует авторизации.');
            await startAiChatDialog(chatId, state, env);
            break;
        default:
            await handleHelp(chatId, env);
    }
}

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
            await executeCommand(command, message, state, env);
            return;
        }

        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }
        
        await handleStart(message, env);

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}

export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        await answerCallbackQuery(callbackQuery.id, env);
        const state = await getUserState(chatId, env);
        
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
        } else {
            await routeCallback(callbackQuery, state, env);
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
