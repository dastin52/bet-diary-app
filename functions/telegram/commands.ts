// functions/telegram/commands.ts
import { BetStatus, Env, TelegramUpdate, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { reportError } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog } from './dialogs';
import { showLoginOptions, showMainMenu } from './ui';
import { findUserBy, addUser, findUserByEmail } from '../data/userStore';
import { calculateAnalytics, generateShortStatsReport } from './analytics';

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

// FIX: Helper to get the actual payload (Message or CallbackQuery) from the update wrapper.
const getUpdatePayload = (update: TelegramUpdate) => 'message' in update ? update.message : update.callbackQuery;
const getChatId = (update: TelegramUpdate): number => 'message' in update ? update.message.chat.id : update.callbackQuery.message.chat.id;

// --- Global Commands (can interrupt dialogs) ---
export async function handleStart(update: TelegramUpdate, state: UserState, env: Env) {
    if (state.dialog) {
        // If in a dialog, reset it before showing the main menu
        state.dialog = null;
        // FIX: Use chatId for setUserState, not email.
        await setUserState(getChatId(update), state, env);
    }
    
    if (state.user) {
        // FIX: Pass the unwrapped payload and the text argument.
        await showMainMenu(getUpdatePayload(update), env, `👋 Привет, ${state.user.nickname}! Чем могу помочь?`);
    } else {
        // FIX: Pass the unwrapped payload.
        await showLoginOptions(getUpdatePayload(update), env, `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, вам нужно войти или зарегистрироваться.`);
    }
}

export async function handleReset(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = 'message' in update ? update.message.chat.id : update.callbackQuery.message.chat.id;
    const freshState = normalizeState({ user: state.user }); // Keep user, reset everything else
    await setUserState(chatId, freshState, env);
    // FIX: Pass unwrapped payload.
    await showMainMenu(getUpdatePayload(update), env, "Ваше состояние было сброшено. Вы вернулись в главное меню.");
}


// --- Regular Commands ---
export async function handleAddBet(update: TelegramUpdate, state: UserState, env: Env) {
    // FIX: Pass unwrapped payload.
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    await startAddBetDialog(update, state, env);
}

export async function handleManageBets(update: TelegramUpdate, state: UserState, env: Env) {
     // FIX: Pass unwrapped payload.
     if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    // FIX: Dynamically import the module and call the correct exported function.
    const manageBets = await import('./manageBets');
    await manageBets.startManageBets(update, state, env);
}

export async function handleStats(update: TelegramUpdate, state: UserState, env: Env) {
    // FIX: Pass unwrapped payload.
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    const report = generateShortStatsReport(state);
    // FIX: Pass the unwrapped payload and the text argument.
    await showMainMenu(getUpdatePayload(update), env, report); // Show stats and then the main menu below it
}

export async function handleCompetitions(update: TelegramUpdate, state: UserState, env: Env) {
    // FIX: Pass unwrapped payload.
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    // FIX: Pass the unwrapped payload and the text argument.
    await showMainMenu(getUpdatePayload(update), env, "🏆 Раздел соревнований в разработке.");
}

export async function handleGoals(update: TelegramUpdate, state: UserState, env: Env) {
    // FIX: Pass unwrapped payload.
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    // FIX: Pass the unwrapped payload and the text argument.
    await showMainMenu(getUpdatePayload(update), env, "🎯 Раздел целей в разработке.");
}

export async function handleAiAnalyst(update: TelegramUpdate, state: UserState, env: Env) {
     // FIX: Pass unwrapped payload.
     if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    const { startAiChatDialog } = await import('./dialogs');
    await startAiChatDialog(update, state, env);
}

export async function handleRegister(update: TelegramUpdate, state: UserState, env: Env) {
    await startRegisterDialog(update, state, env);
}

export async function handleLogin(update: TelegramUpdate, state: UserState, env: Env) {
    await startLoginDialog(update, state, env);
}

export async function handleHelp(update: TelegramUpdate, state: UserState, env: Env) {
    const helpText = `*Список доступных команд:*

/start или /menu - Главное меню
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/manage - 📈 Управление ставками
/reset - ⚠️ Сбросить состояние (если что-то пошло не так)
/help - ℹ️ Показать это сообщение`;

    // FIX: Pass unwrapped payload.
    await showMainMenu(getUpdatePayload(update), env, helpText);
}

export async function handleAuth(update: TelegramUpdate, state: UserState, env: Env, code: string) {
    const chatId = 'message' in update ? update.message.chat.id : update.callbackQuery.message.chat.id;
    try {
        const key = `tgauth:${code}`;
        const dataString = await env.BOT_STATE.get(key);

        if (!dataString) {
            // FIX: Pass unwrapped payload.
            await showLoginOptions(getUpdatePayload(update), env, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код в веб-приложении.");
            return;
        }

        const userData = JSON.parse(dataString);
        const newState = normalizeState(userData);

        if (!newState.user) throw new Error("User data from KV is invalid.");
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key);
        
        // Also save the full user data under the permanent key
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));

        await handleStart(update, newState, env);

    } catch (error) {
        await reportError(chatId, env, 'Auth Handler', error);
    }
}