// functions/telegram/manageBets.ts
import { TelegramCallbackQuery, UserState, Env, BetStatus, BankTransactionType, Bet } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB, buildManageCb, MANAGE_ACTIONS } from './router';
import { setUserState } from './state';
import { calculateProfit } from '../utils/betUtils';

const BETS_PER_PAGE = 5;

// --- UTILITY ---
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

    newState.bets = newState.bets.map(b => {
        if (b.id === betId) {
            betUpdated = true;
            return { ...b, ...updates };
        }
        return b;
    });
    
    if (!betUpdated) return state;

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
    
    // Entry point from main menu
    if (data === CB.MANAGE_BETS) {
        await listBets(chatId, messageId, state, 0, env);
        return;
    }
    
    const parts = data.split('|');
    const command = parts[1];
    const args = parts.slice(2);

    switch(command) {
        case MANAGE_ACTIONS.LIST:
            await listBets(chatId, messageId, state, parseInt(args[0] || '0', 10), env);
            break;
        case MANAGE_ACTIONS.VIEW:
            await viewBetDetail(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), env);
            break;
        case MANAGE_ACTIONS.PROMPT_STATUS:
            await showStatusSelector(chatId, messageId, args[0], parseInt(args[1] || '0', 10), env);
            break;
        case MANAGE_ACTIONS.SET_STATUS:
            await setBetStatus(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), args[2] as BetStatus, env);
            break;
        case MANAGE_ACTIONS.PROMPT_DELETE:
            await showDeleteConfirmation(chatId, messageId, args[0], parseInt(args[1] || '0', 10), env);
            break;
        case MANAGE_ACTIONS.CONFIRM_DELETE:
            await deleteBet(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), env);
            break;
        default:
             await listBets(chatId, messageId, state, 0, env);
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
    page = Math.max(0, Math.min(page, totalPages - 1));
    const startIndex = page * BETS_PER_PAGE;
    const betsToShow = sortedBets.slice(startIndex, startIndex + BETS_PER_PAGE);

    let text = `*📈 Управление ставками (Стр. ${page + 1}/${totalPages})*`;

    const betButtons = betsToShow.map(bet => {
        const statusIcon = { [BetStatus.Won]: '✅', [BetStatus.Lost]: '❌', [BetStatus.Pending]: '⏳', [BetStatus.Void]: '⚪️', [BetStatus.CashedOut]: '💰' }[bet.status];
        const eventText = bet.event.length > 40 ? `${bet.event.substring(0, 37)}...` : bet.event;
        return [{ text: `${statusIcon} ${eventText}`, callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, bet.id, page) }];
    });
    
    const navButtons = [];
    if (page > 0) navButtons.push({ text: '⬅️ Назад', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page - 1) });
    if (page < totalPages - 1) navButtons.push({ text: 'Вперед ➡️', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page + 1) });

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
        await editMessageText(chatId, messageId, "Ставка не найдена.", env, makeKeyboard([[{ text: '⬅️ К списку', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page) }]]));
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
        ? { text: '🔄 Статус', callback_data: buildManageCb(MANAGE_ACTIONS.PROMPT_STATUS, bet.id, page) }
        : { text: '🔄 Отменить', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, bet.id, page, BetStatus.Pending) };
        
    const keyboard = makeKeyboard([
        [actionButton, { text: '🗑️ Удалить', callback_data: buildManageCb(MANAGE_ACTIONS.PROMPT_DELETE, bet.id, page) }],
        [{ text: '⬅️ К списку', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page) }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showStatusSelector(chatId: number, messageId: number, betId: string, page: number, env: Env) {
    const text = "Выберите новый статус для ставки:";
    const keyboard = makeKeyboard([
        [
            { text: '✅ Выигрыш', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, page, BetStatus.Won) },
            { text: '❌ Проигрыш', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, page, BetStatus.Lost) },
        ],
        [
            { text: '⚪️ Возврат', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, page, BetStatus.Void) },
            { text: '💰 Кэшаут', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, page, BetStatus.CashedOut) },
        ],
        [{ text: '⬅️ Назад', callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, betId, page) }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showDeleteConfirmation(chatId: number, messageId: number, betId: string, page: number, env: Env) {
    const text = "Вы уверены, что хотите удалить эту ставку? Это действие необратимо.";
    const keyboard = makeKeyboard([
        [{ text: '🗑️ Да, удалить', callback_data: buildManageCb(MANAGE_ACTIONS.CONFIRM_DELETE, betId, page) }],
        [{ text: '⬅️ Нет, назад', callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, betId, page) }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

// --- ACTION FUNCTIONS (State Modification) ---

async function setBetStatus(chatId: number, messageId: number, state: UserState, betId: string, page: number, newStatus: BetStatus, env: Env) {
    const originalBet = state.bets.find(b => b.id === betId);
    if (!originalBet) {
        await editMessageText(chatId, messageId, "Ставка не найдена.", env, makeKeyboard([[{ text: '⬅️ К списку', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page) }]]));
        return;
    }

    // Handle cashed out separately as it needs manual profit input
    if (newStatus === BetStatus.CashedOut) {
        // In a real scenario, you'd start another dialog step here to ask for the cashout amount.
        // For simplicity, we'll just mark it as void for now.
        await editMessageText(chatId, messageId, "Функция Кэшаут требует ручного ввода суммы в веб-версии. Здесь она будет обработана как Возврат.", env);
        newStatus = BetStatus.Void; // Fallback
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
    
    // Return to the list view after status update
    await listBets(chatId, messageId, newState, page, env);
}

async function deleteBet(chatId: number, messageId: number, state: UserState, betId: string, page: number, env: Env) {
    const betToDelete = state.bets.find(b => b.id === betId);
    if (!betToDelete) {
        await editMessageText(chatId, messageId, "Ставка уже удалена.", env);
        return;
    }

    const profitToReverse = betToDelete.profit ?? 0;
    let newState = state;

    if (betToDelete.status !== BetStatus.Pending && profitToReverse !== 0) {
        newState = applyBetUpdateToState(
            state,
            betId,
            {},
            -profitToReverse,
            BankTransactionType.Correction,
            `Удаление ставки: ${betToDelete.event}`
        );
    }
    
    newState.bets = newState.bets.filter(b => b.id !== betId);

    await setUserState(chatId, newState, env);
    if (newState.user) {
        await env.BOT_STATE.put(`betdata:${newState.user.email}`, JSON.stringify(newState));
    }

    await listBets(chatId, messageId, newState, page, env);
}
