// functions/telegram/commands.ts
import { Env, TelegramMessage, UserState } from './types';
import { setUserState, normalizeState } from './state';
import { sendMessage } from './telegramApi';
import { showLoginOptions, showMainMenu } from './ui';

export async function handleStart(message: TelegramMessage, state: UserState, env: Env) {
    if (state.user) {
        await showMainMenu(message, env);
    } else {
        await showLoginOptions(message, env);
    }
}

export async function handleHelp(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const helpText = `*Список доступных команд:*

/start или /menu - Показать главное меню
/reset - ⚠️ Сбросить сессию (если что-то пошло не так)
/help - ℹ️ Показать это сообщение`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено.", env);
    await showLoginOptions(message, env, "Начнем заново. Войдите или зарегистрируйтесь.");
}
