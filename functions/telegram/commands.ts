// functions/telegram/commands.ts
import { Env, TelegramCallbackQuery, TelegramMessage, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage, editMessageText, sendDocument } from './telegramApi';
import { startAddBetDialog, startLoginDialog, startRegisterDialog, startAiChatDialog } from './dialogs';
import { generateShortStatsReport, generateDetailedReport, generateHtmlReport } from './analytics';
import { showMainMenu, showLoginOptions } from './ui';
import { CB } from './router';

export async function handleStart(message: TelegramMessage | TelegramCallbackQuery, env: Env) {
    const chatId = 'chat' in message ? message.chat.id : message.message.chat.id;
    const state = await getUserState(chatId, env);

    if (state.user) {
        await showMainMenu(message, env);
    } else {
        await showLoginOptions(message, env, `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, войдите или зарегистрируйтесь.`);
    }
}

export async function handleHelp(chatId: number, env: Env) {
    const helpText = `*Список доступных команд:*

/start - Главное меню
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/manage - 📈 Управление ставками
/ai - 🤖 Чат с AI-Аналитиком
/reset - ⚠️ Сбросить сессию
/help - ℹ️ Показать это сообщение`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(chatId: number, env: Env) {
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваша сессия была сброшена. Отправьте /start, чтобы начать заново.", env);
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
        
        await env.BOT_STATE.delete(key);
        const userData = JSON.parse(dataString);
        const newState = normalizeState(userData);

        if (!newState.user) throw new Error("User data from auth code is invalid.");
        
        await setUserState(chatId, newState, env);
        
        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);
        await showMainMenu(message, env);
    } catch (error) {
        console.error("Auth error:", error);
        await sendMessage(chatId, "Произошла ошибка при проверке кода. Убедитесь, что вы скопировали его правильно.", env);
    }
}

export async function handleAddBet(chatId: number, state: UserState, env: Env) {
    if (state.dialog) {
        await sendMessage(chatId, "Вы уже находитесь в процессе диалога. Завершите его или используйте /reset для отмены.", env);
        return;
    }
    await startAddBetDialog(chatId, state, env);
}

export async function handleStats(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'chat' in update ? update.chat.id : update.message.chat.id;
    const statsText = generateShortStatsReport(state);
    
    const keyboard = {
        inline_keyboard: [
            [{ text: '📝 Подробный отчет', callback_data: CB.SHOW_DETAILED_ANALYTICS }],
            [{ text: '📥 Скачать отчет', callback_data: CB.DOWNLOAD_ANALYTICS_REPORT }],
            [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
        ]
    };
    
    if ('data' in update) { // Came from button press
        await editMessageText(chatId, update.message.message_id, statsText, env, keyboard);
    } else { // Came from /stats command
        await sendMessage(chatId, statsText, env, keyboard);
    }
}

export async function handleShowDetailedReport(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const reportText = generateDetailedReport(state);
    
    const keyboard = {
        inline_keyboard: [
             [{ text: '📥 Скачать отчет', callback_data: CB.DOWNLOAD_ANALYTICS_REPORT }],
             [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
        ]
    };

    await editMessageText(chatId, messageId, reportText, env, keyboard);
}

export async function handleDownloadReport(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    await sendMessage(chatId, "⏳ Готовлю ваш отчет...", env);
    const htmlContent = generateHtmlReport(state);

    // Telegram API expects a file-like object for documents.
    // We create a Blob from the HTML string.
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const fileName = `BetDiary_Отчет_${new Date().toLocaleDateString('ru-RU')}.html`;

    await sendDocument(chatId, blob, fileName, env);
}


// --- Placeholder command handlers ---
export async function handleLogin(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await startLoginDialog(callbackQuery.message.chat.id, state, env, callbackQuery.message.message_id);
}

export async function handleRegister(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    await startRegisterDialog(callbackQuery.message.chat.id, state, env, callbackQuery.message.message_id);
}

export async function handleAiAnalyst(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
     await startAiChatDialog(callbackQuery.message.chat.id, state, env);
}
