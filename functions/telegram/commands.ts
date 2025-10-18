// functions/telegram/commands.ts
import { TelegramUpdate, UserState, Env, TelegramMessage } from './types';
import { sendMessage, sendDocument } from './telegramApi';
import { showMainMenu, showStatsMenu } from './ui';
import { setUserState, updateAndSyncState } from './state';
import { startManageBets } from './manageBets';
import { showCompetitionsMenu } from './competition';
import { startManageGoals } from './goals';
import { calculateAnalytics, formatShortReportText, formatDetailedReportText, generateAnalyticsHtml } from './analytics';
import { startAddBetDialog, startAiChatDialog } from './dialogs';
import { CB } from './router';

export async function handleStart(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message!.chat.id;
    if (state.user) {
        await showMainMenu(chatId, null, env, `С возвращением, ${state.user.nickname}!`);
    } else {
        await sendMessage(chatId, "👋 Добро пожаловать в BetDiary Bot! Для начала работы, пожалуйста, пройдите аутентификацию.\n\n1. Откройте веб-приложение.\n2. Перейдите в 'Настройки' -> 'Интеграция с Telegram'.\n3. Нажмите 'Сгенерировать код'.\n4. Отправьте полученный 6-значный код мне в чат.", env);
    }
}

export async function handleHelp(message: TelegramMessage, env: Env) {
    const text = `*Доступные команды:*
/start - Начало работы и главное меню
/addbet - Добавить новую ставку
/stats - Посмотреть статистику
/manage - Управление ставками
/competitions - Таблицы лидеров
/goals - Управление целями
/ai - Чат с AI-аналитиком
/reset - Сброс вашего состояния (если что-то пошло не так)
/help - Показать это сообщение`;
    await sendMessage(message.chat.id, text, env);
}

export async function handleReset(message: TelegramMessage, env: Env) {
    await setUserState(message.chat.id, { user: null, bets: [], bankroll: 10000, goals: [], bankHistory: [], dialog: null }, env);
    await sendMessage(message.chat.id, "Ваше состояние сброшено. Отправьте /start для начала.", env);
}

export async function handleAuth(message: TelegramMessage, code: string, env: Env) {
    const chatId = message.chat.id;
    const key = `tgauth:${code}`;
    const userDataStr = await env.BOT_STATE.get(key);

    if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        const state: UserState = { ...userData, dialog: null };
        // Sync with the master record for this user's email
        await updateAndSyncState(chatId, state, env);
        await env.BOT_STATE.delete(key);
        await showMainMenu(chatId, null, env, `✅ Успешная аутентификация! Добро пожаловать, ${state.user.nickname}.`);
    } else {
        await sendMessage(chatId, "❌ Неверный или истекший код аутентификации. Пожалуйста, сгенерируйте новый код в веб-приложении.", env);
    }
}

export async function handleAddBet(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    
    // In a real implementation, this would trigger a multi-step dialog.
    // await startAddBetDialog(message.chat.id, state, env, message.message_id);
    await sendMessage(message.chat.id, "Добавление ставок через бота находится в разработке. Пожалуйста, используйте веб-интерфейс.", env);
}

export async function handleStats(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;

    const analytics = calculateAnalytics(state);
    const messageId = update.callback_query ? message.message_id : null;

    // Check if it's a callback for a specific report type
    if (update.callback_query?.data === CB.SHOW_DETAILED_ANALYTICS) {
         await sendMessage(message.chat.id, formatDetailedReportText(analytics), env);
         return;
    }
    if (update.callback_query?.data === CB.DOWNLOAD_ANALYTICS_REPORT) {
        const html = generateAnalyticsHtml(analytics);
        const file = new Blob([html], { type: 'text/html' });
        await sendDocument(message.chat.id, file, 'BetDiary_Report.html', env);
        return;
    }

    // Default action: show stats menu
    const text = formatShortReportText(analytics);
    await showStatsMenu(message.chat.id, messageId, text, env);
}

export async function handleManageBets(update: TelegramUpdate, state: UserState, env: Env) {
    await startManageBets(update, state, env);
}

export async function handleCompetitions(update: TelegramUpdate, state: UserState, env: Env) {
    await showCompetitionsMenu(update, state, env);
}

export async function handleGoals(update: TelegramUpdate, state: UserState, env: Env) {
    await startManageGoals(update, state, env);
}

export async function handleAiChat(update: TelegramUpdate, state: UserState, env: Env) {
    const messageId = update.callback_query ? update.callback_query.message.message_id : null;
    const chatId = messageId ? update.callback_query!.message.chat.id : update.message!.chat.id;
    await startAiChatDialog(chatId, state, env, messageId);
}
