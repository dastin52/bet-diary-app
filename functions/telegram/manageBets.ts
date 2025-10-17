// functions/telegram/manageBets.ts

import { TelegramCallbackQuery, UserState, Env, BetStatus } from './types';
import { editMessageText } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';

const BETS_PER_PAGE = 5;

/**
 * Main router for the bet management section.
 * It delegates to list view or detail view based on callback data.
 * @param update The incoming callback query.
 * @param state The current user state.
 * @param env The Cloudflare environment.
 */
export async function manageBets(update: TelegramCallbackQuery, state: UserState, env: Env) {
    const data = update.data;
    const chatId = update.message.chat.id;
    const messageId = update.message.message_id;

    if (data.startsWith(CB.VIEW_BET)) {
        const betId = data.split(':')[1];
        await viewBetDetail(chatId, messageId, state, betId, env);
    } else {
        // Default to list view (handles CB.MANAGE_BETS, CB.LIST_BETS, pagination)
        let page = 0;
        if (data.startsWith(CB.NEXT_PAGE) || data.startsWith(CB.PREV_PAGE)) {
            page = parseInt(data.split(':')[1], 10);
        }
        await listBets(chatId, messageId, state, page, env);
    }
}

/**
 * Renders a paginated list of the user's bets.
 * @param chatId The chat ID.
 * @param messageId The message ID to edit.
 * @param state The current user state.
 * @param page The page number to display (0-indexed).
 * @param env The Cloudflare environment.
 */
async function listBets(chatId: number, messageId: number, state: UserState, page: number, env: Env) {
    if (!state.bets || state.bets.length === 0) {
        await editMessageText(chatId, messageId, "У вас пока нет ставок. Добавьте первую с помощью главного меню.", env, makeKeyboard([[{ text: '⬅️ Назад в меню', callback_data: CB.BACK_TO_MAIN }]]));
        return;
    }

    const sortedBets = [...state.bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const totalPages = Math.ceil(sortedBets.length / BETS_PER_PAGE);
    const startIndex = page * BETS_PER_PAGE;
    const betsToShow = sortedBets.slice(startIndex, startIndex + BETS_PER_PAGE);

    let text = `*📈 Ваши ставки (Страница ${page + 1}/${totalPages})*\n\nНажмите на ставку для просмотра деталей.`;

    const betButtons = betsToShow.map(bet => {
        const date = new Date(bet.createdAt).toLocaleDateString('ru-RU');
        const profit = bet.profit !== undefined ? (bet.profit > 0 ? `+${bet.profit.toFixed(2)}` : `${bet.profit.toFixed(2)}`) : '...';
        const statusIcon = { [BetStatus.Won]: '✅', [BetStatus.Lost]: '❌', [BetStatus.Pending]: '⏳', [BetStatus.Void]: '⚪️', [BetStatus.CashedOut]: '💰' }[bet.status];
        
        // Truncate long event names for button text
        const eventText = bet.event.length > 35 ? `${bet.event.substring(0, 32)}...` : bet.event;
        return [{ text: `${statusIcon} ${date} | ${eventText}`, callback_data: `${CB.VIEW_BET}:${bet.id}` }];
    });
    
    const navButtons = [];
    if (page > 0) {
        navButtons.push({ text: '⬅️ Пред.', callback_data: `${CB.PREV_PAGE}:${page - 1}` });
    }
    if (page < totalPages - 1) {
        navButtons.push({ text: 'След. ➡️', callback_data: `${CB.NEXT_PAGE}:${page + 1}` });
    }

    const keyboard = makeKeyboard([
        ...betButtons,
        navButtons,
        [{ text: '⬅️ Назад в меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}

/**
 * Renders the details of a single bet.
 * @param chatId The chat ID.
 * @param messageId The message ID to edit.
 * @param state The current user state.
 * @param betId The ID of the bet to view.
 * @param env The Cloudflare environment.
 */
async function viewBetDetail(chatId: number, messageId: number, state: UserState, betId: string, env: Env) {
    const bet = state.bets.find(b => b.id === betId);
    if (!bet) {
        await editMessageText(chatId, messageId, "Ставка не найдена.", env, makeKeyboard([[{ text: '⬅️ К списку', callback_data: CB.LIST_BETS }]]));
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

    const keyboard = makeKeyboard([
        // Edit/Delete buttons can be added here in the future.
        [{ text: '⬅️ К списку ставок', callback_data: CB.LIST_BETS }]
    ]);

    await editMessageText(chatId, messageId, text, env, keyboard);
}
