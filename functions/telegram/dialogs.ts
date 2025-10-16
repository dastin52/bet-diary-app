// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramCallbackQuery, TelegramMessage, UserState, BankTransactionType, User } from './types';
// FIX: Import normalizeState to resolve 'Cannot find name' error.
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
// FIX: Removed `showMainMenu` import to break circular dependency.
import { showLoginOptions } from './commands';
import * as userStore from '../data/userStore';
import { GoogleGenAI } from "@google/genai";

// A mock hashing function. In a real app, use a library like bcrypt.
const mockHash = (password: string) => `hashed_${password}`;

const REFERRAL_REWARD_FOR_REFERRER = 100;
const REFERRAL_BONUS_FOR_INVITEE = 50;

// --- DIALOG STATE MANAGEMENT ---
const updateDialogState = (state: UserState, dialog: Dialog | null): UserState => ({ ...state, dialog });
const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

// --- DIALOG ROUTER ---
export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (!state.dialog) return;
    const message = 'message' in update ? update.message : update;

    // Universal cancel for all dialogs
    if ('data' in update && update.data === 'dialog_action:cancel') {
        await editMessageText(message.chat.id, state.dialog.messageId!, "❌ Действие отменено.", env);
        // Give user a moment to see the cancellation message
        await new Promise(resolve => setTimeout(resolve, 1500));
        await deleteMessage(message.chat.id, state.dialog.messageId!, env);

        if (state.user) {
            // FIX: Manually inlined `showMainMenu` to avoid circular dependency.
            const text = "Главное меню";
            const keyboard = {
                inline_keyboard: [
                    [{ text: '📊 Статистика', callback_data: 'show_stats' }, { text: '➕ Добавить ставку', callback_data: 'add_bet' }],
                    [{ text: '🏆 Соревнования', callback_data: 'show_competitions' }, { text: '🎯 Мои цели', callback_data: 'show_goals' }],
                    [{ text: '🤖 AI-Аналитик', callback_data: 'ai_chat' }],
                ]
            };
            await sendMessage(message.chat.id, text, env, keyboard);
        } else {
            await showLoginOptions(message.chat.id, env);
        }
        await setUserState(message.chat.id, updateDialogState(state, null), env);
        return;
    }

    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'register':
            await continueRegisterDialog(update as TelegramMessage, state, env);
            break;
        case 'login':
            await continueLoginDialog(update as TelegramMessage, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update as TelegramMessage, state, env);
            break;
    }
}


// --- BET CREATION LOGIC ---
function addBetToState(state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState {
    const newBet: Bet = { ...betData, id: `bet_${Date.now()}`, createdAt: new Date().toISOString(), event: generateEventString(betData.legs, betData.betType, betData.sport) };
    const newState = { ...state };
    let newBankroll = state.bankroll;
    
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
        if (newBet.profit !== 0) {
            const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
            const newBalance = newBankroll + newBet.profit;
            const newTransaction = { id: `tx_${Date.now()}`, timestamp: new Date().toISOString(), type, amount: newBet.profit, previousBalance: newBankroll, newBalance, description: `Ставка: ${newBet.event}`, betId: newBet.id };
            newState.bankHistory = [newTransaction, ...newState.bankHistory];
            newBankroll = newBalance;
        }
    }
    newState.bets = [newBet, ...state.bets].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    newState.bankroll = newBankroll;
    return newState;
}

// --- ADD BET DIALOG ---
export async function startAddBetDialog(chatId: number, state: UserState, env: Env) { /* ... implementation ... */ }
async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) { /* ... implementation ... */ }
function getAddBetDialogText(dialog: Dialog): string { /* ... */ return ""; }
function getAddBetKeyboard(dialog: Dialog) { /* ... */ }


