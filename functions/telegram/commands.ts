// functions/telegram/commands.ts
import { TelegramUpdate, UserState, Env, TelegramMessage } from './types';
import { sendMessage, sendDocument, editMessageText } from './telegramApi';
import { showMainMenu, showStatsMenu, makeKeyboard } from './ui';
import { setUserState, updateAndSyncState } from './state';
import { startManageBets } from './manageBets';
import { showCompetitionsMenu } from './competition';
import { startManageGoals } from './goals';
import { calculateAnalytics, formatShortReportText, formatDetailedReportText, generateAnalyticsHtml, AnalyticsPeriod } from './analytics';
import { startAddBetDialog, startAiChatDialog } from './dialogs';
import { CB, STATS_PREFIX } from './router';


export async function showLinkAccountInfo(chatId: number, messageId: number, env: Env) {
    const text = `*🔗 Привязка веб-аккаунта*

Эта опция для тех, у кого *уже есть* аккаунт в веб-приложении, и они хотят подключить его к боту.

*Шаги:*
1. Откройте веб-приложение BetDiary.
2. Войдите в свой аккаунт.
3. Перейдите в *'Настройки'*.
4. Нажмите *'Интеграция с Telegram'* -> *'Сгенерировать код'*.
5. Отправьте полученный 6-значный код мне в этот чат.

Код действителен 5 минут. Это синхронизирует все ваши данные с ботом.`;
    const keyboard = makeKeyboard([
        [{ text: '◀️ Назад', callback_data: CB.START_MENU_BACK }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

export async function showStartMenu(chatId: number, env: Env, messageIdToEdit?: number) {
    const text = "👋 Добро пожаловать в BetDiary Bot! \n\nВыберите, с чего хотите начать.";
    const keyboard = makeKeyboard([
        [ { text: '🚀 Регистрация в боте', callback_data: CB.BOT_REGISTER } ],
        [ { text: '🔑 Вход по Email/Паролю', callback_data: CB.BOT_LOGIN } ],
        [ { text: '🔗 Привязать веб-аккаунт', callback_data: CB.SHOW_LINK_INFO } ],
    ]);
    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}


export async function handleStart(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message!.chat.id;
    if (state.user) {
        await showMainMenu(chatId, null, env, `С возвращением, ${state.user.nickname}!`);
    } else {
        await showStartMenu(chatId, env);
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
    await startAddBetDialog(message.chat.id, state, env, message.message_id);
    // await sendMessage(message.chat.id, "Добавление ставок через бота находится в разработке. Пожалуйста, используйте веб-интерфейс.", env);
}

export async function handleStats(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;

    if (!state.user) {
        await sendMessage(message.chat.id, "Пожалуйста, войдите или зарегистрируйтесь для доступа к статистике.", env);
        return;
    }

    const cb_data = update.callback_query?.data;
    let action = 'show';
    let period: AnalyticsPeriod = 'week';

    if (cb_data && cb_data.startsWith(STATS_PREFIX)) {
        const parts = cb_data.split('|');
        action = parts[1] || 'show';
        period = (parts[2] as AnalyticsPeriod) || 'week';
    } else if (update.message) { // coming from /stats command
        period = 'week'; // Default for command
        action = 'show';
    }

    const analytics = calculateAnalytics(state, period);
    const messageId = update.callback_query ? message.message_id : null;

    switch (action) {
        case 'detailed':
            await sendMessage(message.chat.id, formatDetailedReportText(analytics), env);
            // After sending detailed, we don't want to edit the main menu away.
            return;
        case 'download':
            const html = generateAnalyticsHtml(analytics);
            const file = new Blob([html], { type: 'text/html' });
            await sendDocument(message.chat.id, file, 'BetDiary_Report.html', env);
            return;
        case 'show':
        default:
            const text = formatShortReportText(analytics);
            await showStatsMenu(message.chat.id, messageId, text, analytics.period, env);
            break;
    }
}

export async function handleManageBets(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) {
        await sendMessage(update.message!.chat.id, "Пожалуйста, войдите или зарегистрируйтесь.", env);
        return;
    }
    await startManageBets(update, state, env);
}

export async function handleCompetitions(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) {
        await sendMessage(update.message!.chat.id, "Пожалуйста, войдите или зарегистрируйтесь.", env);
        return;
    }
    await showCompetitionsMenu(update, state, env);
}

export async function handleGoals(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) {
        await sendMessage(update.message!.chat.id, "Пожалуйста, войдите или зарегистрируйтесь.", env);
        return;
    }
    await startManageGoals(update, state, env);
}

export async function handleAiChat(update: TelegramUpdate, state: UserState, env: Env) {
    if (!state.user) {
        const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
        if (chatId) await sendMessage(chatId, "Пожалуйста, войдите или зарегистрируйтесь.", env);
        return;
    }
    const messageId = update.callback_query ? update.callback_query.message.message_id : null;
    const chatId = messageId ? update.callback_query!.message.chat.id : update.message!.chat.id;
    await startAiChatDialog(chatId, state, env, messageId);
}