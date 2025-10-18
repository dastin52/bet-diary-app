// functions/telegram/commands.ts
import { BetStatus, Env, TelegramMessage, TelegramUpdate, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { reportError, sendMessage, sendDocument } from './telegramApi';
// FIX: Import startAiChatDialog to be used in handleAiChat.
import { startAddBetDialog, startAiChatDialog } from './dialogs';
import { showMainMenu, showStatsMenu } from './ui';
import { calculateAnalytics, formatDetailedReportText, formatShortReportText, generateAnalyticsHtml } from './analytics';
import { startManageBets } from './manageBets';
import { showCompetitionsMenu } from './competition';
import { startManageGoals } from './goals';


export async function handleStart(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    if (state.user) {
        await showMainMenu(chatId, null, env, `👋 Привет, ${state.user.nickname}! Чем могу помочь?`);
    } else {
        await sendMessage(chatId, `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, вам нужно привязать свой аккаунт из веб-приложения.

1.  Откройте веб-приложение BetDiary.
2.  Перейдите в "Настройки".
3.  Нажмите "Сгенерировать код" в разделе интеграции с Telegram.
4.  Отправьте полученный 6-значный код мне в этот чат.`, env);
    }
}

export async function handleHelp(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const helpText = `*Список доступных команд:*

/start - Начало работы или главное меню
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/manage - 📈 Управление ставками
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

export async function handleAddBet(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    if (!state.user) {
        await sendMessage(chatId, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    
    await startAddBetDialog(chatId, state, env);
}

export async function handleStats(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    if (!state.user) {
        await sendMessage(chatId, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    
    if (state.bets.filter(b => b.status !== BetStatus.Pending).length === 0) {
        await sendMessage(chatId, "У вас пока нет рассчитанных ставок для отображения статистики.", env);
        return;
    }

    const analytics = calculateAnalytics(state);
    if (!analytics) {
        throw new Error("Не удалось рассчитать аналитику. Данные могут быть повреждены.");
    }
    const shortReport = formatShortReportText(analytics);
    
    const messageId = update.callback_query ? message.message_id : null;
    await showStatsMenu(chatId, messageId, shortReport, env);
}

export async function handleShowDetailedReport(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.callback_query?.message;
    if (!message) return;

    const analytics = calculateAnalytics(state);
    const detailedReport = formatDetailedReportText(analytics);
    
    await sendMessage(message.chat.id, detailedReport, env);
}

export async function handleDownloadReport(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    await sendMessage(chatId, "⏳ Готовлю ваш отчет...", env);

    const analytics = calculateAnalytics(state);
    const htmlReport = generateAnalyticsHtml(analytics);
    
    const blob = new Blob([htmlReport], { type: 'text/html' });
    const fileName = `BetDiary_Отчет_${new Date().toISOString().split('T')[0]}.html`;

    await sendDocument(chatId, blob, fileName, env);
}

export async function handleManageBets(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
     if (!state.user) {
        await sendMessage(message.chat.id, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    await startManageBets(update, state, env);
}

export async function handleCompetitions(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
     if (!state.user) {
        await sendMessage(message.chat.id, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    await showCompetitionsMenu(update, state, env);
}

export async function handleGoals(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
     if (!state.user) {
        await sendMessage(message.chat.id, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    await startManageGoals(update, state, env);
}

// FIX: Add handler for AI chat command.
export async function handleAiChat(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;

    if (!state.user) {
        await sendMessage(chatId, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }
    
    await startAiChatDialog(chatId, state, env);
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

        if (!newState.user) {
            throw new Error("User data retrieved from KV is invalid.");
        }
        
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key);

        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);
        await showMainMenu(chatId, null, env);

    } catch (error) {
        await reportError(chatId, env, 'Auth Handler', error);
    }
}
