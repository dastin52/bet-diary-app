// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType, User } from './types';
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, reportError } from './telegramApi';
import { BOOKMAKERS, SPORTS, MARKETS_BY_SPORT } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { makeKeyboard, showMainMenu, showLoginOptions } from './ui';
import { GoogleGenAI } from '@google/genai';
import * as userStore from '../data/userStore';

const mockHash = (password: string) => `hashed_${password}`;

// --- DIALOG ROUTER ---

export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update && "chat" in update.message ? update.message.chat.id : (update as TelegramMessage).chat.id;
    if (!state.dialog) return;
    
    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
            break;
        case 'register':
            await continueRegisterDialog(update, state, env);
            break;
        case 'login':
            await continueLoginDialog(update, state, env);
            break;
        default:
            console.error(`Unknown dialog type: ${state.dialog.type}`);
            state.dialog = null;
            await setUserState(chatId, state, env);
    }
}

// --- UTILITY FUNCTIONS ---

function addBetToState(state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState {
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

const paginateOptions = (options: string[], prefix: string, itemsPerRow: number) => {
    const keyboard = [];
    for (let i = 0; i < options.length; i += itemsPerRow) {
        const row = options.slice(i, i + itemsPerRow).map(option => ({
            text: option,
            callback_data: `${prefix}${option}`
        }));
        keyboard.push(row);
    }
    return keyboard;
};

// --- ADD BET DIALOG ---

const ADD_BET_STEPS = {
    SPORT: 'SPORT',
    TEAMS: 'TEAMS',
    MARKET: 'MARKET',
    STAKE: 'STAKE',
    ODDS: 'ODDS',
    BOOKMAKER: 'BOOKMAKER',
    CONFIRM: 'CONFIRM',
};

const getAddBetStepPrompt = (step: string, isIndividualSport: boolean): string => {
    const teamLabels = isIndividualSport ? 'Участник 1 - Участник 2' : 'Команда 1 - Команда 2';
    switch (step) {
        case ADD_BET_STEPS.SPORT: return '👇 Выберите вид спорта:';
        case ADD_BET_STEPS.TEAMS: return `Введите участников (например: \`${teamLabels}\`):`;
        case ADD_BET_STEPS.MARKET: return '👇 Выберите исход:';
        case ADD_BET_STEPS.STAKE: return 'Введите сумму ставки (например: `100`):';
        case ADD_BET_STEPS.ODDS: return 'Введите коэффициент (например: `1.85`):';
        case ADD_BET_STEPS.BOOKMAKER: return '👇 Выберите букмекера:';
        case ADD_BET_STEPS.CONFIRM: return 'Всё верно?';
        default: return '';
    }
};

function getAddBetDialogText(data: Dialog['data']): string {
    const isIndividualSport = ['Теннис', 'Бокс', 'ММА'].includes(data.sport);
    const teamsLabel = data.legs?.[0]?.homeTeam && data.legs?.[0]?.awayTeam
        ? `${data.legs[0].homeTeam} - ${data.legs[0].awayTeam}`
        : '_не указано_';
    const marketLabel = data.legs?.[0]?.market || '_не указано_';

    const summary = `*📝 Новая ставка*

- *Спорт:* ${data.sport || '_не указан_'}
- *Событие:* ${teamsLabel}
- *Исход:* ${marketLabel}
- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}
- *Коэф.:* ${data.odds || '_не указан_'}
- *Букмекер:* ${data.bookmaker || '_не указан_'}`;

    return `${summary}\n\n${getAddBetStepPrompt(data.step, isIndividualSport)}`;
}


export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: ADD_BET_STEPS.SPORT, data: {} };
    const keyboard = makeKeyboard(paginateOptions(SPORTS, 'dialog_sport_', 2));
    const sentMessage = await sendMessage(chatId, getAddBetDialogText(dialog.data), env, keyboard);
    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update && 'chat' in update.message ? update.message.chat.id : (update as TelegramMessage).chat.id;
    if (!state.dialog || state.dialog.type !== 'add_bet') return;

    const dialog = state.dialog;
    const userInput = 'data' in update ? update.data : 'text' in update ? update.text : '';

    try {
        if (userInput === 'dialog_cancel') {
            await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
            state.dialog = null;
            await setUserState(chatId, state, env);
            await showMainMenu(update, env);
            return;
        }

        switch (dialog.step) {
            case ADD_BET_STEPS.SPORT:
                if (!userInput?.startsWith('dialog_sport_')) return;
                dialog.data.sport = userInput.replace('dialog_sport_', '');
                dialog.step = ADD_BET_STEPS.TEAMS;
                break;
            case ADD_BET_STEPS.TEAMS:
                if (!userInput) return;
                const teams = userInput.split('-').map(t => t.trim());
                if (teams.length !== 2 || !teams[0] || !teams[1]) {
                    throw new Error("Неверный формат. Введите две команды, разделенные тире ( - ).");
                }
                dialog.data.legs = [{ homeTeam: teams[0], awayTeam: teams[1], market: '' }];
                dialog.step = ADD_BET_STEPS.MARKET;
                break;
            case ADD_BET_STEPS.MARKET:
                if (!userInput?.startsWith('dialog_market_')) return;
                dialog.data.legs[0].market = userInput.replace('dialog_market_', '');
                dialog.step = ADD_BET_STEPS.STAKE;
                break;
            case ADD_BET_STEPS.STAKE:
                const stake = parseFloat(userInput);
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма ставки должна быть числом больше 0.");
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
                    const finalBetData: Omit<Bet, 'id' | 'createdAt' | 'event'> = {
                        sport: dialog.data.sport,
                        legs: dialog.data.legs,
                        bookmaker: dialog.data.bookmaker,
                        stake: dialog.data.stake,
                        odds: dialog.data.odds,
                        betType: BetType.Single,
                        status: BetStatus.Pending,
                    };
                    const newState = addBetToState(state, finalBetData);
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка "${generateEventString(finalBetData.legs, finalBetData.betType, finalBetData.sport)}" успешно добавлена!`, env);
                    newState.dialog = null;
                    await setUserState(chatId, newState, env);
                    await showMainMenu(update, env);
                    return;
                }
                break;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }

    let keyboard;
    switch (dialog.step) {
        case ADD_BET_STEPS.MARKET:
            const markets = MARKETS_BY_SPORT[dialog.data.sport] || [];
            keyboard = makeKeyboard([...paginateOptions(markets, 'dialog_market_', 2), [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]);
            break;
        case ADD_BET_STEPS.BOOKMAKER:
            keyboard = makeKeyboard([...paginateOptions(BOOKMAKERS, 'dialog_bookie_', 2), [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]);
            break;
        case ADD_BET_STEPS.CONFIRM:
            keyboard = makeKeyboard([
                [{ text: '✅ Сохранить', callback_data: 'dialog_confirm' }],
                [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]
            ]);
            break;
        default:
             keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]]);
    }
    
    if (dialog.messageId) {
        await editMessageText(chatId, dialog.messageId, getAddBetDialogText(dialog.data), env, keyboard);
    }

    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- REGISTER & LOGIN DIALOGS ---

const REGISTER_STEPS = {
    NICKNAME: 'NICKNAME',
    EMAIL: 'EMAIL',
    PASSWORD: 'PASSWORD',
    CONFIRM: 'CONFIRM'
};

const LOGIN_STEPS = {
    EMAIL: 'EMAIL',
    PASSWORD: 'PASSWORD'
};

function getRegisterDialogText(data: Dialog['data']): string {
    const summary = `*📝 Регистрация нового аккаунта*

- *Никнейм:* ${data.nickname || '_не указан_'}
- *Email:* ${data.email || '_не указан_'}
- *Пароль:* ${data.password ? '******' : '_не указан_'}`;
    
    let prompt = '';
    switch (data.step) {
        case REGISTER_STEPS.NICKNAME:
            prompt = 'Придумайте и введите ваш никнейм (мин. 3 символа):';
            break;
        case REGISTER_STEPS.EMAIL:
            prompt = 'Введите ваш email:';
            break;
        case REGISTER_STEPS.PASSWORD:
            prompt = 'Придумайте пароль (мин. 6 символов):';
            break;
        case REGISTER_STEPS.CONFIRM:
            prompt = 'Всё верно?';
            break;
    }

    return `${summary}\n\n${prompt}`;
}

export async function startRegisterDialog(chatId: number, state: UserState, env: Env, messageIdToEdit?: number) {
    const dialog: Dialog = { type: 'register', step: REGISTER_STEPS.NICKNAME, data: {} };
    const text = getRegisterDialogText(dialog.data);
    const keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel_auth' }]]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
        dialog.messageId = messageIdToEdit;
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        dialog.messageId = sentMessage.result.message_id;
    }

    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueRegisterDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update && "chat" in update.message ? update.message.chat.id : (update as TelegramMessage).chat.id;
    if (!state.dialog || state.dialog.type !== 'register') return;

    const dialog = state.dialog;
    const userInput = 'data' in update ? update.data : 'text' in update ? update.text : '';

    try {
        if (userInput === 'dialog_cancel_auth') {
            await editMessageText(chatId, dialog.messageId!, "Регистрация отменена.", env);
            state.dialog = null;
            await setUserState(chatId, state, env);
            await showLoginOptions(update, env);
            return;
        }

        switch (dialog.step) {
            case REGISTER_STEPS.NICKNAME:
                if (!userInput || userInput.length < 3) throw new Error("Никнейм должен быть не менее 3 символов.");
                if (await userStore.findUserBy(u => u.nickname.toLowerCase() === userInput.toLowerCase(), env)) {
                    throw new Error("Этот никнейм уже занят.");
                }
                dialog.data.nickname = userInput;
                dialog.step = REGISTER_STEPS.EMAIL;
                break;
            case REGISTER_STEPS.EMAIL:
                if (!userInput || !userInput.includes('@') || !userInput.includes('.')) throw new Error("Пожалуйста, введите корректный email.");
                if (await userStore.findUserBy(u => u.email === userInput, env)) {
                    throw new Error("Пользователь с таким email уже существует.");
                }
                dialog.data.email = userInput;
                dialog.step = REGISTER_STEPS.PASSWORD;
                break;
            case REGISTER_STEPS.PASSWORD:
                if (!userInput || userInput.length < 6) throw new Error("Пароль должен быть не менее 6 символов.");
                dialog.data.password = userInput;
                dialog.step = REGISTER_STEPS.CONFIRM;
                break;
            case REGISTER_STEPS.CONFIRM:
                if (userInput === 'dialog_confirm_auth') {
                    const { nickname, email, password } = dialog.data;
                    const newUser: User = { 
                        email, 
                        nickname,
                        password_hash: mockHash(password),
                        registeredAt: new Date().toISOString(),
                        referralCode: `${nickname.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`,
                        buttercups: 0,
                        status: 'active',
                    };
                    await userStore.addUser(newUser, env);
                    
                    const newState = { ...normalizeState({ user: newUser }), dialog: null };
                    
                    await setUserState(chatId, newState, env);
                    await env.BOT_STATE.put(`betdata:${newUser.email}`, JSON.stringify(newState));

                    await editMessageText(chatId, dialog.messageId!, `✅ *Регистрация успешна!* \n\nДобро пожаловать, ${nickname}!`, env);
                    await showMainMenu(update, env);
                    return;
                }
                break;
        }

    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Ошибка'}. Попробуйте еще раз.`, env);
    }
    
    let keyboard;
    if (dialog.step === REGISTER_STEPS.CONFIRM) {
        keyboard = makeKeyboard([
            [{ text: '✅ Подтвердить', callback_data: 'dialog_confirm_auth' }],
            [{ text: '❌ Отмена', callback_data: 'dialog_cancel_auth' }]
        ]);
    } else {
        keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel_auth' }]]);
    }
    
    await editMessageText(chatId, dialog.messageId!, getRegisterDialogText(dialog.data), env, keyboard);
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

function getLoginDialogText(data: Dialog['data']): string {
    const summary = `*🔑 Вход в аккаунт*

- *Email:* ${data.email || '_не указан_'}
- *Пароль:* ${data.password ? '******' : '_не указан_'}`;
    
    let prompt = '';
    switch (data.step) {
        case LOGIN_STEPS.EMAIL:
            prompt = 'Введите ваш email:';
            break;
        case LOGIN_STEPS.PASSWORD:
            prompt = 'Введите ваш пароль:';
            break;
    }

    return `${summary}\n\n${prompt}`;
}

export async function startLoginDialog(chatId: number, state: UserState, env: Env, messageIdToEdit?: number) {
    const dialog: Dialog = { type: 'login', step: LOGIN_STEPS.EMAIL, data: {} };
    const text = getLoginDialogText(dialog.data);
    const keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel_auth' }]]);

    if (messageIdToEdit) {
        await editMessageText(chatId, messageIdToEdit, text, env, keyboard);
        dialog.messageId = messageIdToEdit;
    } else {
        const sentMessage = await sendMessage(chatId, text, env, keyboard);
        dialog.messageId = sentMessage.result.message_id;
    }

    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueLoginDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update && "chat" in update.message ? update.message.chat.id : (update as TelegramMessage).chat.id;
    if (!state.dialog || state.dialog.type !== 'login') return;

    const dialog = state.dialog;
    const userInput = 'text' in update ? update.text : 'data' in update ? update.data : '';

    try {
        if (userInput === 'dialog_cancel_auth') {
            await editMessageText(chatId, dialog.messageId!, "Вход отменен.", env);
            state.dialog = null;
            await setUserState(chatId, state, env);
            await showLoginOptions(update, env);
            return;
        }

        switch (dialog.step) {
            case LOGIN_STEPS.EMAIL:
                if (!userInput) return;
                dialog.data.email = userInput;
                dialog.step = LOGIN_STEPS.PASSWORD;
                break;
            case LOGIN_STEPS.PASSWORD:
                if (!userInput) return;
                const email = dialog.data.email;
                const password = userInput;
                const user = await userStore.findUserBy(u => u.email === email, env);
                
                if (user && user.password_hash === mockHash(password)) {
                    if (user.status === 'blocked') {
                        throw new Error('Этот аккаунт заблокирован.');
                    }
                    
                    const fullUserDataString = await env.BOT_STATE.get(`betdata:${user.email}`);
                    let freshState: UserState;

                    if (fullUserDataString) {
                        freshState = normalizeState(JSON.parse(fullUserDataString));
                    } else {
                        // If no betdata exists, create a fresh state for this user
                        freshState = normalizeState({ user });
                         // Also create the persistent record now
                        await env.BOT_STATE.put(`betdata:${user.email}`, JSON.stringify(freshState));
                        await sendMessage(chatId, "⚠️ Ваши данные о ставках не найдены на сервере. Создан новый профиль. Для полной синхронизации используйте код из веб-приложения.", env);
                    }
                    
                    freshState.dialog = null; 
                    await setUserState(chatId, freshState, env);

                    await editMessageText(chatId, dialog.messageId!, `✅ *Вход выполнен!* \n\nС возвращением, ${user.nickname}!`, env);
                    await showMainMenu(update, env);
                    return;
                } else {
                    throw new Error("Неверный email или пароль.");
                }
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Ошибка'}. Попробуйте еще раз.`, env);
        // Reset dialog to start on error
        dialog.step = LOGIN_STEPS.EMAIL;
        dialog.data = {};
    }
    
    const keyboard = makeKeyboard([[{ text: '❌ Отмена', callback_data: 'dialog_cancel_auth' }]]);
    await editMessageText(chatId, dialog.messageId!, getLoginDialogText(dialog.data), env, keyboard);
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'ai_chat', step: 'active', data: { history: [] } };
    const text = '🤖 AI-Аналитик слушает. О чем поговорим? Чтобы выйти, напишите `/menu` или `/start`.';
    const sentMessage = await sendMessage(chatId, text, env);
    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAiChatDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update && "chat" in update.message ? update.message.chat.id : (update as TelegramMessage).chat.id;
    if (!state.dialog || state.dialog.type !== 'ai_chat') return;

    const dialog = state.dialog;
    const userInput = 'text' in update ? update.text : '';

    // Global commands will be caught by the main handler, so we only need to handle text input here.
    if (!userInput) return;

    dialog.data.history.push({ role: 'user', parts: [{ text: userInput }] });

    const thinkingMessage = await sendMessage(chatId, "⏳ AI-Аналитик думает...", env);

    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: dialog.data.history,
          config: { systemInstruction: "You are a helpful sports betting analyst. Keep your answers concise and helpful. Respond in Russian."}
        });

        const aiResponse = response.text;
        dialog.data.history.push({ role: 'model', parts: [{ text: aiResponse }] });

        await editMessageText(chatId, thinkingMessage.result.message_id, aiResponse, env);

        state.dialog = dialog;
        await setUserState(chatId, state, env);
    } catch (error) {
        await reportError(chatId, env, 'AI Chat Dialog', error);
        await editMessageText(chatId, thinkingMessage.result.message_id, "Произошла ошибка при обращении к AI. Попробуйте еще раз.", env);
    }
}
