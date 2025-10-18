// functions/telegram/dialogs.ts
import { TelegramUpdate, UserState, Env, Dialog, GoalMetric, Goal, User, Bet, BankTransaction } from './types';
import { setUserState, addGoalToState, updateAndSyncState } from './state';
import { sendMessage, editMessageText } from './telegramApi';
import { makeKeyboard, showMainMenu } from './ui';
import { GoogleGenAI } from "@google/genai";
import { formatDetailedReportText, calculateAnalytics } from './analytics';
import { CB } from './router';
import { findUserBy, mockHash } from '../data/userStore';

// Main dialog router
export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env): Promise<void> {
    const dialog = state.dialog;
    if (!dialog) return;

    switch (dialog.type) {
        case 'add_goal':
            // await continueAddGoalDialog(update, state, env);
            break;
        case 'add_bet':
             // await continueAddBetDialog(update, state, env);
             break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        case 'register':
            await handleRegistrationResponse(update, state, env);
            break;
        case 'login':
            await handleLoginResponse(update, state, env);
            break;
        default:
            const chatId = update.message!.chat.id;
            await sendMessage(chatId, "Диалог прерван (неизвестный тип).", env);
            const newState = { ...state, dialog: null };
            await setUserState(chatId, newState, env);
            break;
    }
}

// Dummy placeholder to avoid errors
export async function startAddBetDialog(chatId: number, state: UserState, env: Env, messageId: number | null) {
    await sendMessage(chatId, "Добавление ставок в разработке.", env);
}

// --- AI Chat Dialog ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null): Promise<void> {
    const dialog: Dialog = { type: 'ai_chat', step: 'prompt', messageId: 0 };
    const newState: UserState = { ...state, dialog };
    
    const text = "🤖 С чем я могу помочь? Задайте вопрос о вашей статистике, предстоящем матче или попросите совета.";
    const keyboard = makeKeyboard([[{ text: '◀️ Отмена', callback_data: CB.BACK_TO_MAIN }]]);

    let sentMessage;
    if (messageIdToEdit) {
        sentMessage = await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
    } else {
        sentMessage = await sendMessage(chatId, text, env, keyboard);
    }
    
    newState.dialog!.messageId = sentMessage.result.message_id;
    await setUserState(chatId, newState, env);
}

