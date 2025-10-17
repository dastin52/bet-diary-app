
// functions/telegram/commands.ts
import { BetStatus, Env, TelegramMessage, UserState, TelegramCallbackQuery } from './types';
import { setUserState, normalizeState } from './state';
import { sendMessage } from './telegramApi';
import { showMainMenu, showLoginOptions } from './ui';

export async function handleStart(message: TelegramMessage, state: UserState, env: Env) {
    if (state.user) {
        await showMainMenu(message, env);
    } else {
        await showLoginOptions(message, env, `👋 *Добро пожаловать в BetDiary Бот!*

Для начала работы, пожалуйста, войдите или зарегистрируйтесь.`);
    }
}

export async function handleHelp(chatId: number, env: Env) {
    const helpText = `*Список доступных команд:*

/start - Показать главное меню
/reset - ⚠️ Сбросить состояние бота (если что-то пошло не так)
/help - ℹ️ Показать это сообщение`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(chatId: number, env: Env) {
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено. Отправьте /start, чтобы начать заново.", env);
}

export async function showStats(update: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = update.message.chat.id;

    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    if (settledBets.length === 0) {
        await sendMessage(chatId, "У вас пока нет рассчитанных ставок для отображения статистики.", env);
        return;
    }
    
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    const statsText = `*📊 Ваша статистика*

- *Текущий банк:* ${state.bankroll.toFixed(2)} ₽
- *Общая прибыль:* ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽
- *ROI:* ${roi.toFixed(2)}%
- *Процент выигрышей:* ${winRate.toFixed(2)}%
- *Всего рассчитанных ставок:* ${settledBets.length}`;

    await sendMessage(chatId, statsText, env);
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

        if (!newState.user) throw new Error("User data retrieved from storage is invalid.");
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
        await env.BOT_STATE.delete(key);

        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);
        await showMainMenu(message, env);
    } catch (error) {
        await sendMessage(chatId, "Произошла ошибка при проверке кода. Убедитесь, что вы скопировали его правильно.", env);
    }
}

// Placeholder functions for features not yet implemented
export async function showCompetitions(update: TelegramCallbackQuery, env: Env) {
    await sendMessage(update.message.chat.id, "🏆 Раздел соревнований в разработке.", env);
}

export async function showGoals(update: TelegramCallbackQuery, state: UserState, env: Env) {
     await sendMessage(update.message.chat.id, "🎯 Раздел целей в разработке.", env);
}
