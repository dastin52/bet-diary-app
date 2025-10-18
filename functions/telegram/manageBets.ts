// functions/telegram/manageBets.ts
import { TelegramCallbackQuery, UserState, Env, Bet, BetStatus, BankTransactionType, TelegramUpdate } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { updateAndSyncState } from './state';
import { calculateProfit } from '../utils/betUtils';

export const MANAGE_PREFIX = 'm|';
const BETS_PER_PAGE = 5;

// FIX: Define actions and callback builder locally as they are not exported from router.
export const MANAGE_ACTIONS = {
    LIST: 'list',
    VIEW: 'view',
    PROMPT_STATUS: 'p_status',
    SET_STATUS: 's_status',
    PROMPT_DELETE: 'p_del',
    CONFIRM_DELETE: 'c_del',
};
export const buildManageCb = (action: string, ...args: (string | number)[]): string => `${MANAGE_PREFIX}${action}|${args.join('|')}`;

function updateBetInState(state: UserState, betId: string, updates: Partial<Bet>): UserState {
    const newState = { ...state };
    const betIndex = newState.bets.findIndex(b => b.id === betId);
    if (betIndex === -1) return state;

    const originalBet = newState.bets[betIndex];
    const wasSettled = originalBet.status !== BetStatus.Pending;
    const originalProfit = wasSettled ? (originalBet.profit ?? calculateProfit(originalBet)) : 0;

    const updatedBet = { ...originalBet, ...updates };

    const isNowSettled = updatedBet.status !== BetStatus.Pending;
    if (updatedBet.status !== BetStatus.CashedOut) {
        updatedBet.profit = calculateProfit(updatedBet);
    }
    const newProfit = isNowSettled ? (updatedBet.profit ?? 0) : 0;
    
    const profitChange = newProfit - originalProfit;

    if (profitChange !== 0) {
        let type: BankTransactionType;
        let description = '';
        switch (updatedBet.status) {
            case BetStatus.Won: type = BankTransactionType.BetWin; description = `Выигрыш: ${updatedBet.event}`; break;
            case BetStatus.Lost: type = BankTransactionType.BetLoss; description = `Проигрыш: ${updatedBet.event}`; break;
            case BetStatus.Void: type = BankTransactionType.BetVoid; description = `Возврат: ${updatedBet.event}`; break;
            default: type = BankTransactionType.Correction; description = `Корректировка: ${updatedBet.event}`; break;
        }
        
        const newBalance = newState.bankroll + profitChange;
        const newTransaction = {
            id: new Date().toISOString() + Math.random(),
            timestamp: new Date().toISOString(),
            type,
            amount: profitChange,
            previousBalance: newState.bankroll,
            newBalance,
            description,
            betId,
        };
        newState.bankHistory = [newTransaction, ...newState.bankHistory];
        newState.bankroll = newBalance;
    }

    newState.bets[betIndex] = updatedBet;
    newState.bets.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return newState;
}

function deleteBetFromState(state: UserState, betId: string): UserState {
    const newState = { ...state };
    const betToDelete = newState.bets.find(b => b.id === betId);
    if (!betToDelete) return state;

    if (betToDelete.status !== BetStatus.Pending) {
        const profitToReverse = betToDelete.profit ?? 0;
        if (profitToReverse !== 0) {
             const newBalance = newState.bankroll - profitToReverse;
             const newTransaction = {
                id: new Date().toISOString() + Math.random(),
                timestamp: new Date().toISOString(),
                type: BankTransactionType.Correction as BankTransactionType,
                amount: -profitToReverse,
                previousBalance: newState.bankroll,
                newBalance,
                description: `Отмена (удаление ставки): ${betToDelete.event}`,
                betId,
             };
             newState.bankHistory = [newTransaction, ...newState.bankHistory];
             newState.bankroll = newBalance;
        }
    }
    newState.bets = newState.bets.filter(bet => bet.id !== betId);
    return newState;
}

const getStatusEmoji = (status: BetStatus): string => {
    switch (status) {
        case BetStatus.Won: return '✅';
        case BetStatus.Lost: return '❌';
        case BetStatus.Pending: return '⏳';
        case BetStatus.Void: return '🔄';
        case BetStatus.CashedOut: return '💰';
        default: return '';
    }
};

export async function startManageBets(update: TelegramUpdate, state: UserState, env: Env) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;

    // FIX: Construct a fake TelegramUpdate to pass to manageBets, as it expects the full update object.
    const fakeCallbackQuery: TelegramCallbackQuery = {
        id: update.callback_query?.id || `fake_id_${Date.now()}`,
        from: message.from!,
        message: message,
        data: buildManageCb(MANAGE_ACTIONS.LIST, 0)
    };
    const fakeUpdate: TelegramUpdate = {
        update_id: update.update_id,
        callback_query: fakeCallbackQuery,
    };
    await manageBets(fakeUpdate, state, env);
}

