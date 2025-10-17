// functions/telegram/dialogs.ts
import {
    Bet, BetStatus, BetType, Dialog, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType,
    User, Message
} from './types';
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { makeKeyboard, showMainMenu } from './ui';
import { CB } from './router';
import { GoogleGenAI } from '@google/genai';
import * as userStore from '../data/userStore';

// Mock hash for function context
const mockHash = (password: string) => `hashed_${password}`;

// --- UTILITY ---
const isCallback = (update: TelegramMessage | TelegramCallbackQuery): update is TelegramCallbackQuery => 'data' in update;
const getChatId = (update: TelegramMessage | TelegramCallbackQuery): number => isCallback(update) ? update.message.chat.id : update.chat.id;
const getUserInput = (update: TelegramMessage | TelegramCallbackQuery): string => isCallback(update) ? update.data : update.text || '';


// --- DIALOG ROUTER ---
export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (!state.dialog) return;
    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'register':
            await continueRegisterDialog(update, state, env);
            break;
        case 'login':
            await continueLoginDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        default:
            const chatId = getChatId(update);
            state.dialog = null;
            await setUserState(chatId, state, env);
            await sendMessage(chatId, "Что-то пошло не так. Диалог сброшен.", env);
    }
}


// --- ADD BET DIALOG ---

const addBetToState = (state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState => {
    const newBet: Bet = {
        ...betData,
        id: new Date().toISOString() + Math.random(),
        createdAt: new Date().toISOString(),
        event: generateEventString(betData.legs, betData.betType, betData.sport),
    };
    
    const newState = { ...state };
    let newBankroll = state.bankroll;
    
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
        if(newBet.profit !== 0) {
            const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
            const newBalance = newBankroll + newBet.profit;
            const newTransaction = {
                id: new Date().toISOString() + Math.random(),
                timestamp: new Date().toISOString(),
                type,
                amount: newBet.profit,
                previousBalance: newBankroll,
                newBalance,
                description: `Ставка рассчитана: ${newBet.event}`,
                betId: newBet.id,
            };
            newState.bankHistory = [newTransaction, ...newState.bankHistory];
            newBankroll = newBalance;
        }
    }
    
    newState.bets = [newBet, ...state.bets].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    newState.bankroll = newBankroll;
    
    return newState;
}

const ADD_BET_STEPS = {
    SPORT: 'SPORT', EVENT: 'EVENT', BET_TYPE: 'BET_TYPE',
    STAKE: 'STAKE', ODDS: 'ODDS', BOOKMAKER: 'BOOKMAKER', CONFIRM: 'CONFIRM',
};

const getAddBetDialogText = (dialog: Dialog): string => {
    const data = dialog.data;
    const prompt = getAddBetStepPrompt(dialog.step);
    return `*📝 Новая ставка*\n\n- *Спорт:* ${data.sport || '_не указан_'}\n- *Событие:* ${data.event || '_не указано_'}\n- *Тип:* ${data.betType ? BET_TYPE_OPTIONS.find(o => o.value === data.betType)?.label : '_не указан_'}\n- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}\n- *Коэф.:* ${data.odds || '_не указан_'}\n- *Букмекер:* ${data.bookmaker || '_не указан_'}\n\n${prompt}`;
}


