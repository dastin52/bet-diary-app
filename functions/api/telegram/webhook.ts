// functions/api/telegram/webhook.ts

import { GoogleGenAI } from "@google/genai";
import { User, Bet, Goal, BankTransaction, BetStatus, BetType, GoalMetric, GoalStatus as GoalStatusEnum } from '../../../src/types';
import { UserBetData } from "../../../src/data/betStore";
import { SPORTS, MARKETS_BY_SPORT } from '../../../src/constants';


// --- TYPE DEFINITIONS ---

interface Env {
    TELEGRAM_BOT_TOKEN: string;
    GEMINI_API_KEY: string;
    BOT_STATE: KVNamespace;
}

interface KVNamespace {
    get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" | "stream" }): Promise<string | any | null>;
    put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[], list_complete: boolean, cursor?: string }>;
}


interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
    message_id: number;
    from: TelegramUser;
    chat: { id: number; };
    date: number;
    text?: string;
}

interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message: TelegramMessage;
    data: string;
}

interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
}

interface DialogState {
    step: string;
    messageId?: number;
    data: { [key: string]: any };
}

interface UserState extends UserBetData {
    user: User | null;
    dialog: DialogState | null;
}

// --- UTILITY & API FUNCTIONS ---

async function apiRequest(token: string, method: string, payload: object): Promise<any> {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorBody = await response.json();
            console.error(`Telegram API Error: ${method} failed with status ${response.status}`, errorBody);
            throw new Error(`Telegram API Error: ${method} failed with status ${response.status}. Response: ${JSON.stringify(errorBody)}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Failed to call Telegram API method ${method}`, error);
        throw error;
    }
}

async function reportError(chatId: number, env: Env, context: string, error: any) {
    console.error(`Error in ${context}:`, error);
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    try {
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `Произошла ошибка.\nКонтекст: ${context}\nСообщение: ${errorMessage.substring(0, 500)}`,
        });
    } catch (reportErr) {
        console.error("Failed to report error to user:", reportErr);
    }
}

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;


// --- STATE MANAGEMENT ---

function normalizeState(data: any): UserState {
    const defaultUser: User | null = null;
    const defaultBets: Bet[] = [];
    const defaultGoals: Goal[] = [];
    const defaultHistory: BankTransaction[] = [];

    if (!data || typeof data !== 'object') {
        return { user: defaultUser, bets: defaultBets, bankroll: 10000, goals: defaultGoals, bankHistory: defaultHistory, dialog: null };
    }

    return {
        user: data.user && typeof data.user === 'object' ? data.user as User : defaultUser,
        bets: Array.isArray(data.bets) ? data.bets : defaultBets,
        bankroll: typeof data.bankroll === 'number' ? data.bankroll : 10000,
        goals: Array.isArray(data.goals) ? data.goals : defaultGoals,
        bankHistory: Array.isArray(data.bankHistory) ? data.bankHistory : defaultHistory,
        dialog: data.dialog && typeof data.dialog === 'object' ? data.dialog : null,
    };
}


async function getUserState(chatId: number, env: Env): Promise<UserState> {
    const key = `tgchat:${chatId}`;
    try {
        const data = await env.BOT_STATE.get(key, { type: 'json' });
        return normalizeState(data);
    } catch (e) {
        console.error(`Failed to parse state for chat ${chatId}, returning default. Error:`, e);
        return normalizeState(null);
    }
}


async function setUserState(chatId: number, state: UserState, env: Env): Promise<void> {
    const key = `tgchat:${chatId}`;
    await env.BOT_STATE.put(key, JSON.stringify(state));
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


// --- MAIN HANDLER ---

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    let chatId: number | undefined;
    try {
        if (!env.TELEGRAM_BOT_TOKEN || !env.GEMINI_API_KEY || !env.BOT_STATE) {
            console.error("FATAL: Missing environment variables.");
            return new Response('Server configuration error', { status: 500 });
        }

        const update: TelegramUpdate = await request.json();

        if (update.callback_query) {
            chatId = update.callback_query.message.chat.id;
            await handleCallbackQuery(update.callback_query, env);
        } else if (update.message) {
            chatId = update.message.chat.id;
            await handleMessage(update.message, env);
        }

        return new Response('OK', { status: 200 });
    } catch (error) {
        if (chatId) {
            await reportError(chatId, env, 'Global onRequestPost', error);
        } else {
            console.error("Global error with no chatId:", error);
        }
        return new Response('Error', { status: 200 });
    }
};

