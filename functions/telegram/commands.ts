// functions/telegram/commands.ts
import { BetStatus, Env, TelegramCallbackQuery, TelegramMessage, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage, editMessageText, deleteMessage } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { showMainMenu, showLoginOptions } from './ui';


// --- AUTH & START ---

export async function handleStart(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (state.user) {
        await showMainMenu(chatId, `👋 С возвращением, ${state.user.nickname}!`, env);
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
        await deleteMessage(chatId, message.message_id, env);

        await showMainMenu(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);

    } catch (error) {
        console.error("Auth error:", error);
        await sendMessage(chatId, "Произошла ошибка при проверке кода.", env);
    }
}


// --- CORE FEATURES (LOGIC) ---

async function showStatsLogic(chatId: number, messageId: number, state: UserState, env: Env) {
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
- *Всего ставок:* ${settledBets.length} (${wonBets}В / ${lostBets}П)`;

    await editMessageText(chatId, messageId, statsText, env, { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]]});
}

async function startAddBetLogic(chatId: number, messageId: number, state: UserState, env: Env) {
    // We delete the menu message and start a new dialog message
    await deleteMessage(chatId, messageId, env).catch(() => {}); // Ignore error if message doesn't exist
    await startAddBetDialog(chatId, state, env);
}

async function showCompetitionsLogic(chatId: number, messageId: number, state: UserState, env: Env) {
    const keyboard = {
        inline_keyboard: [
            [{ text: 'Неделя', callback_data: 'view_leaderboard:week' }, { text: 'Месяц', callback_data: 'view_leaderboard:month' }],
            [{ text: 'Год', callback_data: 'view_leaderboard:year' }, { text: 'Все время', callback_data: 'view_leaderboard:all_time' }],
            [{ text: '⬅️ В меню', callback_data: 'main_menu' }],
        ]
    };
    const text = "🏆 *Соревнования*\n\nВыберите период для просмотра таблицы лидеров:";
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showGoalsLogic(chatId: number, messageId: number, state: UserState, env: Env) {
    const text = "🚧 Раздел 'Мои цели' находится в разработке.";
    const keyboard = { inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]] };
    await editMessageText(chatId, messageId, text, env, keyboard);
}


// --- COMMAND & CALLBACK HANDLERS (WRAPPERS) ---

export async function handleShowStatsCommand(message: TelegramMessage, state: UserState, env: Env) {
    // For commands, we send a new message and then process it, rather than editing the command message itself
    const sentMessage = await sendMessage(message.chat.id, "Загрузка статистики...", env);
    await showStatsLogic(message.chat.id, sentMessage.result.message_id, state, env);
}
export async function handleShowStatsCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await showStatsLogic(callbackQuery.message.chat.id, callbackQuery.message.message_id, state, env);
}

export async function handleStartAddBetCommand(message: TelegramMessage, state: UserState, env: Env) {
    await startAddBetLogic(message.chat.id, message.message_id, state, env);
}
export async function handleStartAddBetCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await startAddBetLogic(callbackQuery.message.chat.id, callbackQuery.message.message_id, state, env);
}

export async function handleShowCompetitionsCommand(message: TelegramMessage, state: UserState, env: Env) {
    const sentMessage = await sendMessage(message.chat.id, "Загрузка соревнований...", env);
    await showCompetitionsLogic(message.chat.id, sentMessage.result.message_id, state, env);
}
export async function handleShowCompetitionsCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await showCompetitionsLogic(callbackQuery.message.chat.id, callbackQuery.message.message_id, state, env);
}

export async function handleShowGoalsCommand(message: TelegramMessage, state: UserState, env: Env) {
    const sentMessage = await sendMessage(message.chat.id, "Загрузка целей...", env);
    await showGoalsLogic(message.chat.id, sentMessage.result.message_id, state, env);
}
export async function handleShowGoalsCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await showGoalsLogic(callbackQuery.message.chat.id, callbackQuery.message.message_id, state, env);
}

export async function handleStartAiChatCommand(message: TelegramMessage, state: UserState, env: Env) {
    await startAiChatDialog(message.chat.id, state, env, message.message_id);
}
export async function handleStartAiChatCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await startAiChatDialog(callbackQuery.message.chat.id, state, env, callbackQuery.message.message_id);
}

export async function handleManage(message: TelegramMessage, state: UserState, env: Env) {
    const sentMessage = await sendMessage(message.chat.id, "Загрузка...", env);
    await editMessageText(message.chat.id, sentMessage.result.message_id, "🚧 Управление ставками доступно в веб-интерфейсе. Эта функция в боте находится в разработке.", env, {
        inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]]
    });
}

export async function handleGetCode(message: TelegramMessage, state: UserState, env: Env) {
    const sentMessage = await sendMessage(message.chat.id, "Загрузка...", env);
    await editMessageText(message.chat.id, sentMessage.result.message_id, "ℹ️ Код используется для привязки аккаунта к боту (генерируется на сайте). Для входа на сайт используйте ваш email и пароль.", env, {
        inline_keyboard: [[{ text: '⬅️ В меню', callback_data: 'main_menu' }]]
    });
}


// This doesn't need a command wrapper as it's only ever a callback
export async function handleViewLeaderboard(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const period = callbackQuery.data.split(':')[1] as 'week' | 'month' | 'year' | 'all_time';
    const text = `🏆 Таблица лидеров за период "${period}" находится в разработке.`;
    const keyboard = { inline_keyboard: [[{ text: '⬅️ Назад к соревнованиям', callback_data: 'show_competitions' }]] };
    await editMessageText(callbackQuery.message.chat.id, callbackQuery.message.message_id, text, env, keyboard);
}


// --- COMMON COMMANDS ---

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

export async function handleReset(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено. Отправьте /start, чтобы начать заново.", env);
}
