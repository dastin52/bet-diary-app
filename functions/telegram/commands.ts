// functions/telegram/commands.ts
import { BetStatus, Env, TelegramCallbackQuery, TelegramMessage, UserState, Dialog } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage, editMessageText, deleteMessage } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { getPeriodStart } from '../utils/dateHelpers';

// --- AUTH & START ---

export async function handleStart(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (state.user) {
        await showMainMenu(chatId, `👋 С возвращением, ${state.user.nickname}!`, env, message.message_id);
    } else {
        await showLoginOptions(chatId, env);
    }
}

export async function handleRegister(callbackQuery: TelegramCallbackQuery, env: Env) {
    await startRegisterDialog(callbackQuery.message.chat.id, await getUserState(callbackQuery.message.chat.id, env), env, callbackQuery.message.message_id);
}

export async function handleLogin(callbackQuery: TelegramCallbackQuery, env: Env) {
    await startLoginDialog(callbackQuery.message.chat.id, await getUserState(callbackQuery.message.chat.id, env), env, callbackQuery.message.message_id);
}


export async function handleAuth(message: TelegramMessage, code: string, env: Env) {
    const chatId = message.chat.id;
    try {
        const key = `tgauth:${code}`;
        const dataString = await env.BOT_STATE.get(key);

        if (!dataString) {
            await sendMessage(chatId, "❌ Неверный или истекший код. Пожалуйста, сгенерируйте новый код в веб-приложении.", env);
            return;
        }

        const userData = JSON.parse(dataString);
        const newState = normalizeState(userData);

        if (!newState.user) throw new Error("User data from KV is invalid.");
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key);
        // Delete the message with the code for security
        await deleteMessage(chatId, message.message_id, env);

        await showMainMenu(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);

    } catch (error) {
        await sendMessage(chatId, "Произошла ошибка при проверке кода.", env);
    }
}


// --- MAIN MENU & CORE FEATURES ---

export async function handleShowStats(query: TelegramCallbackQuery | TelegramMessage, state: UserState, env: Env) {
    const chatId = "message" in query ? query.message.chat.id : query.chat.id;
    const messageId = "message" in query ? query.message.message_id : query.message_id;

    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    if (settledBets.length === 0) {
        await editMessageText(chatId, messageId, "У вас пока нет рассчитанных ставок для отображения статистики.", env, { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]]});
        return;
    }
    
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const lostBets = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    const statsText = `*📊 Ваша статистика*

- *Банк:* ${state.bankroll.toFixed(2)} ₽
- *Прибыль:* ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽
- *Оборот:* ${totalStaked.toFixed(2)} ₽
- *ROI:* ${roi.toFixed(2)}%
- *Win Rate:* ${winRate.toFixed(2)}%
- *Всего ставок:* ${settledBets.length} (${wonBets}В / ${lostBets}П)
`;

    await editMessageText(chatId, messageId, statsText, env, { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]]});
}

export async function handleStartAddBet(query: TelegramCallbackQuery | TelegramMessage, state: UserState, env: Env) {
    const chatId = "message" in query ? query.message.chat.id : query.chat.id;
    const messageId = "message" in query ? query.message.message_id : query.message_id;
    await deleteMessage(chatId, messageId, env);
    await startAddBetDialog(chatId, state, env);
}

// --- COMPETITIONS ---
export async function handleShowCompetitions(query: TelegramCallbackQuery | TelegramMessage, state: UserState, env: Env) {
    const chatId = "message" in query ? query.message.chat.id : query.chat.id;
    const messageId = "message" in query ? query.message.message_id : query.message_id;
    const keyboard = {
        inline_keyboard: [
            [{ text: 'Неделя', callback_data: 'view_leaderboard:week' }, { text: 'Месяц', callback_data: 'view_leaderboard:month' }],
            [{ text: 'Год', callback_data: 'view_leaderboard:year' }, { text: 'Все время', callback_data: 'view_leaderboard:all_time' }],
            [{ text: '⬅️ В меню', callback_data: 'main_menu' }],
        ]
    };
    const text = "🏆 *Соревнования*\n\nВыберите период для просмотра таблицы лидеров:";
    if ("message" in query) { 
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handleViewLeaderboard(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    // This is a simplified version. A full implementation would query all users.
    const period = callbackQuery.data.split(':')[1] as 'week' | 'month' | 'year' | 'all_time';
    const text = `🏆 Таблица лидеров за период "${period}" находится в разработке.`;
    const keyboard = { inline_keyboard: [[{ text: '⬅️ Назад к соревнованиям', callback_data: 'show_competitions' }]] };
    await editMessageText(callbackQuery.message.chat.id, callbackQuery.message.message_id, text, env, keyboard);
}


// --- GOALS & AI ---
export async function handleShowGoals(query: TelegramCallbackQuery | TelegramMessage, state: UserState, env: Env) {
    const chatId = "message" in query ? query.message.chat.id : query.chat.id;
    const messageId = "message" in query ? query.message.message_id : query.message_id;
    const text = "🚧 Раздел 'Мои цели' находится в разработке.";
    const keyboard = { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]] };

    if ("message" in query) { // CallbackQuery
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else { // Message
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handleStartAiChat(query: TelegramCallbackQuery | TelegramMessage, state: UserState, env: Env) {
    const chatId = "message" in query ? query.message.chat.id : query.chat.id;
    const messageId = "message" in query ? query.message.message_id : query.message_id;
    await startAiChatDialog(chatId, state, env, messageId);
}

// --- HELPERS ---
export async function showMainMenu(chatId: number, text: string, env: Env, messageId?: number) {
    const keyboard = {
        inline_keyboard: [
            [{ text: '📊 Статистика', callback_data: 'show_stats' }, { text: '➕ Добавить ставку', callback_data: 'add_bet' }],
            [{ text: '🏆 Соревнования', callback_data: 'show_competitions' }, { text: '🎯 Мои цели', callback_data: 'show_goals' }],
            [{ text: '🤖 AI-Аналитик', callback_data: 'ai_chat' }],
        ]
    };
    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function showLoginOptions(chatId: number, env: Env, messageId?: number) {
    const text = `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, войдите в свой аккаунт, зарегистрируйтесь или привяжите существующий аккаунт с помощью кода с сайта.`;
    const keyboard = {
        inline_keyboard: [
            [{ text: '➡️ Войти', callback_data: 'login' }, { text: '📝 Регистрация', callback_data: 'register' }],
        ]
    };
     if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

// FIX: Add missing handleHelp function.
export async function handleHelp(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const helpText = `*Список доступных команд:*

/start - Начало работы или главное меню
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/competitions - 🏆 Открыть раздел соревнований
/goals - 🎯 Открыть раздел целей
/ai - 🤖 Поговорить с AI-аналитиком
/reset - ⚠️ Сбросить состояние (если что-то пошло не так)
/help - ℹ️ Показать это сообщение

Вы также можете просто отправить 6-значный код для привязки аккаунта.`;
    await sendMessage(chatId, helpText, env);
}

// FIX: Add missing handleReset function.
export async function handleReset(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    // Reset state by saving a normalized null, which provides a clean default state.
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено. Отправьте /start, чтобы начать заново.", env);
}