// --- MESSAGE & CALLBACK ROUTERS ---

async function handleMessage(message: TelegramMessage, env: Env): Promise<void> {
    const chatId = message.chat.id;
    const text = message.text?.trim() ?? '';
    const state = await getUserState(chatId, env);

    if (state.dialog?.step) {
        await handleDialog(chatId, text, state, env, message);
        return;
    }
    
    if (text.startsWith('/start') || text.toLowerCase() === 'меню') {
        if (state.user) {
            await showMainMenu(chatId, state, env, `Вы вошли как *${state.user.nickname}*.`);
        } else {
            await showStartMenu(chatId, env);
        }
    } else if (/^\d{6}$/.test(text)) {
        await handleAuthCode(chatId, text, state, env);
    } else if (state.user) {
        await showMainMenu(chatId, state, env, "Неизвестная команда. Вот ваше главное меню:");
    } else {
        await showStartMenu(chatId, env, "Пожалуйста, войдите или зарегистрируйтесь.");
    }
}

async function handleCallbackQuery(callbackQuery: TelegramCallbackQuery, env: Env): Promise<void> {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const state = await getUserState(chatId, env);
    
    // Always answer callback query to remove loading state
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', { callback_query_id: callbackQuery.id });

    if (data === 'start_register') {
        await startRegistration(chatId, state, env, callbackQuery.message.message_id);
    } else if (data === 'start_login') {
        await showLoginOptions(chatId, env, callbackQuery.message.message_id);
    } else if (data === 'login_code') {
        await startCodeLogin(chatId, state, env, callbackQuery.message.message_id);
    } else if (data === 'login_password') {
        await startPasswordLogin(chatId, state, env, callbackQuery.message.message_id);
    } else if (data.startsWith('cancel_dialog')) {
        state.dialog = null;
        await setUserState(chatId, state, env);
        if (state.user) {
             await showMainMenu(chatId, state, env, "Действие отменено.");
        } else {
            await showStartMenu(chatId, env, "Действие отменено.", callbackQuery.message.message_id);
        }
    } else if (state.user) {
         // --- Authenticated User Actions ---
        if (data === 'show_stats') {
            await handleStats(chatId, state, env);
        } else if (data === 'add_bet') {
            await startAddBetDialog(chatId, state, env);
        } else if (data === 'show_competitions') {
            await handleCompetitions(chatId, state, env);
        } else if (data === 'show_goals') {
            await handleGoals(chatId, state, env);
        } else if (data === 'ai_chat') {
            await startAiChat(chatId, state, env);
        } else if (data.startsWith('dialog_')) {
            // Handle dialog-specific button presses
            await handleDialog(chatId, data, state, env);
        }
        else {
             await showMainMenu(chatId, state, env, "Неизвестное действие.");
        }
    } else {
        await showStartMenu(chatId, env, "Пожалуйста, сначала войдите.", callbackQuery.message.message_id);
    }
}


// --- AUTHENTICATION & REGISTRATION FLOWS ---

async function showStartMenu(chatId: number, env: Env, text?: string, messageId?: number) {
    const payload = {
        chat_id: chatId,
        text: text || "👋 *Добро пожаловать!*\n\nПожалуйста, войдите или зарегистрируйтесь, чтобы начать.",
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "➡️ Войти", callback_data: "start_login" }],
                [{ text: "📝 Регистрация", callback_data: "start_register" }]
            ]
        }
    };
    if (messageId) {
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', { ...payload, message_id: messageId });
    } else {
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', payload);
    }
}

async function showLoginOptions(chatId: number, env: Env, messageId: number) {
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: "Как вы хотите войти?",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔑 Через Логин/Пароль", callback_data: "login_password" }],
                [{ text: "🔗 Привязать аккаунт (через код с сайта)", callback_data: "login_code" }],
                 [{ text: "⬅️ Назад", callback_data: "cancel_dialog:start" }]
            ]
        }
    });
}

async function startRegistration(chatId: number, state: UserState, env: Env, messageId: number) {
    state.dialog = { step: 'register_email', messageId, data: {} };
    await setUserState(chatId, state, env);
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: "Давайте начнем! Введите ваш *email*:",
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
    });
}

