// functions/telegram/commands.ts
// This file contains the logic for individual bot commands.

import { BetStatus, BetType, Env, TelegramMessage, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage } from './telegramApi';
import { startAddBetDialog } from './dialogs';

export async function handleStart(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (state.user) {
        await sendMessage(chatId, `👋 Привет, ${state.user.nickname}! Рад снова вас видеть. Используйте /help, чтобы увидеть список команд.`, env);
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

/start - Начало работы
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/reset - ⚠️ Сбросить состояние (если что-то пошло не так)
/help - ℹ️ Показать это сообщение

Вы также можете просто отправить 6-значный код для привязки аккаунта.`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    // Reset state by saving a normalized null, which provides a clean default state.
    await setUserState(chatId, normalizeState(null), env);
    await sendMessage(chatId, "Ваше состояние было сброшено. Отправьте /start, чтобы начать заново.", env);
}

export async function handleAddBet(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (!state.user) {
        await sendMessage(chatId, "Пожалуйста, сначала привяжите свой аккаунт, отправив 6-значный код из веб-приложения.", env);
        return;
    }

    if (state.dialog) {
        await sendMessage(chatId, "Вы уже находитесь в процессе добавления ставки. Завершите его или используйте /reset для отмены.", env);
        return;
    }
    
    await startAddBetDialog(chatId, state, env);
}

export async function handleStats(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (!state.user) {
        await sendMessage(chatId, "Пожалуйста, сначала привяжите свой аккаунт.", env);
        return;
    }

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

        if (!newState.user) {
            throw new Error("User data retrieved from KV is invalid.");
        }
        
        await setUserState(chatId, newState, env);
        
        // Clean up the used auth code
        await env.BOT_STATE.delete(key);

        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан. Теперь вы можете использовать все функции бота.`, env);

    } catch (error) {
        console.error("Auth error:", error);
        await sendMessage(chatId, "Произошла ошибка при проверке кода. Убедитесь, что вы скопировали его правильно.", env);
    }
}
