// functions/telegram/dialogs.ts
import {
    Bet, BetStatus, BetType, Dialog, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType,
    User, Message, BetLeg
} from './types';
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS, COMMON_ODDS, MARKETS_BY_SPORT } from '../constants';
import { calculateProfit, generateEventString, calculateRiskManagedStake } from '../utils/betUtils';
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
    BET_TYPE: 'BET_TYPE',
    SPORT: 'SPORT',
    EVENT: 'EVENT',
    MARKET: 'MARKET',
    PARLAY_CONFIRM_LEG: 'PARLAY_CONFIRM_LEG',
    STAKE: 'STAKE',
    ODDS: 'ODDS',
    BOOKMAKER: 'BOOKMAKER',
    CONFIRM: 'CONFIRM',
};

const getAddBetDialogText = (dialog: Dialog, state: UserState): string => {
    const { data, step } = dialog;
    const betTypeLabel = data.betType ? (data.betType === BetType.Single ? 'Одиночная' : 'Экспресс') : '_не указан_';

    let eventDetails = '';
    if (data.legs && data.legs.length > 0) {
        if (data.betType === BetType.Single) {
            const leg = data.legs[0];
            eventDetails = `- *Событие:* ${leg.homeTeam} - ${leg.awayTeam}\n- *Исход:* ${leg.market}`;
        } else {
            // FIX: Removed `leg.sport` as it does not exist on BetLeg and is inconsistent with the data model.
            eventDetails = data.legs.map((leg: BetLeg, i: number) => `  *${i+1}.* ${leg.homeTeam} - ${leg.awayTeam} (*${leg.market}*)`).join('\n');
            eventDetails = `- *События в экспрессе:*\n${eventDetails}`;
        }
    }

    const sportText = data.sport ? `- *Спорт:* ${data.sport}\n` : '';

    const text = `*📝 Новая ставка*

- *Тип:* ${betTypeLabel}
${sportText}${eventDetails}
- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}
- *Коэф.:* ${data.odds || '_не указан_'}
- *Букмекер:* ${data.bookmaker || '_не указан_'}

---
*${getAddBetStepPrompt(step, data, state)}*`;
    
    return text;
};

