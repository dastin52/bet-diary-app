// functions/telegram/dialogs.ts
import { Bet, BetStatus, BetType, Dialog, Env, TelegramCallbackQuery, TelegramMessage, UserState, BankTransactionType } from './types';
import { setUserState, normalizeState } from './state';
import { editMessageText, sendMessage, deleteMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS, MARKETS_BY_SPORT } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';
import { showMainMenu } from './commands';
import * as userStore from '../data/userStore'; // Assuming userStore is adapted for serverless

// --- DIALOG STATE MANAGEMENT ---
const updateDialogState = (state: UserState, dialog: Dialog | null): UserState => ({ ...state, dialog });

const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });


// --- DIALOG ROUTER ---
export async function continueDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    if (!state.dialog) return;

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
            // AI chat is handled separately
            break;
    }
}


// --- BET CREATION LOGIC (Adapted from useBets hook) ---
function addBetToState(state: UserState, betData: Omit<Bet, 'id' | 'createdAt' | 'event'>): UserState {
    // ... (Implementation from previous thoughts)
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

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: Dialog = { type: 'add_bet', step: 'bet_type', data: { legs: [] }, messageId: 0 };
    const text = getAddBetDialogText(dialog);
    const keyboard = { inline_keyboard: [[{ text: 'Одиночная', callback_data: 'dialog_action:single' }, { text: 'Экспресс', callback_data: 'dialog_action:parlay' }], [{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] };
    const sentMessage = await sendMessage(chatId, text, env, keyboard);
    dialog.messageId = sentMessage.result.message_id;
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = "message" in update ? update.message.chat.id : update.chat.id;
    let dialog = state.dialog as Dialog;
    const action = 'data' in update ? update.data : '';
    const textInput = 'text' in update ? update.text : '';

    try {
        if (action === 'dialog_action:cancel') {
            await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
            await showMainMenu(chatId, "Главное меню", env);
            await deleteMessage(chatId, dialog.messageId!, env);
            await setUserState(chatId, updateDialogState(state, null), env);
            return;
        }

        // Logic for each step...
        switch (dialog.step) {
            case 'bet_type':
                dialog.data.betType = action.split(':')[1];
                dialog.step = 'sport';
                break;
            // ... other cases
            case 'sport':
                dialog.data.sport = action.split(':')[1];
                dialog.step = dialog.data.betType === 'parlay' ? 'parlay_leg' : 'single_leg';
                break;
            case 'single_leg':
                 const [teams, market] = (textInput || '').split(',').map(s => s.trim());
                 const [home, away] = teams.split('-').map(s => s.trim());
                 if (!home || !away || !market) throw new Error("Неверный формат. Нужно: Команда 1 - Команда 2, Исход");
                 dialog.data.legs = [{ homeTeam: home, awayTeam: away, market }];
                 dialog.step = 'stake';
                 break;
             case 'stake':
                 const stake = parseFloat(textInput || '');
                 if (isNaN(stake) || stake <= 0) throw new Error("Сумма должна быть положительным числом.");
                 dialog.data.stake = stake;
                 dialog.step = 'odds';
                 break;
            case 'odds':
                const odds = parseFloat(textInput || '');
                if (isNaN(odds) || odds <= 1) throw new Error("Коэф. должен быть числом > 1.");
                dialog.data.odds = odds;
                dialog.step = 'confirm';
                break;
            case 'confirm':
                if (action === 'dialog_action:confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending, bookmaker: 'Telegram' };
                    const newState = addBetToState(state, finalBetData as any);
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка успешно добавлена!`, env);
                    await showMainMenu(chatId, "Главное меню", env);
                    await deleteMessage(chatId, dialog.messageId!, env);
                    await setUserState(chatId, updateDialogState(newState, null), env);
                    return;
                }
                break;
            // Parlay specific steps
            case 'parlay_leg':
                const [p_teams, p_market] = (textInput || '').split(',').map(s => s.trim());
                const [p_home, p_away] = p_teams.split('-').map(s => s.trim());
                if (!p_home || !p_away || !p_market) throw new Error("Неверный формат. Нужно: Команда 1 - Команда 2, Исход");
                dialog.data.legs.push({ homeTeam: p_home, awayTeam: p_away, market: p_market });
                dialog.step = 'parlay_next';
                break;
            case 'parlay_next':
                if(action === 'dialog_action:add_more') dialog.step = 'parlay_leg';
                else dialog.step = 'stake';
                break;
        }

    } catch (e) {
        await sendMessage(chatId, `⚠️ ${e instanceof Error ? e.message : 'Ошибка'}`, env);
    }
    
    // Update message with new prompt and keyboard
    const text = getAddBetDialogText(dialog);
    const keyboard = getAddBetKeyboard(dialog);
    await editMessageText(chatId, dialog.messageId!, text, env, keyboard);
    await setUserState(chatId, updateDialogState(state, dialog), env);
}

// --- UI GENERATORS for Add Bet ---
function getAddBetDialogText(dialog: Dialog): string {
    const { step, data } = dialog;
    let text = "*➕ Новая ставка*\n\n";

    if (data.betType) text += `*Тип:* ${data.betType === 'parlay' ? 'Экспресс' : 'Одиночная'}\n`;
    if (data.sport) text += `*Спорт:* ${data.sport}\n`;
    if (data.legs.length > 0) {
        text += "*События:*\n";
        data.legs.forEach((l: any, i: number) => {
            text += `  ${i + 1}. ${l.homeTeam} - ${l.awayTeam}, ${l.market}\n`;
        });
    }
    if (data.stake) text += `*Сумма:* ${data.stake} ₽\n`;
    if (data.odds) text += `*Коэф.:* ${data.odds}\n`;
    
    text += "\n";

    switch(step) {
        case 'bet_type': text += "👇 Выберите тип ставки:"; break;
        case 'sport': text += "👇 Выберите вид спорта:"; break;
        case 'single_leg': text += "Введите событие и исход (Команда 1 - Команда 2, Исход):"; break;
        case 'parlay_leg': text += `Введите событие #${data.legs.length + 1} и исход:`; break;
        case 'parlay_next': text += "Добавить еще событие в экспресс?"; break;
        case 'stake': text += "Введите сумму ставки:"; break;
        case 'odds': text += "Введите общий коэффициент:"; break;
        case 'confirm': text += "Все верно?"; break;
    }
    return text;
}

function getAddBetKeyboard(dialog: Dialog) {
    const { step, data } = dialog;
    switch(step) {
        case 'sport':
            const sportsRows = [];
            for (let i = 0; i < SPORTS.length; i += 4) {
                sportsRows.push(SPORTS.slice(i, i + 4).map(s => ({ text: s, callback_data: `dialog_action:${s}` })));
            }
            return { inline_keyboard: [...sportsRows, [{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] };
        case 'parlay_next':
             return { inline_keyboard: [[{ text: '➕ Да, добавить', callback_data: 'dialog_action:add_more' }, { text: '✅ Нет, продолжить', callback_data: 'dialog_action:continue' }],[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] };
        case 'confirm':
            return { inline_keyboard: [[{ text: '✅ Сохранить', callback_data: 'dialog_action:confirm' }, { text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] };
        default:
            return { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'dialog_action:cancel' }]] };
    }
}


// --- REGISTER DIALOG ---
export async function startRegisterDialog(chatId: number, state: UserState, env: Env, messageId: number) { /* ... */ }
export async function continueRegisterDialog(message: TelegramMessage, state: UserState, env: Env) { /* ... */ }

// --- LOGIN DIALOG ---
export async function startLoginDialog(chatId: number, state: UserState, env: Env, messageId: number) { /* ... */ }
export async function continueLoginDialog(message: TelegramMessage, state: UserState, env: Env) { /* ... */ }
