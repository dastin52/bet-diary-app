import { TelegramCallbackQuery, UserState, Env, BetStatus, BankTransactionType, Bet } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { setUserState } from './state';
import { calculateProfit } from '../utils/betUtils';

const BETS_PER_PAGE = 5;

// --- UTILITY ---
// This function cleanly handles all financial state updates related to a bet change.
function applyBetUpdateToState(
    state: UserState,
    betId: string,
    updates: Partial<Bet>,
    profitChange: number,
    transactionType: BankTransactionType,
    description: string
): UserState {
    const newState = { ...state };
    let betUpdated = false;

    // 1. Update the bet in the bets array
    newState.bets = newState.bets.map(b => {
        if (b.id === betId) {
            betUpdated = true;
            return { ...b, ...updates };
        }
        return b;
    });
    
    // If for some reason the bet wasn't found, abort.
    if (!betUpdated) return state;

    // 2. Update bankroll and create transaction if needed
    if (profitChange !== 0) {
        const newBalance = newState.bankroll + profitChange;
        const newTransaction = {
            id: new Date().toISOString() + Math.random(),
            timestamp: new Date().toISOString(),
            type: transactionType,
            amount: profitChange,
            previousBalance: newState.bankroll,
            newBalance,
            description,
            betId,
        };
        newState.bankHistory = [newTransaction, ...newState.bankHistory];
        newState.bankroll = newBalance;
    }

    return newState;
}


// --- MAIN ROUTER for this module ---

export async function manageBets(update: TelegramCallbackQuery, state: UserState, env: Env) {
    const data = update.data;
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;

    if (data.startsWith(CB.VIEW_BET)) {
        const [, betId, page] = data.split('|');
        await viewBetDetail(chatId, messageId, state, betId, parseInt(page, 10), env);
    } else if (data.startsWith(CB.SET_STATUS_PROMPT)) {
        const [, betId, page] = data.split('|');
        await showStatusSelector(chatId, messageId, state, betId, parseInt(page, 10), env);
    } else if (data.startsWith(CB.SET_STATUS)) {
        const [, betId, page, newStatus] = data.split('|');
        await setBetStatus(chatId, messageId, state, betId, parseInt(page, 10), newStatus as BetStatus, env);
    } else if (data.startsWith(CB.DELETE_PROMPT)) {
        const [, betId, page] = data.split('|');
        await showDeleteConfirmation(chatId, messageId, betId, parseInt(page, 10), env);
    } else if (data.startsWith(CB.DELETE_CONFIRM)) {
        const [, betId] = data.split('|');
        await deleteBet(chatId, messageId, state, betId, env);
    }
    else {
        let page = 0;
        if (data.includes('|')) {
            page = parseInt(data.split('|')[1], 10) || 0;
        }
        await listBets(chatId, messageId, state, page, env);
    }
}


// --- VIEW FUNCTIONS (UI Rendering) ---

