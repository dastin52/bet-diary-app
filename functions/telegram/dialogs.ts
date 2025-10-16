// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramCallbackQuery, TelegramMessage, UserState, BankTransactionType, User } from './types';
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { showLoginOptions, showMainMenu } from './ui';
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
        try {
            await editMessageText(message.chat.id, state.dialog.messageId!, "❌ Действие отменено.", env);
        } catch (e) {
            console.warn("Could not edit cancellation message, likely already deleted or old.");
        } finally {
            if (state.user) {
                await showMainMenu(message.chat.id, "Главное меню", env);
            } else {
                await showLoginOptions(message.chat.id, env);
            }
            if (state.dialog.messageId) {
                 await deleteMessage(message.chat.id, state.dialog.messageId, env).catch(() => {});
            }
            await setUserState(message.chat.id, updateDialogState(state, null), env);
        }
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

const getAddBetDialogText = (dialog: Dialog): string => {
    const data = dialog.data;
    const stepPrompt = (step: string): string => {
        switch(step) {
            case 'sport': return '👇 Выберите вид спорта:';
            case 'event': return 'Введите событие в формате: *Команда 1 - Команда 2, Исход* (например: `Реал Мадрид - Барселона, П1`)';
            case 'betType': return '👇 Выберите тип ставки:';
            case 'stake': return 'Введите сумму ставки (например: `100` или `150.50`)';
            case 'odds': return 'Введите коэффициент (например: `1.85`)';
            case 'bookmaker': return '👇 Выберите букмекера:';
            case 'confirm': return 'Всё верно?';
            default: return '';
        }
    };
    return `*📝 Новая ставка*

- *Спорт:* ${data.sport || '_не указан_'}
- *Событие:* ${data.event || '_не указано_'}
- *Тип:* ${data.betType ? BET_TYPE_OPTIONS.find(o => o.value === data.betType)?.label : '_не указан_'}
- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}
- *Коэф.:* ${data.odds || '_не указан_'}
- *Букмекер:* ${data.bookmaker || '_не указан_'}
    
${stepPrompt(dialog.step)}`;
};

const getAddBetKeyboard = (dialog: Dialog) => {
    switch(dialog.step) {
        case 'sport':
            return makeKeyboard([
                SPORTS.slice(0, 4).map(s => ({ text: s, callback_data: `dialog_input:${s}` })),
                SPORTS.slice(4, 8).map(s => ({ text: s, callback_data: `dialog_input:${s}` })),
                [{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]
            ]);
        case 'betType':
            return makeKeyboard([
                BET_TYPE_OPTIONS.filter(o => o.value !== BetType.System).map(o => ({ text: o.label, callback_data: `dialog_input:${o.value}`})),
                [{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]
            ]);
        case 'bookmaker':
             return makeKeyboard([
                BOOKMAKERS.slice(0, 3).map(b => ({ text: b, callback_data: `dialog_input:${b}`})),
                BOOKMAKERS.slice(3, 6).map(b => ({ text: b, callback_data: `dialog_input:${b}`})),
                [{ text: 'Другое', callback_data: 'dialog_input:Другое' }],
                [{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]
             ]);
        case 'confirm':
            return makeKeyboard([
                [{ text: '✅ Сохранить', callback_data: 'dialog_action:confirm'}, { text: '❌ Отмена', callback_data: 'dialog_action:cancel'}]
            ]);
        default:
            return makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]]);
    }
};


