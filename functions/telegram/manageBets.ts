
// functions/telegram/manageBets.ts
import { TelegramCallbackQuery, UserState, Env, BetStatus } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { calculateProfit } from '../utils/betUtils';

const BETS_PER_PAGE = 5;

// Main router for this module
export async function showBetsList(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const data = callbackQuery.data;

    // Sub-routing based on callback data prefix
    if (data.startsWith('bet_view_')) {
        await showBetDetail(callbackQuery, state, env);
    } else if (data.startsWith('bet_status_prompt_')) {
        await showStatusSelector(callbackQuery, state, env);
    } else if (data.startsWith('bet_status_set_')) {
        await updateBetStatus(callbackQuery, state, env);
    } else { // Default to showing the list (handles initial call and pagination)
        await renderBetsList(callbackQuery, state, env);
    }
}

async function renderBetsList(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    let page = 0;
    const pageMatch = data.match(/bets_page_(\d+)/) || data.match(/bets_back_(\d+)/);
    if (pageMatch) {
        page = parseInt(pageMatch[1], 10);
    }

    const startIndex = page * BETS_PER_PAGE;
    const endIndex = startIndex + BETS_PER_PAGE;
    const userBets = state.bets;
    const pagedBets = userBets.slice(startIndex, endIndex);
    const totalPages = Math.ceil(userBets.length / BETS_PER_PAGE) || 1;

    const text = `*📈 Управление ставками (Стр. ${page + 1} / ${totalPages})*`;
    
    const keyboardRows = pagedBets.map(bet => {
        const statusIcon = { [BetStatus.Pending]: '⏳', [BetStatus.Won]: '✅', [BetStatus.Lost]: '❌', [BetStatus.Void]: '↩️', [BetStatus.CashedOut]: '💰' }[bet.status] || '❔';
        return [{ text: `${statusIcon} ${bet.event}`, callback_data: CB.VIEW_BET(bet.id) }];
    });

    const navRow = [];
    if (page > 0) {
        navRow.push({ text: '⬅️ Назад', callback_data: CB.BETS_PAGE(page - 1) });
    }
    if (endIndex < userBets.length) {
        navRow.push({ text: 'Вперед ➡️', callback_data: CB.BETS_PAGE(page + 1) });
    }

    if (navRow.length > 0) keyboardRows.push(navRow);
    keyboardRows.push([{ text: 'Главное меню', callback_data: CB.BACK_TO_MENU }]);

    await editMessageText(chatId, messageId, text, env, makeKeyboard(keyboardRows));
}


async function showBetDetail(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const betId = callbackQuery.data.replace('bet_view_', '');
    
    const pageMatch = state.dialog?.data?.page;
    const page = pageMatch ? parseInt(pageMatch, 10) : 0;

    const bet = state.bets.find(b => b.id === betId);
    if (!bet) return await editMessageText(chatId, messageId, "Ставка не найдена.", env);

    const profitText = bet.status !== BetStatus.Pending ? `*Прибыль/Убыток:* ${bet.profit?.toFixed(2) || '0.00'} ₽` : '';
    
    const text = `*Детали ставки:*
    
*Событие:* ${bet.event}
*Спорт:* ${bet.sport}
*Сумма:* ${bet.stake.toFixed(2)} ₽
*Коэф.:* ${bet.odds.toFixed(2)}
*Статус:* ${bet.status}
${profitText}
*Дата:* ${new Date(bet.createdAt).toLocaleString('ru-RU')}`;
    
    const keyboard = makeKeyboard([
        [{ text: '🔄 Изменить статус', callback_data: CB.SET_STATUS_PROMPT(bet.id) }],
        [{ text: '⬅️ Назад к списку', callback_data: CB.BETS_PAGE(page) }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}


async function showStatusSelector(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const betId = callbackQuery.data.replace('bet_status_prompt_', '');

    const bet = state.bets.find(b => b.id === betId);
    if (!bet) return await editMessageText(chatId, messageId, "Ставка не найдена.", env);

    const text = `Выберите новый статус для ставки: *${bet.event}*`;
    const keyboard = makeKeyboard([
        [
            { text: '✅ Выигрыш', callback_data: CB.SET_STATUS(bet.id, BetStatus.Won) },
            { text: '❌ Проигрыш', callback_data: CB.SET_STATUS(bet.id, BetStatus.Lost) }
        ],
        [
            { text: '↩️ Возврат', callback_data: CB.SET_STATUS(bet.id, BetStatus.Void) },
             { text: '⏳ В ожидании', callback_data: CB.SET_STATUS(bet.id, BetStatus.Pending) }
        ],
         [{ text: '⬅️ Назад к детали', callback_data: CB.VIEW_BET(bet.id) }]
    ]);
     await editMessageText(chatId, messageId, text, env, keyboard);
}


async function updateBetStatus(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const chatId = callbackQuery.message.chat.id;
    const parts = callbackQuery.data.replace('bet_status_set_', '').split('_');
    const betId = parts[0];
    const newStatus = parts[1] as BetStatus;
    
    const betIndex = state.bets.findIndex(b => b.id === betId);
    if (betIndex === -1) return;

    const bet = state.bets[betIndex];
    bet.status = newStatus;
    bet.profit = calculateProfit(bet);
    
    await setUserState(chatId, state, env);
    if (state.user) {
        await env.BOT_STATE.put(`betdata:${state.user.email}`, JSON.stringify(state));
    }
    
    // Pass a modified callbackQuery to go back to the detail view
    const modifiedCallbackQuery = { ...callbackQuery, data: CB.VIEW_BET(betId) };
    await showBetDetail(modifiedCallbackQuery, state, env);
}
