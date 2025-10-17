// functions/telegram/commands.ts
import { BetStatus, Env, TelegramMessage, UserState } from './types';
import { getUserState, setUserState, normalizeState } from './state';
import { sendMessage } from './telegramApi';
import { startAddBetDialog } from './dialogs';
import { showLoginOptions, showMainMenu } from './ui';

export async function handleStart(message: TelegramMessage, state: UserState, env: Env) {
    if (state.user) {
        await showMainMenu(message, env);
    } else {
        await sendMessage(message.chat.id, `👋 *Добро пожаловать в BetDiary Бот!*

Чтобы начать, вам нужно привязать свой аккаунт из веб-приложения.

1.  Откройте веб-приложение BetDiary.
2.  Перейдите в "Настройки".
3.  Нажмите "Сгенерировать код" в разделе интеграции с Telegram.
4.  Отправьте полученный 6-значный код мне в этот чат.

Или войдите/зарегистрируйтесь прямо здесь.`, env);
        await showLoginOptions(message, env);
    }
}

export async function handleHelp(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const helpText = `*Список доступных команд:*

/start - Начало работы / Главное меню
/addbet - 📝 Добавить новую ставку
/stats - 📊 Показать мою статистику
/reset - ⚠️ Сбросить диалог (если что-то пошло не так)

Вы также можете просто отправить 6-значный код для привязки аккаунта из веб-приложения.`;
    await sendMessage(chatId, helpText, env);
}

export async function handleReset(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);
    state.dialog = null; // Only reset the dialog, not the full user state
    await setUserState(chatId, state, env);
    await sendMessage(chatId, "Ваш текущий диалог был сброшен.", env);
    await showMainMenu(message, env);
}

export async function handleAddBet(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (!state.user) {
        await showLoginOptions(message, env, "Пожалуйста, сначала войдите или зарегистрируйтесь.");
        return;
    }

    if (state.dialog) {
        await sendMessage(chatId, "Вы уже находитесь в процессе другого действия. Завершите его или используйте /reset для отмены.", env);
        return;
    }
    
    await startAddBetDialog(chatId, state, env);
}

export async function handleStats(message: TelegramMessage, env: Env) {
    const chatId = message.chat.id;
    const state = await getUserState(chatId, env);

    if (!state.user) {
        await showLoginOptions(message, env, "Пожалуйста, сначала войдите или зарегистрируйтесь.");
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
            throw new Error("User data retrieved from storage is invalid.");
        }
        
        await setUserState(chatId, newState, env);
        
        // Clean up the used auth code
        await env.BOT_STATE.delete(key);

        await sendMessage(chatId, `✅ *Успешно!* Ваш аккаунт "${newState.user.nickname}" привязан.`, env);
        await showMainMenu(message, env);

    } catch (error) {
        console.error("Auth error:", error);
        await sendMessage(chatId, "Произошла ошибка при проверке кода. Убедитесь, что вы скопировали его правильно.", env);
    }
}