// --- ADD BET DIALOG ---
export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: 'sport', data: {} };
    const text = getAddBetDialogText(dialog);
    const keyboard = getAddBetKeyboard(dialog);
    const sentMessage = await sendMessage(chatId, text, env, keyboard);
    dialog.messageId = sentMessage.result.message_id;
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    const dialog = state.dialog!;
    const userInput = 'data' in update ? update.data.replace('dialog_input:', '') : 'text' in update ? update.text : '';

    try {
        let nextStep = dialog.step;
        switch (dialog.step) {
            case 'sport':
                dialog.data.sport = userInput;
                nextStep = 'event';
                break;
            case 'event':
                const parts = userInput.split(',').map(p => p.trim());
                if (parts.length !== 2) throw new Error("Неверный формат. Используйте: `Команда 1 - Команда 2, Исход`");
                const teams = parts[0].split('-').map(t => t.trim());
                if (teams.length !== 2) throw new Error("Неверный формат команд. Используйте `-` для разделения.");
                dialog.data.event = userInput;
                dialog.data.legs = [{ homeTeam: teams[0], awayTeam: teams[1], market: parts[1] }];
                nextStep = 'betType';
                break;
            case 'betType':
                dialog.data.betType = userInput;
                nextStep = 'stake';
                break;
            case 'stake':
                const stake = parseFloat(userInput);
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма ставки должна быть положительным числом.");
                dialog.data.stake = stake;
                nextStep = 'odds';
                break;
            case 'odds':
                const odds = parseFloat(userInput);
                if (isNaN(odds) || odds <= 1) throw new Error("Коэффициент должен быть числом больше 1.");
                dialog.data.odds = odds;
                nextStep = 'bookmaker';
                break;
            case 'bookmaker':
                dialog.data.bookmaker = userInput;
                nextStep = 'confirm';
                break;
            case 'confirm':
                if ('data' in update && update.data === 'dialog_action:confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending, betType: dialog.data.betType || BetType.Single };
                    const newState = addBetToState(state, finalBetData as Omit<Bet, 'id'|'createdAt'|'event'>);
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка на "${dialog.data.event}" успешно добавлена!`, env);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await setUserState(chatId, { ...newState, dialog: null }, env);
                    await showMainMenu(chatId, "Главное меню", env, dialog.messageId);
                    return;
                }
                return; // Wait for confirm/cancel action
        }
        dialog.step = nextStep;
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}. Попробуйте еще раз.`, env);
    }
    
    await editMessageText(chatId, dialog.messageId!, getAddBetDialogText(dialog), env, getAddBetKeyboard(dialog));
    await setUserState(chatId, updateDialogState(state, dialog), env);
}


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
                // FIX: Pass env object to userStore.findUserBy.
                if (await userStore.findUserBy(u => u.email === textInput, env)) throw new Error("Этот email уже используется.");
                dialog.data.email = textInput;
                dialog.step = 'nickname';
                break;
            case 'nickname':
                if (textInput.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                // FIX: Pass env object to userStore.findUserBy.
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
                const newState: UserState = { ...normalizeState(null), user: newUser };
                await setUserState(chatId, newState, env);
                
                await showMainMenu(chatId, `✅ Регистрация успешна!\n\nДобро пожаловать, ${newUser.nickname}!`, env, dialog.messageId);
                await deleteMessage(chatId, message.message_id, env); // delete password message
                return;
        }
    } catch (e) {
        await sendMessage(chatId, `⚠️ ${e instanceof Error ? e.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }

    const text = getRegisterLoginDialogText(dialog);
    await editMessageText(chatId, dialog.messageId!, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await deleteMessage(chatId, message.message_id, env).catch(()=>{}); // delete user input message
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
                // FIX: Pass env object to userStore.findUserBy.
                const user = await userStore.findUserBy(u => u.email === textInput, env);
                if (!user) throw new Error("Пользователь с таким email не найден.");
                dialog.data.user = user;
                dialog.step = 'password';
                break;
            case 'password':
                const storedUser = dialog.data.user as User;
                if (storedUser.password_hash !== mockHash(textInput)) throw new Error("Неверный пароль.");

                const existingState = await env.BOT_STATE.get<UserState>(`user_data:${storedUser.email}`, 'json');
                const newState = existingState ? normalizeState(existingState) : { ...normalizeState(null), user: storedUser };
                
                await setUserState(chatId, newState, env);
                await showMainMenu(chatId, `✅ Вход успешен!\n\nС возвращением, ${storedUser.nickname}!`, env, dialog.messageId);
                await deleteMessage(chatId, message.message_id, env); // delete password message
                return;
        }
    } catch (e) {
        await sendMessage(chatId, `⚠️ ${e instanceof Error ? e.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }
    const text = getRegisterLoginDialogText(dialog);
    await editMessageText(chatId, dialog.messageId!, text, env, { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] });
    await deleteMessage(chatId, message.message_id, env).catch(()=>{});
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

// --- AI CHAT DIALOG ---
export async function startAiChatDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'ai_chat', step: 'active', data: { history: [] }, messageId };
    await setUserState(chatId, { ...state, dialog });
    const text = "🤖 *AI-Аналитик*\n\nЗадайте вопрос о вашей статистике или попросите проанализировать предстоящий матч.";
    const keyboard = { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] };
    // We start the AI chat in the *same* message as the main menu to feel seamless
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function continueAiChatDialog(message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;
    const dialog = state.dialog as Dialog;
    const textInput = message.text || '';

    if (!textInput) return;
    
    // Delete the user's message to keep the chat clean
    await deleteMessage(chatId, message.message_id, env).catch(() => {});

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
        
        const responseText = `🤖 *AI-Аналитик*\n\n${aiResponse}\n\n_Что еще вас интересует?_`;
        await editMessageText(chatId, dialog.messageId!, responseText, env, { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] });

    } catch (error) {
         await editMessageText(chatId, dialog.messageId!, "🤖 AI-Аналитик\n\nПроизошла ошибка при обращении к AI. Попробуйте еще раз.", env, { inline_keyboard: [[{ text: '⬅️ Выйти из чата', callback_data: 'main_menu' }]] });
         console.error("AI Chat Dialog Error:", error);
    }
    
    await setUserState(chatId, { ...state, dialog });
}


// --- UI HELPERS for Register/Login ---
function getRegisterLoginDialogText(dialog: Dialog): string {
    const baseText = dialog.type === 'register' ? "📝 *Регистрация*" : "➡️ *Вход*";
    switch (dialog.step) {
        case 'email': return `${baseText}\n\nПожалуйста, введите ваш email:`;
        case 'nickname': return `${baseText}\n\nОтлично! Теперь введите ваш никнейм:`;
        case 'password': return `${baseText}\n\nПоследний шаг, введите пароль (минимум 6 символов):`;
        default: return "Что-то пошло не так.";
    }
}