async function listBets(chatId: number, messageId: number, state: UserState, page: number, env: Env) {
    const sortedBets = [...state.bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    if (sortedBets.length === 0) {
        await editMessageText(chatId, messageId, "У вас пока нет ставок.", env, makeKeyboard([[{ text: '⬅️ В меню', callback_data: CB.BACK_TO_MAIN }]]));
        return;
    }

    const totalPages = Math.ceil(sortedBets.length / BETS_PER_PAGE);
    page = Math.max(0, Math.min(page, totalPages - 1)); // Clamp page number
    const startIndex = page * BETS_PER_PAGE;
    const betsToShow = sortedBets.slice(startIndex, startIndex + BETS_PER_PAGE);

    let text = `*📈 Ваши ставки (Страница ${page + 1}/${totalPages})*`;

    const betButtons = betsToShow.map(bet => {
        const statusIcon = { [BetStatus.Won]: '✅', [BetStatus.Lost]: '❌', [BetStatus.Pending]: '⏳', [BetStatus.Void]: '⚪️', [BetStatus.CashedOut]: '💰' }[bet.status];
        const eventText = bet.event.length > 40 ? `${bet.event.substring(0, 37)}...` : bet.event;
        return [{ text: `${statusIcon} ${eventText}`, callback_data: `${CB.VIEW_BET}|${bet.id}|${page}` }];
    });
    
    const navButtons = [];
    if (page > 0) navButtons.push({ text: '⬅️ Назад', callback_data: `${CB.LIST_BETS}|${page - 1}` });
    if (page < totalPages - 1) navButtons.push({ text: 'Вперед ➡️', callback_data: `${CB.LIST_BETS}|${page + 1}` });

    const keyboard = makeKeyboard([
        ...betButtons,
        navButtons,
        [{ text: '⬅️ В главное меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}


async function viewBetDetail(chatId: number, messageId: number, state: UserState, betId: string, page: number, env: Env) {
    const bet = state.bets.find(b => b.id === betId);
    if (!bet) {
        await editMessageText(chatId, messageId, "Ставка не найдена.", env, makeKeyboard([[{ text: '⬅️ К списку', callback_data: `${CB.LIST_BETS}|${page}` }]]));
        return;
    }

    const statusLabel = { [BetStatus.Won]: 'Выигрыш', [BetStatus.Lost]: 'Проигрыш', [BetStatus.Pending]: 'В ожидании', [BetStatus.Void]: 'Возврат', [BetStatus.CashedOut]: 'Кэшаут' }[bet.status];
    const profitText = bet.profit !== undefined && bet.status !== BetStatus.Pending ? `*Прибыль/Убыток:* ${bet.profit > 0 ? '+' : ''}${bet.profit.toFixed(2)} ₽` : '';

    const text = `*📋 Детали ставки*

*Событие:* \`${bet.event}\`
*Спорт:* ${bet.sport}
*Дата:* ${new Date(bet.createdAt).toLocaleString('ru-RU')}
*Сумма:* ${bet.stake.toFixed(2)} ₽
*Коэф.:* ${bet.odds.toFixed(2)}
*Статус:* ${statusLabel}
${profitText}`;

    const actionButton = bet.status === BetStatus.Pending
        ? { text: '🔄 Изменить статус', callback_data: `${CB.SET_STATUS_PROMPT}|${bet.id}|${page}` }
        : { text: '🔄 Отменить результат', callback_data: `${CB.SET_STATUS}|${bet.id}|${page}|${BetStatus.Pending}` };
        
    const keyboard = makeKeyboard([
        [actionButton, { text: '🗑️ Удалить', callback_data: `${CB.DELETE_PROMPT}|${bet.id}|${page}` }],
        [{ text: '⬅️ Назад к списку', callback_data: `${CB.LIST_BETS}|${page}` }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showStatusSelector(chatId: number, messageId: number, state: UserState, betId: string, page: number, env: Env) {
    const text = "Выберите новый статус для ставки:";
    const keyboard = makeKeyboard([
        [
            { text: '✅ Выигрыш', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Won}` },
            { text: '❌ Проигрыш', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Lost}` },
        ],
        [
            { text: '⚪️ Возврат', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Void}` },
            { text: '💰 Кэшаут', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.CashedOut}` }, // Note: Cashout profit needs manual input, not supported here yet.
        ],
        [{ text: '⬅️ Назад к детализации', callback_data: `${CB.VIEW_BET}|${betId}|${page}` }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showDeleteConfirmation(chatId: number, messageId: number, betId: string, page: number, env: Env) {
    const text = "Вы уверены, что хотите удалить эту ставку? Это действие необратимо.";
    const keyboard = makeKeyboard([
        [{ text: '🗑️ Да, удалить', callback_data: `${CB.DELETE_CONFIRM}|${betId}` }],
        [{ text: '⬅️ Нет, назад', callback_data: `${CB.VIEW_BET}|${betId}|${page}` }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

// --- ACTION FUNCTIONS (State Modification) ---

async function setBetStatus(chatId: number, messageId: number, state: UserState, betId: string, page: number, newStatus: BetStatus, env: Env) {
    const originalBet = state.bets.find(b => b.id === betId);
    if (!originalBet) {
        await editMessageText(chatId, messageId, "Ставка не найдена.", env, makeKeyboard([[{ text: '⬅️ К списку', callback_data: `${CB.LIST_BETS}|${page}` }]]));
        return;
    }

    const wasSettled = originalBet.status !== BetStatus.Pending;
    const originalProfit = wasSettled ? (originalBet.profit ?? calculateProfit(originalBet)) : 0;

    const updatedBetPartial = { ...originalBet, status: newStatus };
    const newProfit = calculateProfit(updatedBetPartial);
    const profitChange = newProfit - originalProfit;
    
    let transactionType: BankTransactionType;
    let description: string;

    if (newStatus === BetStatus.Pending) {
        transactionType = BankTransactionType.Correction;
        description = `Отмена расчета: ${originalBet.event}`;
    } else {
        transactionType = profitChange > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
        if (newStatus === BetStatus.Void) transactionType = BankTransactionType.BetVoid;
        description = `Ставка рассчитана: ${originalBet.event}`;
    }

    const newState = applyBetUpdateToState(state, betId, { status: newStatus, profit: newProfit }, profitChange, transactionType, description);
    
    await setUserState(chatId, newState, env);
    if (newState.user) {
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
    }
    
    // Refresh the view with the new state
    await viewBetDetail(chatId, messageId, newState, betId, page, env);
}

async function deleteBet(chatId: number, messageId: number, state: UserState, betId: string, env: Env) {
    const betToDelete = state.bets.find(b => b.id === betId);
    if (!betToDelete) {
        await editMessageText(chatId, messageId, "Ставка уже удалена.", env);
        return;
    }

    // 1. Reverse financial impact if the bet was settled
    const profitToReverse = betToDelete.profit ?? 0;
    let newState = state;

    if (betToDelete.status !== BetStatus.Pending && profitToReverse !== 0) {
        newState = applyBetUpdateToState(
            state,
            betId,
            {}, // No bet updates, we're about to delete it
            -profitToReverse,
            BankTransactionType.Correction,
            `Удаление ставки: ${betToDelete.event}`
        );
    }
    
    // 2. Filter out the bet
    newState.bets = newState.bets.filter(b => b.id !== betId);

    await setUserState(chatId, newState, env);
    if (newState.user) {
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
    }

    // Go back to the list view after deletion
    await listBets(chatId, messageId, newState, 0, env);
}
