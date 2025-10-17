// functions/telegram/commands.ts
import { BetStatus, Env, TelegramMessage, UserState, TelegramCallbackQuery } from './types';
import { setUserState, normalizeState } from './state';
import { sendMessage, editMessageText, deleteMessage, reportError } from './telegramApi';
import { startAddBetDialog, startAiChatDialog, startLoginDialog, startRegisterDialog } from './dialogs';
import { showMainMenu, showLoginOptions, makeKeyboard } from './ui';
import { CB } from './router';
import * as userStore from '../data/userStore';

const isCallback = (update: TelegramMessage | TelegramCallbackQuery): update is TelegramCallbackQuery => 'data' in update;

function getStatsText(state: UserState): string {
    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    if (settledBets.length === 0) {
        return "У вас пока нет рассчитанных ставок для отображения статистики.";
    }
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    return `*📊 Ваша статистика*

- *Текущий банк:* ${state.bankroll.toFixed(2)} ₽
- *Общая прибыль:* ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽
- *ROI:* ${roi.toFixed(2)}%
- *Процент выигрышей:* ${winRate.toFixed(2)}%
- *Всего рассчитанных ставок:* ${settledBets.length}`;
}

export async function handleStart(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (state.user) {
        await showMainMenu(update, env);
    } else {
        await showLoginOptions(update, env, `👋 *Добро пожаловать в BetDiary Бот!*\n\nВойдите или зарегистрируйтесь, чтобы начать.`);
    }
}

export async function handleAddBet(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    if (isCallback(update)) {
        await deleteMessage(chatId, update.message.message_id, env).catch(e => console.error("Failed to delete message:", e));
    }
    await startAddBetDialog(chatId, state, env);
}

export async function handleStats(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const statsText = getStatsText(state);
    const keyboard = makeKeyboard([[{ text: '⬅️ В меню', callback_data: CB.SHOW_MAIN_MENU }]]);
    if (isCallback(update)) {
        await editMessageText(update.message.chat.id, update.message.message_id, statsText, env, keyboard);
    } else {
        await sendMessage(update.chat.id, statsText, env, keyboard);
    }
}

export async function handleHelp(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    const helpText = `*Список доступных команд:*\n\n/start - Главное меню\n/addbet - 📝 Добавить ставку\n/stats - 📊 Показать статистику\n/reset - ⚠️ Сбросить состояние\n/help - ℹ️ Показать это сообщение`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = isCallback(update) ? update.message.chat.id : update.chat.id;
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено. Отправьте /start, чтобы начать заново.", env);
}

export async function handleRegister(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await startRegisterDialog(update.message.chat.id, state, env, update.message.message_id);
}

export async function handleLogin(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await startLoginDialog(update.message.chat.id, state, env, update.message.message_id);
}

export async function handleCompetitions(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await editMessageText(update.message.chat.id, update.message.message_id, "Раздел 'Соревнования' находится в разработке.", env, makeKeyboard([[{ text: '⬅️ В меню', callback_data: CB.SHOW_MAIN_MENU }]]));
}

export async function handleGoals(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await editMessageText(update.message.chat.id, update.message.message_id, "Раздел 'Мои цели' находится в разработке.", env, makeKeyboard([[{ text: '⬅️ В меню', callback_data: CB.SHOW_MAIN_MENU }]]));
}

export async function handleManageBets(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await editMessageText(update.message.chat.id, update.message.message_id, "Раздел 'Управление ставками' доступен на сайте.", env, makeKeyboard([[{ text: '⬅️ В меню', callback_data: CB.SHOW_MAIN_MENU }]]));
}

export async function handleAiAnalyst(update: TelegramCallbackQuery, state: UserState, env: Env) {
    await deleteMessage(update.message.chat.id, update.message.message_id, env).catch(e => console.error("Failed to delete message:", e));
    await startAiChatDialog(update.message.chat.id, state, env);
}

export async function handleManage(update: TelegramMessage, state: UserState, env: Env) {
    await sendMessage(update.chat.id, "Раздел 'Управление ставками' доступен на сайте.", env);
}

export async function handleGetCode(update: TelegramMessage, state: UserState, env: Env) {
    await sendMessage(update.chat.id, "Код для входа на сайт можно получить в веб-приложении.", env);
}

export async function handleUnknownCommand(update: TelegramMessage, state: UserState, env: Env) {
    await sendMessage(update.chat.id, "🤔 Неизвестная команда. Используйте /help для списка команд.", env);
}

export async function handleAuth(message: TelegramMessage, code: string, env: Env) {
    const chatId = message.chat.id;
    try {
        const key = `tgauth:${code}`;
        const dataString = await env.BOT_STATE.get(key);
        if (!dataString) {
            await sendMessage(chatId, "❌ Неверный или истекший код.", env);
            return;
        }
        await env.BOT_STATE.delete(key);

        const userData = JSON.parse(dataString);
        const newState = normalizeState(userData);

        if (!newState.user) throw new Error("User data from KV is invalid.");
        
        // Save the full state to a persistent user-specific key for future logins
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
        
        // Save/update the user object in our userStore for global lookups
        const existingUser = await userStore.findUserBy(u => u.email === newState.user!.email, env);
        if (!existingUser) {
            await userStore.addUser(newState.user, env);
        } else {
            await userStore.updateUser(newState.user, env);
        }
        
        await setUserState(chatId, newState, env);
        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);
        await showMainMenu(message, env);
    } catch (error) {
        await reportError(chatId, env, 'Auth Handler', error);
    }
}
