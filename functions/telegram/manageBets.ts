// functions/telegram/manageBets.ts
import { TelegramCallbackQuery, UserState, Env, BetStatus, BankTransactionType, Bet } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
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
    const [command, ...args] = data.split('|');

    switch(command) {
        case CB.MANAGE_BETS:
        // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
        case CB.LIST_BETS:
            await listBets(chatId, messageId, state, parseInt(args[0] || '0', 10), env);
            break;
        // FIX: Replaced CB.MANAGE_VIEW with CB.VIEW_BET
        case CB.VIEW_BET:
            await viewBetDetail(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), env);
            break;
        // FIX: Replaced CB.MANAGE_SET_STATUS_PROMPT with CB.SET_STATUS_PROMPT
        case CB.SET_STATUS_PROMPT:
            await showStatusSelector(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), env);
            break;
        // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
        case CB.SET_STATUS:
            await setBetStatus(chatId, messageId, state, args[0], parseInt(args[1] || '0', 10), args[2] as BetStatus, env);
            break;
        // FIX: Replaced CB.MANAGE_DELETE_PROMPT with CB.DELETE_PROMPT
        case CB.DELETE_PROMPT:
            await showDeleteConfirmation(chatId, messageId, args[0], parseInt(args[1] || '0', 10), env);
            break;
        // FIX: Replaced CB.MANAGE_DELETE_CONFIRM with CB.DELETE_CONFIRM
        case CB.DELETE_CONFIRM:
            await deleteBet(chatId, messageId, state, args[0], env);
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

    let text = `*📈 Ваши ставки (Страница ${page + 1}/${totalPages})*`;

    const betButtons = betsToShow.map(bet => {
        const statusIcon = { [BetStatus.Won]: '✅', [BetStatus.Lost]: '❌', [BetStatus.Pending]: '⏳', [BetStatus.Void]: '⚪️', [BetStatus.CashedOut]: '💰' }[bet.status];
        const eventText = bet.event.length > 40 ? `${bet.event.substring(0, 37)}...` : bet.event;
        // FIX: Replaced CB.MANAGE_VIEW with CB.VIEW_BET
        return [{ text: `${statusIcon} ${eventText}`, callback_data: `${CB.VIEW_BET}|${bet.id}|${page}` }];
    });
    
    const navButtons = [];
    // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
    if (page > 0) navButtons.push({ text: '⬅️ Назад', callback_data: `${CB.LIST_BETS}|${page - 1}` });
    // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
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
        // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
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
        // FIX: Replaced CB.MANAGE_SET_STATUS_PROMPT with CB.SET_STATUS_PROMPT
        ? { text: '🔄 Статус', callback_data: `${CB.SET_STATUS_PROMPT}|${bet.id}|${page}` }
        // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
        : { text: '🔄 Отменить', callback_data: `${CB.SET_STATUS}|${bet.id}|${page}|${BetStatus.Pending}` };
        
    const keyboard = makeKeyboard([
        // FIX: Replaced CB.MANAGE_DELETE_PROMPT with CB.DELETE_PROMPT
        [actionButton, { text: '🗑️ Удалить', callback_data: `${CB.DELETE_PROMPT}|${bet.id}|${page}` }],
        // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
        [{ text: '⬅️ К списку', callback_data: `${CB.LIST_BETS}|${page}` }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showStatusSelector(chatId: number, messageId: number, state: UserState, betId: string, page: number, env: Env) {
    const text = "Выберите новый статус для ставки:";
    const keyboard = makeKeyboard([
        [
            // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
            { text: '✅ Выигрыш', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Won}` },
            // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
            { text: '❌ Проигрыш', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Lost}` },
        ],
        [
            // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
            { text: '⚪️ Возврат', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.Void}` },
            // FIX: Replaced CB.MANAGE_SET_STATUS with CB.SET_STATUS
            { text: '💰 Кэшаут', callback_data: `${CB.SET_STATUS}|${betId}|${page}|${BetStatus.CashedOut}` },
        ],
        // FIX: Replaced CB.MANAGE_VIEW with CB.VIEW_BET
        [{ text: '⬅️ Назад', callback_data: `${CB.VIEW_BET}|${betId}|${page}` }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

async function showDeleteConfirmation(chatId: number, messageId: number, betId: string, page: number, env: Env) {
    const text = "Вы уверены, что хотите удалить эту ставку? Это действие необратимо.";
    const keyboard = makeKeyboard([
        // FIX: Replaced CB.MANAGE_DELETE_CONFIRM with CB.DELETE_CONFIRM
        [{ text: '🗑️ Да, удалить', callback_data: `${CB.DELETE_CONFIRM}|${betId}` }],
        // FIX: Replaced CB.MANAGE_VIEW with CB.VIEW_BET
        [{ text: '⬅️ Нет, назад', callback_data: `${CB.VIEW_BET}|${betId}|${page}` }]
    ]);
    await editMessageText(chatId, messageId, text, env, keyboard);
}

// --- ACTION FUNCTIONS (State Modification) ---

async function setBetStatus(chatId: number, messageId: number, state: UserState, betId: string, page: number, newStatus: BetStatus, env: Env) {
    const originalBet = state.bets.find(b => b.id === betId);
    if (!originalBet) {
        // FIX: Replaced CB.MANAGE_LIST with CB.LIST_BETS
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
    
    await viewBetDetail(chatId, messageId, newState, betId, page, env);
}

async function deleteBet(chatId: number, messageId: number, state: UserState, betId: string, env: Env) {
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

    await listBets(chatId, messageId, newState, 0, env);
}
