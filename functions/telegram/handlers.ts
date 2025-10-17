
// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset, showCompetitions, showGoals, showStats, handleAuth } from './commands';
import { continueDialog, startLoginDialog, startRegisterDialog, startAiChatDialog, startAddBetDialog } from './dialogs';
import { answerCallbackQuery, reportError, sendMessage } from './telegramApi';
import { CB } from './router';
import { showMainMenu, showLoginOptions } from './ui';
import { showBetsList } from './manageBets';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';
        const command = text.split(' ')[0];

        // Dialogs take precedence over text input unless it's a command
        if (state.dialog && !command.startsWith('/')) {
            await continueDialog(message, state, env);
            return;
        }

        switch (command) {
            case '/start':
                await handleStart(message, state, env);
                return;
            case '/help':
                await handleHelp(chatId, env);
                return;
            case '/reset':
                await handleReset(chatId, env);
                return;
            case '/stop': // For stopping AI chat
                if (state.dialog?.type === 'ai_chat') {
                    await continueDialog(message, state, env);
                }
                return;
        }
        
        // Check for 6-digit auth code
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }

        // If no dialog or command matched, show appropriate menu
        if (state.user) {
            await showMainMenu(message, env);
        } else {
            await showLoginOptions(message, env, "Неизвестная команда. Пожалуйста, войдите или зарегистрируйтесь.");
        }

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    try {
        const state = await getUserState(chatId, env);
        
        await answerCallbackQuery(callbackQuery.id, env);
        
        const data = callbackQuery.data;

        // If a dialog is active, it takes priority
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        // --- AUTH ---
        if (data === CB.LOGIN) {
            await startLoginDialog(chatId, state, env, messageId);
            return;
        }
        if (data === CB.REGISTER) {
            await startRegisterDialog(chatId, state, env, messageId);
            return;
        }

        // --- AUTH GUARD ---
        if (!state.user) {
            await showLoginOptions(callbackQuery, env, "Для этого действия нужно войти в аккаунт.");
            return;
        }
        
        // --- MAIN MENU & OTHER ROUTING ---
        switch (true) {
            case data === CB.ADD_BET:
                await startAddBetDialog(chatId, state, env);
                break;
            case data === CB.SHOW_STATS:
                await showStats(callbackQuery, state, env);
                break;
            case data === CB.SHOW_COMPETITIONS:
                await showCompetitions(callbackQuery, env);
                break;
            case data === CB.SHOW_GOALS:
                await showGoals(callbackQuery, state, env);
                break;
            case data.startsWith('bets_'):
            case data.startsWith('bet_'):
                await showBetsList(callbackQuery, state, env);
                break;
            case data === CB.MANAGE_BETS:
                 await showBetsList(callbackQuery, state, env);
                break;
            case data === CB.SHOW_AI_ANALYST:
                await startAiChatDialog(chatId, state, env);
                break;
            case data === CB.BACK_TO_MENU:
                await showMainMenu(callbackQuery, env);
                break;
            default:
                console.warn(`Unhandled callback query data: ${data}`);
                await sendMessage(chatId, "Это действие пока не поддерживается.", env);
                break;
        }
        
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
