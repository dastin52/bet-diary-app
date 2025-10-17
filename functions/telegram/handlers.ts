// functions/telegram/handlers.ts
import { TelegramMessage, TelegramCallbackQuery, Env, UserState, Dialog } from './types';
import { getUserState, setUserState } from './state';
import { continueDialog } from './dialogs';
import { routeCallback, CB, MANAGE_PREFIX } from './router';
import { handleAuth, handleStart, handleHelp, handleReset } from './commands';
import { reportError, answerCallbackQuery } from './telegramApi';
import { manageBets } from './manageBets';

// Global commands that should interrupt any active dialog
const GLOBAL_COMMANDS = ['/start', '/help', '/reset', '/menu'];

export async function handleMessage(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    try {
        const state = await getUserState(chatId, env);
        const text = message.text || '';

        // 1. Handle global commands first
        if (text.startsWith('/')) {
            const command = text.split(' ')[0];
            if (GLOBAL_COMMANDS.includes(command)) {
                // If a dialog was active, cancel it before proceeding
                if (state.dialog) {
                    state.dialog = null;
                    await setUserState(chatId, state, env);
                }
                switch (command) {
                    case '/start':
                    case '/menu':
                        await handleStart(message, env);
                        return;
                    case '/help':
                        await handleHelp(chatId, env);
                        return;
                    case '/reset':
                        await handleReset(chatId, env);
                        return;
                }
            }
        }
        
        // 2. If a dialog is active, pass the message to it
        if (state.dialog) {
            await continueDialog(message, state, env);
            return;
        }

        // 3. Handle 6-digit auth code
        const authCodeMatch = text.match(/^\d{6}$/);
        if (authCodeMatch) {
            await handleAuth(message, authCodeMatch[0], env);
            return;
        }

        // 4. Handle other non-global commands or route to the router
        if (text.startsWith('/')) {
            await routeCallback({
                id: 'fake_cq_id_from_text_cmd',
                from: message.from,
                message: message,
                data: text.substring(1) // Convert command to callback data, e.g., /stats -> stats
            }, state, env);
            return;
        }
        
        // 5. If nothing else matches, show the main menu
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
        
        // If a dialog is active, pass the callback to it
        if (state.dialog) {
            await continueDialog(callbackQuery, state, env);
        } 
        // Route all other callbacks via the main router
        else {
            await routeCallback(callbackQuery, state, env);
        }
    } catch (error) {
        await reportError(chatId, env, `Callback Query Handler (${callbackQuery.data})`, error);
    }
}
