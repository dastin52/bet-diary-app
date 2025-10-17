// functions/telegram/dialogs.ts
// FIX: File content implemented. This file manages multi-step conversations (dialogs).

import { Bet, BetStatus, BetType, DialogState, Env, TelegramMessage, UserState, TelegramCallbackQuery, BankTransactionType } from './types';
import { setUserState } from './state';
import { editMessageText, sendMessage } from './telegramApi';
import { BOOKMAKERS, SPORTS, BET_TYPE_OPTIONS } from '../constants';
import { calculateProfit, generateEventString } from '../utils/betUtils';

/**
 * This function replicates the bet creation logic from the `useBets` hook,
 * including calculating profit and creating a bank history transaction.
 * @param state The current user state.
 * @param betData The data for the new bet collected from the dialog.
 * @returns The updated user state.
 */
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

const makeKeyboard = (options: { text: string, callback_data: string }[][]) => ({ inline_keyboard: options });

const STEPS = {
    SPORT: 'SPORT', EVENT: 'EVENT', BET_TYPE: 'BET_TYPE',
    STAKE: 'STAKE', ODDS: 'ODDS', BOOKMAKER: 'BOOKMAKER', CONFIRM: 'CONFIRM',
};

const getDialogText = (data: DialogState['data']): string => `*📝 Новая ставка*

- *Спорт:* ${data.sport || '_не указан_'}
- *Событие:* ${data.event || '_не указано_'}
- *Тип:* ${data.betType ? BET_TYPE_OPTIONS.find(o => o.value === data.betType)?.label : '_не указан_'}
- *Сумма:* ${data.stake ? `${data.stake} ₽` : '_не указана_'}
- *Коэф.:* ${data.odds || '_не указан_'}
- *Букмекер:* ${data.bookmaker || '_не указан_'}
    
${getStepPrompt(data.step)}`;

const getStepPrompt = (step: string): string => {
    switch(step) {
        case STEPS.SPORT: return '👇 Выберите вид спорта:';
        case STEPS.EVENT: return 'Введите событие в формате: *Команда 1 - Команда 2, Исход* (например: `Реал Мадрид - Барселона, П1`)';
        case STEPS.BET_TYPE: return '👇 Выберите тип ставки:';
        case STEPS.STAKE: return 'Введите сумму ставки (например: `100` или `150.50`)';
        case STEPS.ODDS: return 'Введите коэффициент (например: `1.85`)';
        case STEPS.BOOKMAKER: return '👇 Выберите букмекера:';
        case STEPS.CONFIRM: return 'Всё верно?';
        default: return '';
    }
};

export async function startAddBetDialog(chatId: number, state: UserState, env: Env) {
    const dialog: DialogState = { step: STEPS.SPORT, data: {} };

    const keyboard = makeKeyboard([
        SPORTS.slice(0, 4).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
        SPORTS.slice(4, 8).map(s => ({ text: s, callback_data: `dialog_sport_${s}` })),
    ]);
    const sentMessage = await sendMessage(chatId, getDialogText(dialog), env, keyboard);

    dialog.messageId = sentMessage.result.message_id;
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}

export async function continueAddBetDialog(update: TelegramMessage | TelegramCallbackQuery, state: UserState, env: Env) {
    // FIX: Correctly determine chatId based on the type of 'update'.
    const chatId = "message" in update ? ("chat" in update.message ? update.message.chat.id : 0) : update.from.id;
    const dialog = state.dialog!;
    
    // FIX: Correctly get user input based on the type of 'update'.
    const userInput = 'data' in update ? update.data : 'text' in update ? update.text : '';

    try {
        switch (dialog.step) {
            case STEPS.SPORT:
                if (!userInput?.startsWith('dialog_sport_')) return;
                dialog.data.sport = userInput.replace('dialog_sport_', '');
                dialog.step = STEPS.EVENT;
                break;
            case STEPS.EVENT:
                if (!userInput) return;
                const parts = userInput.split(',').map(p => p.trim());
                if (parts.length !== 2) throw new Error("Неверный формат. Используйте: `Команда 1 - Команда 2, Исход`");
                const teams = parts[0].split('-').map(t => t.trim());
                if (teams.length !== 2) throw new Error("Неверный формат команд. Используйте `-` для разделения.");
                dialog.data.event = userInput;
                dialog.data.legs = [{ homeTeam: teams[0], awayTeam: teams[1], market: parts[1] }];
                dialog.step = STEPS.BET_TYPE;
                break;
            case STEPS.BET_TYPE:
                if (!userInput?.startsWith('dialog_bettype_')) return;
                dialog.data.betType = userInput.replace('dialog_bettype_', '');
                dialog.step = STEPS.STAKE;
                break;
            case STEPS.STAKE:
                if (!userInput) return;
                const stake = parseFloat(userInput);
                if (isNaN(stake) || stake <= 0) throw new Error("Сумма ставки должна быть положительным числом.");
                dialog.data.stake = stake;
                dialog.step = STEPS.ODDS;
                break;
            case STEPS.ODDS:
                if (!userInput) return;
                const odds = parseFloat(userInput);
                if (isNaN(odds) || odds <= 1) throw new Error("Коэффициент должен быть числом больше 1.");
                dialog.data.odds = odds;
                dialog.step = STEPS.BOOKMAKER;
                break;
            case STEPS.BOOKMAKER:
                if (!userInput?.startsWith('dialog_bookie_')) return;
                dialog.data.bookmaker = userInput.replace('dialog_bookie_', '');
                dialog.step = STEPS.CONFIRM;
                break;
            case STEPS.CONFIRM:
                if (userInput === 'dialog_confirm') {
                    const finalBetData = { ...dialog.data, status: BetStatus.Pending };
                    const newState = addBetToState(state, finalBetData as Omit<Bet, 'id'|'createdAt'|'event'>);
                    await editMessageText(chatId, dialog.messageId!, `✅ Ставка на "${dialog.data.event}" успешно добавлена!`, env);
                    newState.dialog = null;
                    await setUserState(chatId, newState, env);
                    return;
                } else if (userInput === 'dialog_cancel') {
                    await editMessageText(chatId, dialog.messageId!, "❌ Добавление ставки отменено.", env);
                    state.dialog = null;
                    await setUserState(chatId, state, env);
                    return;
                }
                return;
        }
    } catch (error) {
        await sendMessage(chatId, `⚠️ ${error instanceof Error ? error.message : 'Произошла ошибка.'}`, env);
    }

    let keyboard;
    switch(dialog.step) {
        case STEPS.BET_TYPE:
            keyboard = makeKeyboard([BET_TYPE_OPTIONS.filter(o => o.value !== BetType.System).map(o => ({ text: o.label, callback_data: `dialog_bettype_${o.value}`}))]);
            break;
        case STEPS.BOOKMAKER:
             keyboard = makeKeyboard([
                BOOKMAKERS.slice(0, 3).map(b => ({ text: b, callback_data: `dialog_bookie_${b}`})),
                BOOKMAKERS.slice(3, 6).map(b => ({ text: b, callback_data: `dialog_bookie_${b}`})),
                [{ text: 'Другое', callback_data: 'dialog_bookie_Другое' }]
             ]);
            break;
        case STEPS.CONFIRM:
            keyboard = makeKeyboard([
                [{ text: '✅ Сохранить', callback_data: 'dialog_confirm'}, { text: '❌ Отмена', callback_data: 'dialog_cancel'}]
            ]);
            break;
    }

    await editMessageText(chatId, dialog.messageId!, getDialogText(dialog), env, keyboard);
    state.dialog = dialog;
    await setUserState(chatId, state, env);
}