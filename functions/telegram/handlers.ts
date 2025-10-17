// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState } from './types';
import { getUserState } from './state';
import { handleStart, handleHelp, handleReset } from './commands';
import { showLoginOptions, showMainMenu } from './ui';
import { CB } from './router';
import { answerCallbackQuery, reportError, editMessageText } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, continueDialog, startAiChatDialog } from './dialogs';
import { manageBets } from './manageBets';
import { generateStatsReport } from './analytics';

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);

        if (state.dialog) {
            await continueDialog(message, state, env);
            return;
        }

        const text = message.text || '';

        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            switch (command) {
                case '/start':
                case '/menu':
                    await handleStart(message, state, env);
                    return;
                case '/help':
                    await handleHelp(message, env);
                    return;
                case '/reset':
                    await handleReset(message, env);
                    return;
            }
        }
        
        await handleStart(message, state, env);

    } catch (error) {
        await reportError(chatId, env, 'Message Handler', error);
    }
}


export async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        
        await answerCallbackQuery(callbackQuery.id, env);

        if (state.dialog && callbackQuery.data !== 'dialog_cancel') {
            await continueDialog(callbackQuery, state, env);
            return;
        }

        const data = callbackQuery.data;

        if (data.startsWith(CB.MANAGE_BETS)) {
             await manageBets(callbackQuery, state, env);
             return;
        }

        switch (data) {
            case CB.BACK_TO_MAIN:
                await showMainMenu(callbackQuery, env);
                break;
            case CB.LOGIN:
                await startLoginDialog(chatId, state, env, callbackQuery.message.message_id);
                break;
            case CB.REGISTER:
                await startRegisterDialog(chatId, state, env, callbackQuery.message.message_id);
                break;
            case CB.ADD_BET:
                await startAddBetDialog(chatId, state, env);
                break;
            case CB.SHOW_STATS:
                const report = generateStatsReport(state);
                await editMessageText(chatId, callbackQuery.message.message_id, report, env, { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]] });
                break;
            case CB.SHOW_AI_ANALYST:
                await startAiChatDialog(chatId, state, env);
                break;
            case CB.SHOW_COMPETITIONS:
            case CB.SHOW_GOALS:
                 await editMessageText(chatId, callbackQuery.message.message_id, "🚧 Эта функция находится в разработке.", env, { inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]] });
                 break;
            // Handle cancel from a dialog that might have been missed
            case 'dialog_cancel':
                 if (state.dialog) {
                    await continueDialog(callbackQuery, state, env);
                 } else {
                    await showMainMenu(callbackQuery, env);
                 }
                 break;
        }
    } catch (error) {
        await reportError(chatId, env, 'Callback Query Handler', error);
    }
}