async function startPasswordLogin(chatId: number, state: UserState, env: Env, messageId: number) {
    state.dialog = { step: 'login_email', messageId, data: {} };
    await setUserState(chatId, state, env);
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: "Введите ваш *email*:",
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:login" }]] }
    });
}

async function startCodeLogin(chatId: number, state: UserState, env: Env, messageId: number) {
    state.dialog = null; // No dialog needed for code, it's a direct message
    await setUserState(chatId, state, env);
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: "Пожалуйста, сгенерируйте 6-значный код в веб-приложении ('Настройки' ➡️ 'Интеграция с Telegram') и отправьте его мне.",
        reply_markup: { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "start_login" }]] }
    });
}

async function handleAuthCode(chatId: number, code: string, state: UserState, env: Env) {
    const key = `tgauth:${code}`;
    const userDataString = await env.BOT_STATE.get(key);

    if (userDataString) {
        const userData = JSON.parse(userDataString);
        const newState = normalizeState(userData); // Use the full data from web
        
        await setUserState(chatId, newState, env);
        await env.BOT_STATE.delete(key); 

        const nickname = newState.user?.nickname || 'пользователь';
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: `✅ *Аутентификация пройдена!*\n\nПривет, ${nickname}! Ваш аккаунт успешно привязан.`,
            parse_mode: 'Markdown',
        });
        await showMainMenu(chatId, newState, env);
    } else {
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: "❌ *Неверный или истекший код.* Пожалуйста, сгенерируйте новый код в веб-приложении и попробуйте снова.",
            parse_mode: 'Markdown',
        });
    }
}


// --- DIALOG HANDLER ---

