// functions/api/telegram/webhook.ts

import { GoogleGenAI } from "@google/genai";
// FIX: Corrected the import path to resolve types correctly.
import { User, Bet, Goal, BankTransaction } from '../../../src/types';
// FIX: Corrected the import path to resolve types correctly.
import { UserBetData } from "../../../src/data/betStore";

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

// FIX: Added missing type definitions for Cloudflare Pages function.
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
        await handleDialog(chatId, text, state, env);
        return;
    }
    
    if (text.startsWith('/start')) {
        if (state.user) {
            await showMainMenu(chatId, state, env, `Вы уже вошли как *${state.user.nickname}*.`);
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
        await showStartMenu(chatId, env, "Действие отменено.", callbackQuery.message.message_id);
    } else {
        // Handle other callbacks for authenticated users if needed
        if (state.user) {
            await showMainMenu(chatId, state, env, "Неизвестное действие.");
        } else {
            await showStartMenu(chatId, env, "Пожалуйста, сначала войдите.");
        }
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
                 [{ text: "⬅️ Назад", callback_data: "cancel_dialog" }]
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
        reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog" }]] }
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
        reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog" }]] }
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
            text: `✅ *Аутентификация пройдена!*\n\nПривет, ${nickname}! Ваш аккаунт успешно привязан.`
        });
        await showMainMenu(chatId, newState, env);
    } else {
        await apiRequest(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
            chat_id: chatId,
            text: "❌ *Неверный или истекший код.* Пожалуйста, сгенерируйте новый код в веб-приложении и попробуйте снова."
        });
    }
}


// --- DIALOG HANDLER ---

async function handleDialog(chatId: number, text: string, state: UserState, env: Env) {
    const dialog = state.dialog!;
    const messageId = dialog.messageId!;

    try {
        switch (dialog.step) {
            case 'register_email': {
                // TODO: Add proper email validation
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
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog" }]] }
                });
                break;
            }
            case 'register_nickname': {
                 // TODO: Check if nickname is taken
                dialog.data.nickname = text;
                dialog.step = 'register_password';
                await setUserState(chatId, state, env);
                await apiRequest(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
                    chat_id: chatId, message_id: messageId, text: "Теперь придумайте *пароль* (рекомендуем удалить сообщение после ввода):", parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog" }]] }
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
                
                const finalState: UserState = {
                    ...normalizeState(null), // start with fresh data
                    user: newUser,
                };

                // Save user data under multiple keys for lookup
                await env.BOT_STATE.put(`user:${newUser.email}`, JSON.stringify(finalState));
                await env.BOT_STATE.put(`user_by_nickname:${newUser.nickname.toLowerCase()}`, newUser.email);

                // Add to global user list for admin panel
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
                    reply_markup: { inline_keyboard: [[{ text: "❌ Отмена", callback_data: "cancel_dialog" }]] }
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
        }
    } catch (e) {
        await reportError(chatId, env, `Dialog[${dialog.step}]`, e);
        state.dialog = null;
        await setUserState(chatId, state, env);
        await showStartMenu(chatId, env, "Произошла ошибка, попробуйте снова.", messageId);
    }
}


// --- MAIN MENU (for authenticated users) ---
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

// NOTE: Other handlers (add_bet, show_stats, etc.) would go here.
// They were removed for clarity to focus on the registration/login flow.
// The full implementation would require re-adding them.