const getAddBetStepPrompt = (step: string, data: Dialog['data'], state: UserState): string => {
    switch(step) {
        case ADD_BET_STEPS.BET_TYPE: return '👇 Выберите тип ставки:';
        // FIX: Changed prompt to ask for sport once for the whole parlay.
        case ADD_BET_STEPS.SPORT: return data.betType === BetType.Parlay ? '👇 Выберите спорт для всего экспресса:' : '👇 Выберите вид спорта:';
        case ADD_BET_STEPS.EVENT: return 'Введите участников в формате: Команда 1 - Команда 2';
        case ADD_BET_STEPS.MARKET: return '👇 Выберите исход:';
        case ADD_BET_STEPS.PARLAY_CONFIRM_LEG: return `Событие #${data.legs.length} добавлено. Добавить еще одно?`;
        case ADD_BET_STEPS.STAKE:
             const rec = calculateRiskManagedStake(state.bankroll, 2.0); // Use avg odds for recommendation
             return `Введите сумму ставки (например: 100 или 150.50).\n💡 Рекомендуемая сумма: ${rec ? `${rec.stake.toFixed(2)} ₽` : 'недоступно'}`;
        case ADD_BET_STEPS.ODDS: return 'Введите общий коэффициент (например: 1.85) или выберите из популярных:';
        case ADD_BET_STEPS.BOOKMAKER: return '👇 Выберите букмекера:';
        case ADD_BET_STEPS.CONFIRM: return 'Всё верно?';
        default: return '';
    }
};

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: ADD_BET_STEPS.BET_TYPE, data: {} };
    const keyboard = makeKeyboard([
        [{ text: 'Одиночная', callback_data: `dialog_bettype_${BetType.Single}` }, { text: 'Экспресс', callback_data: `dialog_bettype_${BetType.Parlay}` }],
        [{ text: '❌ Отмена', callback_data: 'dialog_cancel' }]
    ]);
    const sentMessage = await sendMessage(chatId, getAddBetDialogText(dialog, state), env, keyboard);
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

    let errorOccurred = false;
    try {
        switch (dialog.step) {
            case ADD_BET_STEPS.BET_TYPE:
                if (!userInput?.startsWith('dialog_bettype_')) return;
                dialog.data.betType = userInput.replace('dialog_bettype_', '');
                dialog.data.legs = [];
                dialog.step = ADD_BET_STEPS.SPORT;
                break;

            case ADD_BET_STEPS.SPORT:
                if (!userInput?.startsWith('dialog_sport_')) return;
                // FIX: Set sport for the entire bet, not just a leg.
                dialog.data.sport = userInput.replace('dialog_sport_', '');
                dialog.data.currentLeg = {}; // Initialize empty leg for the first event
                dialog.step = ADD_BET_STEPS.EVENT;
                break;

            case ADD_BET_STEPS.EVENT:
                const teams = userInput.split('-').map(t => t.trim());
                if (teams.length !== 2 || !teams[0] || !teams[1]) throw new Error("Неверный формат. Используйте: `Команда 1 - Команда 2`");
                dialog.data.currentLeg.homeTeam = teams[0];
                dialog.data.currentLeg.awayTeam = teams[1];
                dialog.step = ADD_BET_STEPS.MARKET;
                break;
            
            case ADD_BET_STEPS.MARKET:
                if (!userInput?.startsWith('dialog_market_')) return;
                dialog.data.currentLeg.market = userInput.replace('dialog_market_', '');
                dialog.data.legs.push(dialog.data.currentLeg);
                delete dialog.data.currentLeg;
                if (dialog.data.betType === BetType.Single) {
                    dialog.step = ADD_BET_STEPS.STAKE;
                } else {
                    dialog.step = ADD_BET_STEPS.PARLAY_CONFIRM_LEG;
                }
                break;

            case ADD_BET_STEPS.PARLAY_CONFIRM_LEG:
                if (userInput === 'dialog_parlay_add') {
                    // FIX: Go to EVENT for the next leg, reusing the already-set sport.
                    dialog.data.currentLeg = {}; // Prepare for a new leg
                    dialog.step = ADD_BET_STEPS.EVENT; 
                } else if (userInput === 'dialog_parlay_finish') {
                    dialog.step = ADD_BET_STEPS.STAKE;
                }
                break;

            case ADD_BET_STEPS.STAKE:
                let stake = 0;
                if (userInput.startsWith('dialog_stake_rec_')) {
                    stake = parseFloat(userInput.replace('dialog_stake_rec_', ''));
                } else {
                    stake = parseFloat(userInput);
                }
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма ставки должна быть положительным числом.");
                dialog.data.stake = stake;
                dialog.step = ADD_BET_STEPS.ODDS;
                break;

            case ADD_BET_STEPS.ODDS:
                let odds = 0;
                if (userInput.startsWith('dialog_odds_')) {
                    odds = parseFloat(userInput.replace('dialog_odds_', ''));
                } else {
                    odds = parseFloat(userInput);
                }
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
                    // FIX: Correctly cast the final data. `sport` is now present.
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending };
                    const newState = addBetToState(state, finalBetData as Omit<Bet, 'id'|'createdAt'|'event'>);
                    newState.dialog = null;
                    await setUserState(chatId, newState, env);
                    if (newState.user) {
                        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
                    }
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка успешно добавлена!`, env);
                    await showMainMenu(update, env);
                    return;
                }
                return;
        }
    } catch (error) {
        errorOccurred = true;
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
    }
    
    if (errorOccurred) {
        // Don't update the dialog state on error, let the user retry the current step
        await setUserState(chatId, state, env);
        return;
    }

    // --- Keyboards for next step ---
    let keyboard;
    const cancelBtn = { text: '❌ Отмена', callback_data: 'dialog_cancel' };
    switch(dialog.step) {
        case ADD_BET_STEPS.SPORT:
            keyboard = makeKeyboard([
                SPORTS.slice(0, 4).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
                SPORTS.slice(4, 8).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
                [cancelBtn]
            ]);
            break;
        case ADD_BET_STEPS.MARKET:
            // FIX: Use `dialog.data.sport` which is now reliably set for the whole bet.
            const markets = MARKETS_BY_SPORT[dialog.data.sport] || [];
            // Chunk markets into rows of 3
            const marketRows = markets.reduce< {text: string, callback_data: string}[][]>((acc, market, i) => {
                const chunkIndex = Math.floor(i/3);
                if(!acc[chunkIndex]) acc[chunkIndex] = [];
                acc[chunkIndex].push({text: market, callback_data: `dialog_market_${market}`});
                return acc;
            }, []);
            keyboard = makeKeyboard([...marketRows, [cancelBtn]]);
            break;
        case ADD_BET_STEPS.PARLAY_CONFIRM_LEG:
            keyboard = makeKeyboard([
                [{ text: '➕ Добавить еще', callback_data: 'dialog_parlay_add' }],
                [{ text: '🏁 Закончить и ввести сумму', callback_data: 'dialog_parlay_finish' }],
                [cancelBtn]
            ]);
            break;
        case ADD_BET_STEPS.STAKE:
            const rec = calculateRiskManagedStake(state.bankroll, 2.0);
            const recBtn = rec ? { text: `💡 Исп. ${rec.stake.toFixed(2)} ₽`, callback_data: `dialog_stake_rec_${rec.stake.toFixed(2)}` } : null;
            keyboard = makeKeyboard(recBtn ? [[recBtn], [cancelBtn]] : [[cancelBtn]]);
            break;
        case ADD_BET_STEPS.ODDS:
            const oddsRows = COMMON_ODDS.reduce<number[][]>((acc, odd, i) => {
                 const chunkIndex = Math.floor(i/3);
                 if(!acc[chunkIndex]) acc[chunkIndex] = [];
                 acc[chunkIndex].push(odd);
                 return acc;
            }, []).map(row => row.map(odd => ({ text: String(odd), callback_data: `dialog_odds_${odd}` })));
            keyboard = makeKeyboard([...oddsRows, [cancelBtn]]);
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
                [{ text: '✅ Сохранить', callback_data: 'dialog_confirm'}, cancelBtn]
            ]);
            break;
        default:
             keyboard = makeKeyboard([ [cancelBtn] ]);
    }

    await editMessageText(chatId, dialog.messageId!, getAddBetDialogText(dialog, state), env, keyboard);
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
        await editMessageText(chatId, dialog.messageId!, "🤖 Сессия с AI-Аналитиком завершена.", env);
        await showMainMenu(update, env);
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