async function continueAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = update.message!.chat.id;
    const text = update.message!.text;

    if (!text) {
        await sendMessage(chatId, "Пожалуйста, отправьте текстовый вопрос.", env);
        return;
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    
    await editMessageText(chatId, state.dialog!.messageId, "🤖 _Думаю..._", env);

    const analytics = calculateAnalytics(state);
    const context = formatDetailedReportText(analytics);
    const prompt = `Контекст моей статистики:\n${context}\n\nМой вопрос: "${text}"`;

    try {
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        
        await editMessageText(chatId, state.dialog!.messageId, result.text, env, makeKeyboard([[{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]]));

    } catch(e) {
        console.error("AI chat error", e);
        await editMessageText(chatId, state.dialog!.messageId, "Произошла ошибка при обращении к AI.", env);
    } finally {
        const newState = { ...state, dialog: null };
        await setUserState(chatId, newState, env);
    }
}

// --- Registration Dialog ---

export async function startRegistrationDialog(chatId: number, state: UserState, env: Env, messageId: number): Promise<void> {
    const dialog: Dialog = { type: 'register', step: 'email', messageId };
    const newState: UserState = { ...state, dialog };
    await setUserState(chatId, newState, env);
    await editMessageText(chatId, messageId, "🚀 *Регистрация*\n\nПожалуйста, введите ваш email:", env);
}

async function handleRegistrationResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message!;
    const dialog = state.dialog!;
    const text = message.text?.trim();
    const chatId = message.chat.id;

    if (!text) { await sendMessage(chatId, "Пожалуйста, введите текст.", env); return; }

    let nextStep = dialog.step;
    let nextData = dialog.data || {};
    let responseText = '';

    try {
        switch (dialog.step) {
            case 'email':
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error("Неверный формат email. Попробуйте снова.");
                if (await findUserBy(u => u.email === text, env)) throw new Error("Этот email уже зарегистрирован. Попробуйте войти.");
                
                nextData.email = text;
                nextStep = 'nickname';
                responseText = `✅ Email принят.\n\nТеперь введите ваш никнейм (мин. 3 символа):`;
                break;

            case 'nickname':
                if (text.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                if (await findUserBy(u => u.nickname.toLowerCase() === text.toLowerCase(), env)) throw new Error("Этот никнейм уже занят. Выберите другой.");

                nextData.nickname = text;
                nextStep = 'password';
                responseText = `✅ Никнейм свободен.\n\nПридумайте пароль (мин. 6 символов):`;
                break;
                
            case 'password':
                if (text.length < 6) throw new Error("Пароль должен быть не менее 6 символов.");
                
                const newUser: User = { 
                    email: nextData.email, 
                    nickname: nextData.nickname,
                    password_hash: mockHash(text),
                    registeredAt: new Date().toISOString(),
                    referralCode: `${nextData.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0,
                    status: 'active',
                };
                
                const initialUserState: UserState = {
                    user: newUser,
                    bets: [],
                    bankroll: 10000,
                    goals: [],
                    bankHistory: [],
                    dialog: null,
                };

                await updateAndSyncState(chatId, initialUserState, env);
                await sendMessage(chatId, `🎉 Регистрация завершена! Добро пожаловать, ${newUser.nickname}!`, env);
                await showMainMenu(chatId, null, env);
                return; // Exit dialog
        }

        const newDialog: Dialog = { ...dialog, step: nextStep, data: nextData };
        await setUserState(chatId, { ...state, dialog: newDialog }, env);
        await editMessageText(chatId, dialog.messageId, responseText, env);

    } catch (e: any) {
        await sendMessage(chatId, `❌ ${e.message}`, env);
    }
}

// --- Login Dialog ---

export async function startLoginDialog(chatId: number, state: UserState, env: Env, messageId: number): Promise<void> {
    const dialog: Dialog = { type: 'login', step: 'email', messageId };
    await setUserState(chatId, { ...state, dialog }, env);
    await editMessageText(chatId, messageId, "🔑 *Вход*\n\nПожалуйста, введите ваш email:", env);
}

async function handleLoginResponse(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message!;
    const dialog = state.dialog!;
    const text = message.text?.trim();
    const chatId = message.chat.id;

    if (!text) { await sendMessage(chatId, "Пожалуйста, введите текст.", env); return; }

    try {
        switch (dialog.step) {
            case 'email':
                const userExists = await findUserBy(u => u.email === text, env);
                if (!userExists) throw new Error("Пользователь с таким email не найден. Попробуйте зарегистрироваться.");
                
                dialog.data = { email: text };
                dialog.step = 'password';
                await setUserState(chatId, { ...state, dialog }, env);
                await editMessageText(chatId, dialog.messageId, "✅ Email найден.\n\nВведите ваш пароль:", env);
                break;

            case 'password':
                const user = await findUserBy(u => u.email === dialog.data.email, env);
                if (user && user.password_hash === mockHash(text)) {
                    if (user.status === 'blocked') throw new Error("Этот аккаунт заблокирован.");
                    
                    const key = `betdata:${user.email}`;
                    const userDataStr = await env.BOT_STATE.get(key);
                    const userData = userDataStr ? JSON.parse(userDataStr) : { user, bets: [], bankroll: 10000, goals: [], bankHistory: [] };

                    const finalState: UserState = { ...userData, dialog: null };
                    await updateAndSyncState(chatId, finalState, env);
                    
                    await sendMessage(chatId, `✅ Вход выполнен! С возвращением, ${user.nickname}!`, env);
                    await showMainMenu(chatId, null, env);

                } else {
                    throw new Error("Неверный пароль. Попробуйте снова.");
                }
                break;
        }
    } catch (e: any) {
        await sendMessage(chatId, `❌ ${e.message}`, env);
        // On password error, restart login flow for simplicity
        if (dialog.step === 'password') {
            const finalState = { ...state, dialog: null };
            await setUserState(chatId, finalState, env);
            await showMainMenu(chatId, dialog.messageId, env, "Попробуйте войти снова.");
        }
    }
}


// --- Add Goal Dialog ---

export async function startAddGoalDialog(chatId: number, state: UserState, env: Env, messageIdToEdit: number | null): Promise<void> {
    const dialog: Dialog = { type: 'add_goal', step: 'title', messageId: 0, data: {} };
    const text = "🎯 *Новая цель*\n\nВведите название цели (например, 'Выйти в плюс по футболу').";
    
    let sentMessage;
    if (messageIdToEdit) {
       sentMessage = await editMessageText(chatId, messageIdToEdit, text, env);
    } else {
       sentMessage = await sendMessage(chatId, text, env);
    }
    
    dialog.messageId = sentMessage.result.message_id;
    await setUserState(chatId, { ...state, dialog }, env);
}