async function handleDialog(chatId: number, text: string, state: UserState, env: Env, message?: TelegramMessage) {
    const dialog = state.dialog!;
    // Use the dialog's message ID by default, but allow overriding for new messages in the flow
    const messageId = dialog.messageId!;

    try {
        switch (dialog.step) {
            // REGISTRATION
            case 'register_email': {
                const existingUser = await env.BOT_STATE.get(`user:${text.toLowerCase()}`);
                if (existingUser) {
                    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: "Этот email уже занят. Попробуйте другой." });
                    return;
                }
                dialog.data.email = text.toLowerCase();
                dialog.step = 'register_nickname';
                await setUserState(chatId, state, env);
                await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                    chat_id: chatId, message_id: messageId, text: "Отлично! Теперь придумайте *никнейм*:", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
                });
                break;
            }
            case 'register_nickname': {
                dialog.data.nickname = text;
                dialog.step = 'register_password';
                await setUserState(chatId, state, env);
                await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                    chat_id: chatId, message_id: messageId, text: "Теперь придумайте *пароль* (рекомендуем удалить сообщение после ввода):", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:start" }]] }
                });
                break;
            }
            case 'register_password': {
                const newUser: User = {
                    email: dialog.data.email,
                    nickname: dialog.data.nickname,
                    password_hash: mockHash(text),
                    registeredAt: new Date().toISOString(),
                    referralCode: `${dialog.data.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0,
                    status: 'active',
                };
                
                const finalState: UserState = { ...normalizeState(null), user: newUser };

                await env.BOT_STATE.put(`user:${newUser.email}`, JSON.stringify(finalState));
                await env.BOT_STATE.put(`user_by_nickname:${newUser.nickname.toLowerCase()}`, newUser.email);

                const userListJson = await env.BOT_STATE.get('users:list');
                const userList = userListJson ? JSON.parse(userListJson) : [];
                if (!userList.includes(newUser.email)) {
                    userList.push(newUser.email);
                    await env.BOT_STATE.put('users:list', JSON.stringify(userList));
                }
                
                state.dialog = null;
                await setUserState(chatId, finalState, env);
                
                await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                    chat_id: chatId, message_id: messageId, text: `🎉 *Регистрация завершена!* Добро пожаловать, ${newUser.nickname}!` , parse_mode: 'Markdown'
                });
                await showMainMenu(chatId, finalState, env);
                break;
            }
            // LOGIN
            case 'login_email': {
                const userStateStr = await env.BOT_STATE.get(`user:${text.toLowerCase()}`);
                if (!userStateStr) {
                    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: "Пользователь с таким email не найден. Попробуйте снова или зарегистрируйтесь." });
                    return;
                }
                dialog.data.email = text.toLowerCase();
                dialog.step = 'login_password';
                await setUserState(chatId, state, env);
                await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                    chat_id: chatId, message_id: messageId, text: "Введите ваш *пароль*:", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog:login" }]] }
                });
                break;
            }
            case 'login_password': {
                const userStateStr = await env.BOT_STATE.get(`user:${dialog.data.email}`);
                const finalState = normalizeState(JSON.parse(userStateStr!));
                
                if (finalState.user?.password_hash === mockHash(text)) {
                    state.dialog = null;
                    await setUserState(chatId, finalState, env);
                     await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                        chat_id: chatId, message_id: messageId, text: `✅ *Вход выполнен!* С возвращением, ${finalState.user.nickname}!` , parse_mode: 'Markdown'
                    });
                    await showMainMenu(chatId, finalState, env);
                } else {
                     await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: "Неверный пароль. Попробуйте снова." });
                }
                break;
            }
            // AI CHAT
            case 'ai_chat_active': {
                if (message) { // Ensure it's a new message
                    const thinkingMsg = await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
                        chat_id: chatId,
                        text: "🤖 Думаю...",
                    });
                    
                    dialog.data.history.push({ role: 'user', text: text });

                    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: dialog.data.history
                    });
                    const aiText = response.text;
                    dialog.data.history.push({ role: 'model', text: aiText });
                    
                    await setUserState(chatId, state, env);
                    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                        chat_id: chatId,
                        message_id: thinkingMsg.result.message_id,
                        text: aiText
                    });
                }
                break;
            }
        }
    } catch (e) {
        await reportError(chatId, env, `Dialog[${dialog.step}]`, e);
        state.dialog = null;
        await setUserState(chatId, state, env);
        if (state.user) {
            await showMainMenu(chatId, state, env, "Произошла ошибка, попробуйте снова.");
        } else {
            await showStartMenu(chatId, env, "Произошла ошибка, попробуйте снова.", messageId);
        }
    }
}


// --- MAIN MENU HANDLERS (for authenticated users) ---

async function showMainMenu(chatId: number, state: UserState, env: Env, text?: string) {
    const payload = {
        chat_id: chatId,
        text: text || `*Главное меню*`,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📊 Статистика", callback_data: "show_stats" }, { text: "➕ Добавить ставку", callback_data: "add_bet" }],
                [{ text: "🏆 Соревнования", callback_data: "show_competitions" }, { text: "🎯 Мои цели", callback_data: "show_goals" }],
                [{ text: "🤖 AI-Аналитик", callback_data: "ai_chat" }],
            ]
        }
    };
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', payload);
}

async function handleStats(chatId: number, state: UserState, env: Env) {
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
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: statsText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog:main" }]] }
    });
}

async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const keyboard = SPORTS.map(sport => ({ text: sport, callback_data: `dialog_add_bet_sport:${sport}` }));
    const rows = [];
    for (let i = 0; i < keyboard.length; i += 3) {
        rows.push(keyboard.slice(i, i + 3));
    }
    
    state.dialog = { step: 'add_bet_sport', data: {} };
    await setUserState(chatId, state, env);
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: 'Выберите вид спорта:',
        reply_markup: {
            inline_keyboard: [
                ...rows,
                [{ text: '❌ Отмена', callback_data: 'cancel_dialog:main' }]
            ]
        }
    });
}

async function handleCompetitions(chatId: number, state: UserState, env: Env) {
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🏆 Раздел соревнований находится в разработке.',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog:main" }]] }
    });
}

async function handleGoals(chatId: number, state: UserState, env: Env) {
     await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🎯 Раздел "Мои цели" находится в разработке.',
        reply_markup: { inline_keyboard: [[{ text: "⬅️ В меню", callback_data: "cancel_dialog:main" }]] }
    });
}

async function startAiChat(chatId: number, state: UserState, env: Env) {
    state.dialog = { step: 'ai_chat_active', data: { history: [] } };
    await setUserState(chatId, state, env);
    await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
        chat_id: chatId,
        text: '🤖 Вы вошли в чат с AI-Аналитиком. Задайте вопрос.',
        reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'cancel_dialog:main' }]]
        }
    });
}