// FIX: Changed signature to accept TelegramUpdate to resolve type error and standardize handlers.
export async function manageBets(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;

    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const [_, action, ...args] = callbackQuery.data.split('|');
    
    const page = parseInt(args[args.length - 1]) || 0;

    switch (action) {
        case MANAGE_ACTIONS.VIEW: {
            const betId = args[0];
            const bet = state.bets.find(b => b.id === betId);
            if (!bet) {
                await editMessageText(chatId, messageId, "Ставка не найдена.", env);
                return;
            }
            
            const profitText = bet.status !== BetStatus.Pending ? `*Прибыль/Убыток:* ${bet.profit?.toFixed(2) ?? 0} ₽` : '';
            const text = `*Детали ставки*
            
*Событие:* ${bet.event}
*Спорт:* ${bet.sport}
*Сумма:* ${bet.stake.toFixed(2)} ₽
*Коэф.:* ${bet.odds.toFixed(2)}
*Статус:* ${getStatusEmoji(bet.status)} ${bet.status}
${profitText}
*Дата:* ${new Date(bet.createdAt).toLocaleString('ru-RU')}`;
            
            const keyboard = makeKeyboard([
                [
                    { text: '📊 Изменить статус', callback_data: buildManageCb(MANAGE_ACTIONS.PROMPT_STATUS, betId, page) },
                    { text: '🗑️ Удалить', callback_data: buildManageCb(MANAGE_ACTIONS.PROMPT_DELETE, betId, page) }
                ],
                [{ text: '◀️ Назад к списку', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, page) }]
            ]);
            await editMessageText(chatId, messageId, text, env, keyboard);
            break;
        }

        case MANAGE_ACTIONS.PROMPT_STATUS: {
            const betId = args[0];
            const text = "Выберите новый статус для ставки:";
            const keyboard = makeKeyboard([
                [
                    { text: '✅ Выигрыш', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, BetStatus.Won, page) },
                    { text: '❌ Проигрыш', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, BetStatus.Lost, page) },
                ],
                [
                    { text: '🔄 Возврат', callback_data: buildManageCb(MANAGE_ACTIONS.SET_STATUS, betId, BetStatus.Void, page) }
                ],
                [{ text: '◀️ Назад к ставке', callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, betId, page) }]
            ]);
            await editMessageText(chatId, messageId, text, env, keyboard);
            break;
        }
        
        case MANAGE_ACTIONS.SET_STATUS: {
            const [betId, newStatus] = args;
            const newState = updateBetInState(state, betId, { status: newStatus as BetStatus });
            await updateAndSyncState(chatId, newState, env);
            
            await sendMessage(chatId, `Статус ставки обновлен на *${newStatus}*!`, env);
            
            const newCallbackQuery = { ...callbackQuery, data: buildManageCb(MANAGE_ACTIONS.LIST, page) };
            // FIX: Construct a new update object for recursive call, as the function now expects a TelegramUpdate.
            const newUpdate: TelegramUpdate = { ...update, callback_query: newCallbackQuery };
            await manageBets(newUpdate, newState, env);
            break;
        }

        case MANAGE_ACTIONS.PROMPT_DELETE: {
            const betId = args[0];
            const text = "Вы уверены, что хотите удалить эту ставку? Это действие необратимо.";
            const keyboard = makeKeyboard([
                [
                    { text: '🗑️ Да, удалить', callback_data: buildManageCb(MANAGE_ACTIONS.CONFIRM_DELETE, betId, page) },
                ],
                [{ text: '◀️ Отмена', callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, betId, page) }]
            ]);
            await editMessageText(chatId, messageId, text, env, keyboard);
            break;
        }

        case MANAGE_ACTIONS.CONFIRM_DELETE: {
            const betId = args[0];
            const newState = deleteBetFromState(state, betId);
            await updateAndSyncState(chatId, newState, env);
            
            await sendMessage(chatId, "Ставка успешно удалена.", env);
            
            const newPage = page > 0 && newState.bets.length <= page * BETS_PER_PAGE ? page - 1 : page;
            const newCallbackQuery = { ...callbackQuery, data: buildManageCb(MANAGE_ACTIONS.LIST, newPage) };
            // FIX: Construct a new update object for recursive call, as the function now expects a TelegramUpdate.
            const newUpdate: TelegramUpdate = { ...update, callback_query: newCallbackQuery };
            await manageBets(newUpdate, newState, env);
            break;
        }
        
        case MANAGE_ACTIONS.LIST:
        default: {
            const totalBets = state.bets.length;
            if (totalBets === 0) {
                // FIX: Removed circular dependency on router.ts by using string literal.
                await editMessageText(chatId, messageId, "У вас пока нет ставок для управления.", env, makeKeyboard([[{text: '◀️ Главное меню', callback_data: 'back_to_main'}]]));
                return;
            }

            const totalPages = Math.ceil(totalBets / BETS_PER_PAGE);
            const currentPage = Math.max(0, Math.min(page, totalPages - 1));
            
            const start = currentPage * BETS_PER_PAGE;
            const end = start + BETS_PER_PAGE;
            const betsOnPage = state.bets.slice(start, end);

            const betButtons = betsOnPage.map(bet => {
                const label = `${getStatusEmoji(bet.status)} ${bet.event.substring(0, 30)}...`;
                return [{ text: label, callback_data: buildManageCb(MANAGE_ACTIONS.VIEW, bet.id, currentPage) }];
            });

            const navButtons = [];
            if (currentPage > 0) navButtons.push({ text: '⬅️ Пред.', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, currentPage - 1)});
            if (currentPage < totalPages - 1) navButtons.push({ text: 'След. ➡️', callback_data: buildManageCb(MANAGE_ACTIONS.LIST, currentPage + 1)});

            if(navButtons.length > 0) {
                betButtons.push(navButtons);
            }

            const keyboard = makeKeyboard([
                ...betButtons,
                // FIX: Removed circular dependency on router.ts by using string literal.
                [{ text: '◀️ Главное меню', callback_data: 'back_to_main' }]
            ]);
            
            const text = `*📈 Управление ставками* (Стр. ${currentPage + 1}/${totalPages})`;
            await editMessageText(chatId, messageId, text, env, keyboard);
            break;
        }
    }
}
