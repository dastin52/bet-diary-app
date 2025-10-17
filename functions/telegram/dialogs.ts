import { Bet, BetStatus, DialogState, Env, TelegramUpdate, BetType } from './types';
import { setUserState, addBetToState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, COMMON_ODDS, MARKETS_BY_SPORT } from '../constants';
import { showMainMenu } from './ui';
import { findUserBy, addUser, findUserByEmail } from '../data/userStore';
import { calculateRiskManagedStake } from '../utils/betUtils';

// A mock hashing function. In a real app, use a library like bcrypt on the server.
const mockHash = (password: string) => `hashed_${password}`;

const DIALOG_TYPES = {
    ADD_BET: 'add_bet',
    REGISTER: 'register',
    LOGIN: 'login',
    AI_CHAT: 'ai_chat',
};

// --- Helper Functions ---
const getChatId = (update: TelegramUpdate): number => 'message' in update ? update.message.chat.id : update.callbackQuery.message.chat.id;
const getUserInput = (update: TelegramUpdate): string => 'message' in update ? (update.message.text || '') : update.callbackQuery.data;

// --- DIALOG ROUTER ---

export async function continueDialog(update: TelegramUpdate, state: UserState, env: Env) {
    switch (state.dialog?.type) {
        case DIALOG_TYPES.ADD_BET:
            await continueAddBetDialog(update, state, env);
            break;
        case DIALOG_TYPES.REGISTER:
            await continueRegisterDialog(update, state, env);
            break;
        case DIALOG_TYPES.LOGIN:
            await continueLoginDialog(update, state, env);
            break;
        case DIALOG_TYPES.AI_CHAT:
            await continueAiChatDialog(update, state, env);
            break;
    }
}

// --- REGISTER DIALOG ---

export async function startRegisterDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog: DialogState = { type: 'register', step: 'EMAIL', data: {} };
    const text = "📝 *Регистрация*\n\nПожалуйста, введите ваш email:";
    
    const message = 'message' in update ? update.message : update.callbackQuery.message;
    await editMessageText(chatId, message.message_id, text, env);
    dialog.messageId = message.message_id;
    
    await setUserState(chatId, { ...state, dialog }, env);
}

async function continueRegisterDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const userInput = getUserInput(update);
    const dialog = state.dialog!;

    try {
        let text = '';
        switch (dialog.step) {
            case 'EMAIL':
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInput)) throw new Error("Неверный формат email. Попробуйте еще раз.");
                if (await findUserBy(u => u.email.toLowerCase() === userInput.toLowerCase(), env)) throw new Error("Этот email уже зарегистрирован. Попробуйте войти.");
                dialog.data.email = userInput;
                dialog.step = 'NICKNAME';
                text = "Отлично! Теперь введите ваш никнейм (мин. 3 символа):";
                break;
            
            case 'NICKNAME':
                if (userInput.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                dialog.data.nickname = userInput;
                dialog.step = 'PASSWORD';
                text = "Хорошо. Теперь придумайте пароль (мин. 6 символов):";
                break;
                
            case 'PASSWORD':
                if (userInput.length < 6) throw new Error("Пароль должен быть не менее 6 символов.");
                dialog.data.password = userInput;

                const newUser = {
                    email: dialog.data.email,
                    nickname: dialog.data.nickname,
                    password_hash: mockHash(dialog.data.password),
                    registeredAt: new Date().toISOString(),
                    referralCode: `${dialog.data.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0,
                    status: 'active' as const,
                };
                await addUser(newUser, env);
                
                const newState = { ...state, user: newUser, dialog: null, bets: [], bankroll: 10000, goals: [], bankHistory: [] };
                await setUserState(chatId, newState, env);

                await editMessageText(chatId, dialog.messageId!, `✅ *Регистрация успешна!*\nДобро пожаловать, ${newUser.nickname}!`, env);
                await showMainMenu(getUpdatePayload(update).message, env);
                return;
        }
        await editMessageText(chatId, dialog.messageId!, text, env);
        await setUserState(chatId, { ...state, dialog }, env);
    } catch (error) {
        const errorMessage = `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}\n\nПожалуйста, попробуйте снова.`;
        await editMessageText(chatId, dialog.messageId!, errorMessage, env);
    }
}


// --- LOGIN DIALOG ---

export async function startLoginDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog: DialogState = { type: 'login', step: 'EMAIL', data: {} };
    const text = "🔑 *Вход*\n\nПожалуйста, введите ваш email:";
    
    const message = getUpdatePayload(update);
    await editMessageText(chatId, message.message_id, text, env);
    dialog.messageId = message.message_id;

    await setUserState(chatId, { ...state, dialog }, env);
}

async function continueLoginDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const userInput = getUserInput(update);
    const dialog = state.dialog!;

    try {
        let text = '';
        switch (dialog.step) {
            case 'EMAIL':
                const userState = await findUserByEmail(userInput, env);
                if (!userState || !userState.user) throw new Error("Пользователь с таким email не найден. Попробуйте снова или зарегистрируйтесь.");
                dialog.data.userState = userState;
                dialog.step = 'PASSWORD';
                text = `Здравствуйте, ${userState.user.nickname}!\n\nВведите ваш пароль:`;
                break;

            case 'PASSWORD':
                const storedState = dialog.data.userState as UserState;
                if (storedState.user!.password_hash !== mockHash(userInput)) {
                    throw new Error("Неверный пароль. Попробуйте снова.");
                }
                
                const newState = { ...storedState, dialog: null };
                await setUserState(chatId, newState, env);
                
                await editMessageText(chatId, dialog.messageId!, `✅ *Вход выполнен успешно!*`, env);
                await showMainMenu(getUpdatePayload(update).message, env);
                return;
        }
        await editMessageText(chatId, dialog.messageId!, text, env);
        await setUserState(chatId, { ...state, dialog }, env);
    } catch (error) {
        const errorMessage = `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}\n\nПожалуйста, попробуйте снова.`;
        await editMessageText(chatId, dialog.messageId!, errorMessage, env);
    }
}


// --- AI CHAT DIALOG ---
export async function startAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog: DialogState = { type: 'ai_chat', step: 'ACTIVE', data: {} };
    const text = "🤖 AI-Аналитик к вашим услугам. Задайте свой вопрос.\n\nНажмите кнопку ниже или отправьте /stop, чтобы выйти.";
    const keyboard = { inline_keyboard: [[{ text: 'Завершить сессию', callback_data: '/stop' }]] };

    const message = getUpdatePayload(update);
    if ('data' in message) { // from callback
        await editMessageText(chatId, message.message_id, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
    await setUserState(chatId, { ...state, dialog }, env);
}

async function continueAiChatDialog(update: TelegramUpdate, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const userInput = getUserInput(update);
    
    if (userInput.toLowerCase() === '/stop') {
        const newState = { ...state, dialog: null };
        await setUserState(chatId, newState, env);
        const message = getUpdatePayload(update);
        if ('data' in message) {
            await editMessageText(chatId, message.message_id, "Сессия с AI-Аналитиком завершена.", env);
        }
        await showMainMenu(message, env);
        return;
    }
    
    await sendMessage(chatId, "⏳ AI-Аналитик думает...", env);
    // Placeholder for actual Gemini API call
    setTimeout(async () => {
        await sendMessage(chatId, `Ответ на ваш вопрос: "${userInput}". (Это заглушка, интеграция с Gemini API в разработке).`, env);
    }, 2000);
}


// --- ADD BET DIALOG ---
// Re-implementing the stable, enhanced version of the Add Bet dialog
export * from './addBetDialog';
