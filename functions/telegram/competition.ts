// functions/telegram/competition.ts
import { TelegramCallbackQuery, TelegramUpdate, UserState, Env, CompetitionParticipant } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { getUsers } from '../data/userStore';
import { generateLeaderboards } from './competitionData';
import { CB } from './router';

export const COMP_PREFIX = 'c|';
type Period = 'week' | 'month' | 'all_time';
type Board = 'roi' | 'top_winners' | 'most_active';

const buildCompCb = (board: Board, period: Period) => `${COMP_PREFIX}${board}|${period}`;

function formatLeaderboardText(board: CompetitionParticipant[], title: string, currentUserEmail?: string): string {
    let text = `🏆 *${title}*\n\n`;
    if (board.length === 0) {
        return text + "_Пока нет данных для этой таблицы лидеров._";
    }

    const top = board.slice(0, 10);
    top.forEach(p => {
        const isCurrentUser = p.user.email === currentUserEmail;
        const icon = p.stats.rank === 1 ? '🥇' : p.stats.rank === 2 ? '🥈' : p.stats.rank === 3 ? '🥉' : `*${p.stats.rank}.*`;
        const roiText = `ROI: ${p.stats.roi.toFixed(1)}%`;
        const profitText = `Прибыль: ${p.stats.totalProfit.toFixed(2)} ₽`;
        text += `${isCurrentUser ? '*' : ''}${icon} ${p.user.nickname} (${roiText}, ${profitText})${isCurrentUser ? '*' : ''}\n`;
    });

    return text;
}

export async function showCompetitionsMenu(update: TelegramUpdate, state: UserState, env: Env, board: Board = 'roi', period: Period = 'week') {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const chatId = message.chat.id;
    const messageId = update.callback_query?.message.message_id;

    const allUsersWithBets = await Promise.all(
        (await getUsers(env)).map(async user => {
            const userState = await (await import('../data/userStore')).findUserByEmail(user.email, env);
            return { user, bets: userState?.bets || [] };
        })
    );
    
    const leaderboards = generateLeaderboards(allUsersWithBets, period);

    const boardTitles = {
        roi: `Топ по ROI за ${period === 'week' ? 'неделю' : period === 'month' ? 'месяц' : 'все время'}`,
        top_winners: `Крупнейшие выигрыши за ${period === 'week' ? 'неделю' : period === 'month' ? 'месяц' : 'все время'}`,
        most_active: `Самые активные за ${period === 'week' ? 'неделю' : period === 'month' ? 'месяц' : 'все время'}`,
    };

    const currentBoardData = leaderboards[board];
    const text = formatLeaderboardText(currentBoardData, boardTitles[board], state.user?.email);

    const keyboard = makeKeyboard([
        [ // Board selection
            { text: board === 'roi' ? '👑 ROI' : 'ROI', callback_data: buildCompCb('roi', period) },
            { text: board === 'top_winners' ? '💰 Выигрыши' : 'Выигрыши', callback_data: buildCompCb('top_winners', period) },
            { text: board === 'most_active' ? '🏃‍♂️ Активность' : 'Активность', callback_data: buildCompCb('most_active', period) },
        ],
        [ // Period selection
            { text: period === 'week' ? '📅 Неделя' : 'Неделя', callback_data: buildCompCb(board, 'week') },
            { text: period === 'month' ? '🗓️ Месяц' : 'Месяц', callback_data: buildCompCb(board, 'month') },
            { text: period === 'all_time' ? '♾️ Все время' : 'Все время', callback_data: buildCompCb(board, 'all_time') },
        ],
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handleCompetitionCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const [_, board, period] = callbackQuery.data.split('|') as [string, Board, Period];
    const fakeUpdate = { callback_query: callbackQuery }; // Create a fake update object
    await showCompetitionsMenu(fakeUpdate, state, env, board, period);
}