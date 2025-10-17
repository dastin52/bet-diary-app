import { BetStatus, Env, TelegramUpdate, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { reportError } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { showLoginOptions, showMainMenu } from './ui';
import { findUserBy, addUser, findUserByEmail } from '../data/userStore';
import { generateShortStatsReport, generateDetailedReport, generateHtmlReport } from './analytics';
import { sendDocument } from './telegramApi';
import { startManageBets } from './manageBets';

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

const getUpdatePayload = (update: TelegramUpdate) => 'message' in update ? update.message : update.callbackQuery.message;
const getChatId = (update: TelegramUpdate): number => 'message' in update ? update.message.chat.id : update.callbackQuery.message.chat.id;

// --- Global Commands (can interrupt dialogs) ---
export async function handleStart(update: TelegramUpdate, state: UserState, env: Env) {
    if (state.dialog) {
        state.dialog = null;
        await setUserState(getChatId(update), state, env);
    }
    
    if (state.user) {
        await showMainMenu(getUpdatePayload(update), env, `👋 Привет, ${state.user.nickname}! Чем могу помочь?`);
    } else {
        await showLoginOptions(getUpdatePayload(update), env, `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, вам нужно войти или зарегистрироваться.`);
    }
}

export async function handleReset(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const freshState = normalizeState({ user: state.user }); // Keep user, reset everything else
    await setUserState(chatId, freshState, env);
    await showMainMenu(getUpdatePayload(update), env, "Ваше состояние было сброшено. Вы вернулись в главное меню.");
}


// --- Regular Commands ---
export async function handleAddBet(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    await startAddBetDialog(update, state, env);
}

export async function handleManageBets(update: TelegramUpdate, state: UserState, env: Env) {
     if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    await startManageBets(update, state, env);
}

export async function handleStats(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    const report = generateShortStatsReport(state);
    const { showStatsMenu } = await import('./ui');
    await showStatsMenu(getUpdatePayload(update), env, report);
}

export async function handleShowDetailedReport(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    const report = generateDetailedReport(state);
    const { showStatsMenu } = await import('./ui');
    await showStatsMenu(getUpdatePayload(update), env, report);
}

export async function handleDownloadReport(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    
    const { message } = getUpdatePayload(update);
    await editMessageText(chatId, message.message_id, "⏳ Готовлю ваш отчет...", env);

    const htmlReport = generateHtmlReport(state);
    const blob = new Blob([htmlReport], { type: 'text/html' });
    
    await sendDocument(chatId, blob, 'BetDiary_Отчет.html', env);
    await showMainMenu(message, env, "Ваш отчет готов!");
}


export async function handleCompetitions(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    await showMainMenu(getUpdatePayload(update), env, "🏆 Раздел соревнований в разработке.");
}

export async function handleGoals(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
    await showMainMenu(getUpdatePayload(update), env, "🎯 Раздел целей в разработке.");
}

export async function handleAiAnalyst(update: TelegramUpdate, state: UserState, env: Env) {
     if (!state.user) return await showLoginOptions(getUpdatePayload(update), env, "Сначала нужно войти в аккаунт.");
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
    await showMainMenu(getUpdatePayload(update), env, helpText);
}

export async function handleAuth(update: TelegramUpdate, state: UserState, env: Env, code: string) {
    const chatId = getChatId(update);
    try {
        const key = `tgauth:${code}`;
        const dataString = await env.BOT_STATE.get(key);

        if (!dataString) {
            await showLoginOptions(getUpdatePayload(update), env, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код в веб-приложении.");
            return;
        }

        const userData = JSON.parse(dataString);
        const newState = normalizeState(userData);

        if (!newState.user) throw new Error("User data from KV is invalid.");
        
        // Before setting the new state, check if a user with this email already has a chat ID
        const existingUserByEmail = await findUserBy(u => u.email === newState.user!.email, env);
        if (existingUserByEmail) {
            // This is a re-login or linking a new device. We should preserve existing user data.
            const permanentState = await findUserByEmail(newState.user.email, env);
            if (permanentState) {
                await setUserState(chatId, permanentState, env);
                await env.BOT_STATE.delete(key);
                await handleStart(update, permanentState, env);
                return;
            }
        }
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key);
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));

        await handleStart(update, newState, env);

    } catch (error) {
        await reportError(chatId, env, 'Auth Handler', error);
    }
}