const getAddBetStepPrompt = (step: string): string => {
    switch(step) {
        case ADD_BET_STEPS.SPORT: return '👇 Выберите вид спорта:';
        case ADD_BET_STEPS.EVENT: return 'Введите событие в формате: *Команда 1 - Команда 2, Исход* (например: `Реал Мадрид - Барселона, П1`)';
        case ADD_BET_STEPS.BET_TYPE: return '👇 Выберите тип ставки:';
        case ADD_BET_STEPS.STAKE: return 'Введите сумму ставки (например: `100` или `150.50`)';
        case ADD_BET_STEPS.ODDS: return 'Введите коэффициент (например: `1.85`)';
        case ADD_BET_STEPS.BOOKMAKER: return '👇 Выберите букмекера:';
        case ADD_BET_STEPS.CONFIRM: return 'Всё верно?';
        default: return '';
    }
};

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: ADD_BET_STEPS.SPORT, data: {} };

    const keyboard = makeKeyboard([
        SPORTS.slice(0, 4).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
        SPORTS.slice(4, 8).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
        [{ text: '❌ Отмена', callback_data: 'dialog_cancel'}]
    ]);
    const sentMessage = await sendMessage(chatId, getAddBetDialogText(dialog), env, keyboard);

    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog = state.dialog!;
    const userInput = getUserInput(update);

    if (userInput === 'dialog_cancel') {
        await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
        state.dialog = null;
        await setUserState(chatId, state, env);
        await showMainMenu(update, env);
        return;
    }

    try {
        switch (dialog.step) {
            case ADD_BET_STEPS.SPORT:
                if (!userInput?.startsWith('dialog_sport_')) return;
                dialog.data.sport = userInput.replace('dialog_sport_', '');
                dialog.step = ADD_BET_STEPS.EVENT;
                break;
            case ADD_BET_STEPS.EVENT:
                const parts = userInput.split(',').map(p => p.trim());
                if (parts.length !== 2) throw new Error("Неверный формат. Используйте: `Команда 1 - Команда 2, Исход`");
                const teams = parts[0].split('-').map(t => t.trim());
                if (teams.length !== 2) throw new Error("Неверный формат команд. Используйте `-` для разделения.");
                dialog.data.event = userInput;
                dialog.data.legs = [{ homeTeam: teams[0], awayTeam: teams[1], market: parts[1] }];
                dialog.step = ADD_BET_STEPS.BET_TYPE;
                break;
            case ADD_BET_STEPS.BET_TYPE:
                if (!userInput?.startsWith('dialog_bettype_')) return;
                dialog.data.betType = userInput.replace('dialog_bettype_', '');
                dialog.step = ADD_BET_STEPS.STAKE;
                break;
            case ADD_BET_STEPS.STAKE:
                const stake = parseFloat(userInput);
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма ставки должна быть положительным числом.");
                dialog.data.stake = stake;
                dialog.step = ADD_BET_STEPS.ODDS;
                break;
            case ADD_BET_STEPS.ODDS:
                const odds = parseFloat(userInput);
                if (isNaN(odds) || odds <= 1) throw new Error("Коэффициент должен быть числом больше 1.");
                dialog.data.odds = odds;
                dialog.step = ADD_BET_STEPS.BOOKMAKER;
                break;
            case ADD_BET_STEPS.BOOKMAKER:
                if (!userInput?.startsWith('dialog_bookie_')) return;
                dialog.data.bookmaker = userInput.replace('dialog_bookie_', '');
                dialog.step = ADD_BET_STEPS.CONFIRM;
                break;
            case ADD_BET_STEPS.CONFIRM:
                if (userInput === 'dialog_confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending };
                    const newState = addBetToState(state, finalBetData as Omit<Bet, 'id'|'createdAt'|'event'>);
                    newState.dialog = null;
                    await setUserState(chatId, newState, env);
                    // Persist data for the user
                    if (newState.user) {
                        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
                    }
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка на "${dialog.data.event}" успешно добавлена!`, env);
                    await showMainMenu(update, env);
                    return;
                }
                return;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
    }
    
    let keyboard;
    const cancelBtn = { text: '❌ Отмена', callback_data: 'dialog_cancel' };
    switch(dialog.step) {
        case ADD_BET_STEPS.BET_TYPE:
            keyboard = makeKeyboard([BET_TYPE_OPTIONS.filter(o => o.value !== BetType.System).map(o => ({ text: o.label, callback_data: `dialog_bettype_${o.value}`})), [cancelBtn]]);
            break;
        case ADD_BET_STEPS.BOOKMAKER:
             keyboard = makeKeyboard([
                BOOKMAKERS.slice(0, 3).map(b => ({ text: b, callback_data: `dialog_bookie_${b}`})),
                BOOKMAKERS.slice(3, 6).map(b => ({ text: b, callback_data: `dialog_bookie_${b}`})),
                [{ text: 'Другое', callback_data: 'dialog_bookie_Другое' }, cancelBtn]
             ]);
            break;
        case ADD_BET_STEPS.CONFIRM:
            keyboard = makeKeyboard([
                [{ text: '✅ Сохранить', callback_data: 'dialog_confirm'}, { text: '❌ Отмена', callback_data: 'dialog_cancel'}]
            ]);
            break;
        default:
             keyboard = makeKeyboard([ [cancelBtn] ]);
    }

    await editMessageText(chatId, dialog.messageId!, getAddBetDialogText(dialog), env, keyboard);
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- REGISTER DIALOG ---

const REG_STEPS = { EMAIL: 'EMAIL', NICKNAME: 'NICKNAME', PASSWORD: 'PASSWORD' };

export async function startRegisterDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'register', step: REG_STEPS.EMAIL, data: {}, messageId };
    state.dialog = dialog;
    await setUserState(chatId, state, env);
    await editMessageText(chatId, messageId, "Шаг 1/3: Введите ваш Email:", env);
}

async function continueRegisterDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog = state.dialog!;
    const userInput = getUserInput(update);
    
    try {
        switch (dialog.step) {
            case REG_STEPS.EMAIL:
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userInput)) throw new Error("Неверный формат Email.");
                if (await userStore.findUserBy(u => u.email === userInput, env)) throw new Error("Этот Email уже зарегистрирован.");
                dialog.data.email = userInput;
                dialog.step = REG_STEPS.NICKNAME;
                await editMessageText(chatId, dialog.messageId!, "Шаг 2/3: Введите ваш никнейм (мин. 3 символа):", env);
                break;
            case REG_STEPS.NICKNAME:
                if (userInput.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                if (await userStore.findUserBy(u => u.nickname.toLowerCase() === userInput.toLowerCase(), env)) throw new Error("Этот никнейм уже занят.");
                dialog.data.nickname = userInput;
                dialog.step = REG_STEPS.PASSWORD;
                await editMessageText(chatId, dialog.messageId!, "Шаг 3/3: Введите пароль (мин. 6 символов):", env);
                break;
            case REG_STEPS.PASSWORD:
                if (userInput.length < 6) throw new Error("Пароль должен быть не менее 6 символов.");
                const newUser: User = { 
                    email: dialog.data.email, 
                    nickname: dialog.data.nickname,
                    password_hash: mockHash(userInput),
                    registeredAt: new Date().toISOString(),
                    referralCode: `${dialog.data.nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                    buttercups: 0, status: 'active',
                };
                await userStore.addUser(newUser, env);
                
                const newState = normalizeState({ user: newUser });
                newState.dialog = null;
                await setUserState(chatId, newState, env);
                await env.BOT_STATE.put(`betdata:${newUser.email}`, JSON.stringify(newState));

                await showMainMenu(update, env);
                return;
        }
    } catch (error) {
         await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}\nПопробуйте еще раз.`, env);
    }
     await setUserState(chatId, state, env);
}

// --- LOGIN DIALOG ---

const LOGIN_STEPS = { EMAIL: 'EMAIL', PASSWORD: 'PASSWORD' };

export async function startLoginDialog(chatId: number, state: UserState, env: Env, messageId: number) {
    const dialog: Dialog = { type: 'login', step: LOGIN_STEPS.EMAIL, data: {}, messageId };
    state.dialog = dialog;
    await setUserState(chatId, state, env);
    await editMessageText(chatId, messageId, "Шаг 1/2: Введите ваш Email:", env);
}

async function continueLoginDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog = state.dialog!;
    const userInput = getUserInput(update);
    
    try {
        switch (dialog.step) {
            case LOGIN_STEPS.EMAIL:
                const user = await userStore.findUserBy(u => u.email === userInput, env);
                if (!user) throw new Error("Пользователь с таким Email не найден.");
                dialog.data.user = user;
                dialog.step = LOGIN_STEPS.PASSWORD;
                await editMessageText(chatId, dialog.messageId!, "Шаг 2/2: Введите ваш пароль:", env);
                break;
            case LOGIN_STEPS.PASSWORD:
                const foundUser = dialog.data.user as User;
                if (foundUser.password_hash !== mockHash(userInput)) throw new Error("Неверный пароль.");
                if (foundUser.status === 'blocked') throw new Error("Этот аккаунт заблокирован.");
                
                const fullUserData = await env.BOT_STATE.get<UserState>(`betdata:${foundUser.email}`, 'json');
                const newState = normalizeState(fullUserData || { user: foundUser });
                
                newState.dialog = null;
                await setUserState(chatId, newState, env);
                await showMainMenu(update, env);
                return;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}\nПопробуйте еще раз.`, env);
    }
    await setUserState(chatId, state, env);
}


// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'ai_chat', step: 'ACTIVE', data: { history: [] } };
    const keyboard = makeKeyboard([[{ text: '🔚 Завершить сессию', callback_data: 'dialog_stop_ai' }]]);
    const message = await sendMessage(chatId, "🤖 AI-Аналитик к вашим услугам. Задайте свой вопрос или напишите /stop для выхода.", env, keyboard);
    dialog.messageId = message.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAiChatDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = getChatId(update);
    const dialog = state.dialog!;
    const userInput = getUserInput(update);

    if (!userInput) return;

    const stopCommands = ['/stop', 'dialog_stop_ai'];

    if (stopCommands.includes(userInput.toLowerCase())) {
        state.dialog = null;
        await setUserState(chatId, state, env);
        // We must construct a "fake" callback query if the user typed /stop,
        // so that showMainMenu knows which message to edit.
        const callbackMessage = isCallback(update) 
            ? update 
            : { 
                message: { message_id: dialog.messageId!, chat: { id: chatId } },
                data: CB.SHOW_MAIN_MENU 
            } as any;
        
        await editMessageText(chatId, dialog.messageId!, "🤖 Сессия с AI-Аналитиком завершена.", env);
        await showMainMenu(callbackMessage, env);
        return;
    }

    dialog.data.history.push({ role: 'user', text: userInput });
    
    await sendMessage(chatId, "🤖 Анализирую ваш запрос...", env);
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const contents = dialog.data.history.map((msg: Message) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
    }));
    
    try {
        const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents });
        const aiResponse = result.text;
        dialog.data.history.push({ role: 'model', text: aiResponse });
        await sendMessage(chatId, aiResponse, env);
    } catch (e) {
        await sendMessage(chatId, "Извините, произошла ошибка при обращении к AI.", env);
        console.error("AI Chat error:", e);
    }
    
    await setUserState(chatId, state, env);
}