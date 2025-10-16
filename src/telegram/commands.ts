// src/telegram/commands.ts
import { Env, UserState, BetStatus } from './types';
import { showMainMenu, showStartMenu } from './telegramApi';
import { setUserState } from './state';
import { GoogleGenAI } from "@google/genai";

// --- Unauthenticated Commands ---

export async function handleStart(chatId: number, state: UserState, env: Env): Promise<void> {
    if (state.user) {
        await handleMenu(chatId, state, env, `Вы уже вошли как *${state.user.nickname}*.`);
    } else {
        await showStartMenu(chatId, env);
    }
}

export async function handleStartRegister(chatId: number, state: UserState, env: Env, messageId: number): Promise<void> {
    state.dialog = { step: 'register_email', messageId, data: {} };
    await setUserState(chatId, state, env);
    await env.TELEGRAM.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Давайте начнем! Введите ваш *email*:",
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
    });
}

export async function handleStartLogin(chatId: number, state: UserState, env: Env, messageId: number): Promise<void> {
     await env.TELEGRAM.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Как вы хотите войти?",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔑 Через Логин/Пароль", callback_data: "login_password" }],
                [{ text: "🔗 Привязать аккаунт (код с сайта)", callback_data: "login_code" }],
                [{ text: "⬅️ Назад", callback_data: "cancel_dialog:start" }]
            ]
        }
    });
}

export async function handleAuthCode(chatId: number, code: string, state: UserState, env: Env): Promise<void> {
    const key = `tgauth:${code}`;
    const userDataString = await env.BOT_STATE.get(key);

    if (userDataString) {
        const userData = JSON.parse(userDataString);
        const newState = { ...userData, dialog: null }; // Ensure dialog is cleared
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key); 

        const nickname = newState.user?.nickname || 'пользователь';
        await env.TELEGRAM.sendMessage({
            chat_id: chatId,
            text: `✅ *Аутентификация пройдена!*\n\nПривет, ${nickname}! Ваш аккаунт успешно привязан.`,
            parse_mode: 'Markdown',
        });
        await showMainMenu(chatId, newState, env);
    } else {
        await env.TELEGRAM.sendMessage({
            chat_id: chatId,
            text: "❌ *Неверный или истекший код.* Пожалуйста, сгенерируйте новый код в веб-приложении и попробуйте снова.",
            parse_mode: 'Markdown',
        });
    }
}


// --- Authenticated Commands ---

export async function handleMenu(chatId: number, state: UserState, env: Env, text?: string): Promise<void> {
    if (state.user) {
        await showMainMenu(chatId, state, env, text);
    } else {
        await showStartMenu(chatId, env, "Сначала необходимо войти в систему.");
    }
}

export async function handleShowStats(chatId: number, state: UserState, env: Env): Promise<void> {
    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void).length;
    const winRate = nonVoidBets > 0 ? (wonBets / nonVoidBets) * 100 : 0;

    const statsText = `
*📊 Ваша статистика*

*Банк:* ${state.bankroll.toFixed(2)} ₽
*Прибыль:* ${totalProfit.toFixed(2)} ₽
*ROI:* ${roi.toFixed(2)}%
*Проходимость:* ${winRate.toFixed(2)}%
*Всего ставок:* ${betCount}
    `;
    await env.TELEGRAM.sendMessage({
        chat_id: chatId,
        text: statsText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog" }]] }
    });
}

export async function handleStartAddBet(chatId: number, state: UserState, env: Env): Promise<void> {
    // This will be expanded into a dialog later
    await env.TELEGRAM.sendMessage({
        chat_id: chatId,
        text: '➕ Раздел добавления ставок находится в разработке.',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog" }]] }
    });
}

export async function handleShowCompetitions(chatId: number, state: UserState, env: Env): Promise<void> {
    await env.TELEGRAM.sendMessage({
        chat_id: chatId,
        text: '🏆 Раздел соревнований находится в разработке.',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog" }]] }
    });
}

export async function handleShowGoals(chatId: number, state: UserState, env: Env): Promise<void> {
    await env.TELEGRAM.sendMessage({
        chat_id: chatId,
        text: '🎯 Раздел "Мои цели" находится в разработке.',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog" }]] }
    });
}

export async function handleStartAiChat(chatId: number, state: UserState, env: Env, messageId: number): Promise<void> {
    state.dialog = { step: 'ai_chat_active', messageId, data: { history: [] } };
    await setUserState(chatId, state, env);
    await env.TELEGRAM.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: '🤖 Вы вошли в чат с AI-Аналитиком. Задайте вопрос.',
        reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'cancel_dialog' }]]
        }
    });
}


// --- General Commands ---

export async function handleCancelDialog(chatId: number, state: UserState, env: Env, messageId: number, data: string): Promise<void> {
    state.dialog = null;
    await setUserState(chatId, state, env);
    const target = data.split(':')[1];
    
    if (state.user) {
        await showMainMenu(chatId, state, env, "Действие отменено.", messageId);
    } else {
        await showStartMenu(chatId, env, "Действие отменено.", messageId);
    }
}

export async function handleUnknownCommand(chatId: number, state: UserState, env: Env): Promise<void> {
    if (state.user) {
        await showMainMenu(chatId, state, env, "Неизвестная команда. Вот ваше главное меню:");
    } else {
        await showStartMenu(chatId, env, "Пожалуйста, войдите или зарегистрируйтесь.");
    }
}