// --- REGISTER DIALOG ---
export async function startRegisterDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'register', step: 'email', data: {}, messageId };
    const text = "📝 *Регистрация*\n\nПожалуйста, введите ваш email:";
    await editMessageText(chatId, messageId, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

async function continueRegisterDialog(message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;
    const dialog = state.dialog!;
    const textInput = message.text || '';

    try {
        switch (dialog.step) {
            case 'email':
                if (!/^\S+@\S+\.\S+$/.test(textInput)) throw new Error("Неверный формат email.");
                if (await userStore.findUserBy(u => u.email === textInput, env)) throw new Error("Этот email уже используется.");
                dialog.data.email = textInput;
                dialog.step = 'nickname';
                break;
            case 'nickname':
                if (textInput.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                if (await userStore.findUserBy(u => u.nickname.toLowerCase() === textInput.toLowerCase(), env)) throw new Error("Этот никнейм уже занят.");
                dialog.data.nickname = textInput;
                dialog.step = 'password';
                break;
            case 'password':
                if (textInput.length < 6) throw new Error("Пароль должен быть не менее 6 символов.");
                const newUser: User = {
                    email: dialog.data.email,
                    nickname: dialog.data.nickname,
                    password_hash: mockHash(textInput),
                    registeredAt: new Date().toISOString(),
                    referralCode: `${dialog.data.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0,
                    status: 'active',
                };
                await userStore.addUser(newUser, env);
                const newState: UserState = { ...state, user: newUser, dialog: null, bets: [], bankroll: 10000, goals: [], bankHistory: [] };
                await setUserState(chatId, newState, env);
                // FIX: Inlined showMainMenu to break circular dependency and resolve argument count error.
                const successTextRegister = `✅ Регистрация успешна!\n\nДобро пожаловать, ${newUser.nickname}!`;
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '📊 Статистика', callback_data: 'show_stats' }, { text: '➕ Добавить ставку', callback_data: 'add_bet' }],
                        [{ text: '🏆 Соревнования', callback_data: 'show_competitions' }, { text: '🎯 Мои цели', callback_data: 'show_goals' }],
                        [{ text: '🤖 AI-Аналитик', callback_data: 'ai_chat' }],
                    ]
                };
                await editMessageText(chatId, dialog.messageId!, successTextRegister, env, keyboard);
                await deleteMessage(chatId, message.message_id, env); // delete password message
                return;
        }
    } catch (e) {
        await sendMessage(chatId, `⚠️ ${e instanceof Error ? e.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }

    const text = getRegisterLoginDialogText(dialog);
    await editMessageText(chatId, dialog.messageId!, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await deleteMessage(chatId, message.message_id, env); // delete user input message
    await setUserState(chatId, updateDialogState(state, dialog), env);
}


// --- LOGIN DIALOG ---
export async function startLoginDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'login', step: 'email', data: {}, messageId };
    const text = "➡️ *Вход*\n\nПожалуйста, введите ваш email:";
    await editMessageText(chatId, messageId, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

async function continueLoginDialog(message: TelegramMessage, state: UserState, env: Env) {
     const chatId = message.chat.id;
    const dialog = state.dialog!;
    const textInput = message.text || '';
     try {
        switch (dialog.step) {
            case 'email':
                const user = await userStore.findUserBy(u => u.email === textInput, env);
                if (!user) throw new Error("Пользователь с таким email не найден.");
                dialog.data.user = user;
                dialog.step = 'password';
                break;
            case 'password':
                const storedUser = dialog.data.user as User;
                if (storedUser.password_hash !== mockHash(textInput)) throw new Error("Неверный пароль.");

                // On successful login, fetch the full user state from KV if it exists, otherwise use the user object and defaults
                const existingState = await env.BOT_STATE.get<UserState>(`user_data:${storedUser.email}`, 'json');
                const newState = existingState ? normalizeState(existingState) : { ...state, user: storedUser, bets: [], bankroll: 10000, goals: [], bankHistory: [] };
                
                await setUserState(chatId, updateDialogState(newState, null), env);
                // FIX: Inlined showMainMenu to break circular dependency and resolve argument count error.
                const successTextLogin = `✅ Вход успешен!\n\nС возвращением, ${storedUser.nickname}!`;
                const keyboard = {
                    inline_keyboard: [
                        [{ text: '📊 Статистика', callback_data: 'show_stats' }, { text: '➕ Добавить ставку', callback_data: 'add_bet' }],
                        [{ text: '🏆 Соревнования', callback_data: 'show_competitions' }, { text: '🎯 Мои цели', callback_data: 'show_goals' }],
                        [{ text: '🤖 AI-Аналитик', callback_data: 'ai_chat' }],
                    ]
                };
                await editMessageText(chatId, dialog.messageId!, successTextLogin, env, keyboard);
                await deleteMessage(chatId, message.message_id, env); // delete password message
                return;
        }
    } catch (e) {
        await sendMessage(chatId, `⚠️ ${e instanceof Error ? e.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }
    const text = getRegisterLoginDialogText(dialog);
    await editMessageText(chatId, dialog.messageId!, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await deleteMessage(chatId, message.message_id, env);
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

// --- AI CHAT DIALOG ---
export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'ai_chat', step: 'active', data: { history: [] }, messageId };
    await setUserState(chatId, { ...state, dialog });
    const text = "🤖 *AI-Аналитик*\n\nЗадайте вопрос о вашей статистике или попросите проанализировать предстоящий матч.";
    const keyboard = { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] };
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function continueAiChatDialog(message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;
    const dialog = state.dialog as Dialog;
    const textInput = message.text || '';

    if (!textInput) return;

    await editMessageText(chatId, dialog.messageId!, "🤖 AI-Аналитик\n\n🤔 Думаю...", env, { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] });
    
    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const history = dialog.data.history || [];
        const contents = [...history, { role: 'user', parts: [{ text: textInput }] }];
        
        const result = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
        });

        const aiResponse = result.text;
        dialog.data.history = [...contents, { role: 'model', parts: [{ text: aiResponse }] }];
        
        const responseText = `🤖 *AI-Аналитик*\n\n${aiResponse}`;
        await editMessageText(chatId, dialog.messageId!, responseText, env, { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] });

    } catch (error) {
         await editMessageText(chatId, dialog.messageId!, "🤖 AI-Аналитик\n\nПроизошла ошибка при обращении к AI. Попробуйте еще раз.", env, { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] });
         console.error("AI Chat Dialog Error:", error);
    }
    
    await setUserState(chatId, { ...state, dialog });
}


// --- UI HELPERS for Register/Login ---
function getRegisterLoginDialogText(dialog: Dialog): string {
    switch (dialog.step) {
        case 'email': return `Пожалуйста, введите ваш email:`;
        case 'nickname': return `Отлично! Теперь введите ваш никнейм:`;
        case 'password': return `Последний шаг, введите пароль (минимум 6 символов):`;
        default: return "Что-то пошло не так.";
    }
}