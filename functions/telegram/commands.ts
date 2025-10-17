// functions/telegram/commands.ts
import { Env, TelegramMessage, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage } from './telegramApi';
import { startAddBetDialog } from './dialogs';
import { generateStatsReport } from './analytics';
import { showMainMenu, showLoginOptions } from './ui';
import { CB } from './router';

export async function handleStart(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
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

export async function handleStats(chatId: number, state: UserState, env: Env) {
    const statsText = generateStatsReport(state);
    await sendMessage(chatId, statsText, env, {
        inline_keyboard: [[{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]]
    });
}
