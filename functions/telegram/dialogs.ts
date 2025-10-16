// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType } from './types';
import { setUserState } from './state';
import { editMessageText, sendMessage, reportError } from './telegramApi';
import { SPORTS, BOOKMAKERS, MARKETS_BY_SPORT } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { makeKeyboard, showMainMenu } from './ui';
import { GoogleGenAI } from '@google/genai';

// --- DIALOG ROUTER ---

export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (!state.dialog) return;
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    switch (state.dialog.type) {
        case 'add_bet':
            await continueAddBetDialog(update, state, env);
            break;
        case 'ai_chat':
            await continueAiChatDialog(update, state, env);
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
        id: `tg-${Date.now()}`,
        createdAt: new Date().toISOString(),
        event: generateEventString(betData.legs, betData.betType, betData.sport),
    };
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
    }
    
    const newState = { ...state };
    newState.bets = [newBet, ...state.bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (newBet.profit && newBet.profit !== 0) {
        const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
        const newBalance = newState.bankroll + newBet.profit;
        const newTransaction = {
            id: `tx-tg-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type,
            amount: newBet.profit,
            previousBalance: newState.bankroll,
            newBalance,
            description: `Ставка: ${newBet.event}`,
            betId: newBet.id
        };
        newState.bankroll = newBalance;
        newState.bankHistory = [newTransaction, ...newState.bankHistory];
    }
    
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
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
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
                    // FIX: Explicitly construct the bet data object for type safety, resolving issues with type inference on spread properties.
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
    }
    
    if (dialog.messageId) {
        await editMessageText(chatId, dialog.messageId, getAddBetDialogText(dialog.data), env, keyboard);
    }

    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

// --- AI CHAT DIALOG ---

export async function startAiChatDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'ai_chat', step: 'active', data: { history: [] } };
    const text = '🤖 AI-Аналитик слушает. О чем поговорим? Чтобы выйти, напишите /menu.';
    const sentMessage = await sendMessage(chatId, text, env);
    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

async function continueAiChatDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = 'message' in update ? update.message.chat.id : update.chat.id;
    if (!state.dialog || state.dialog.type !== 'ai_chat') return;

    const dialog = state.dialog;
    const userInput = 'text' in update ? update.text : '';

    if (!userInput || userInput.toLowerCase() === '/menu') {
        await sendMessage(chatId, "Возвращаю в главное меню.", env);
        state.dialog = null;
        await setUserState(chatId, state, env);
        await showMainMenu(update, env);
        return;
    }

    dialog.data.history.push({ role: 'user', parts: [{ text: userInput }] });

    await sendMessage(chatId, "⏳ AI-Аналитик думает...", env);

    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: dialog.data.history,
          config: { systemInstruction: "You are a helpful sports betting analyst. Keep your answers concise and helpful. Respond in Russian."}
        });

        const aiResponse = response.text;
        dialog.data.history.push({ role: 'model', parts: [{ text: aiResponse }] });

        await sendMessage(chatId, aiResponse, env);

        state.dialog = dialog;
        await setUserState(chatId, state, env);
    } catch (error) {
        await reportError(chatId, env, 'AI Chat Dialog', error);
        await sendMessage(chatId, "Произошла ошибка при обращении к AI. Попробуйте еще раз.", env);
    }
}
