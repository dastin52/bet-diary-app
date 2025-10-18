// functions/telegram/competition.ts
import { TelegramCallbackQuery, Env, Bet, User, UserState, TelegramUpdate, CompetitionParticipant } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { generateLeaderboards } from './competitionData';
import { getUsers, findUserByEmail } from '../data/userStore';

export const COMP_PREFIX = 'c|';
export const COMP_ACTIONS = {
    VIEW: 'view',
};
export const buildCompCb = (action: string, ...args: (string | number)[]): string => `${COMP_PREFIX}${action}|${args.join('|')}`;

type LeaderboardType = 'roi' | 'top_winners' | 'unluckiest' | 'most_active';
type TimePeriod = 'week' | 'month' | 'year' | 'all_time';

async function getAllUsersWithBetsFromKV(env: Env): Promise<{ user: User, bets: Bet[] }[]> {
    const users = await getUsers(env);
    const usersWithBets: { user: User, bets: Bet[] }[] = [];
    for (const user of users) {
        const state = await findUserByEmail(user.email, env);
        if (state && state.user) {
            usersWithBets.push({ user: state.user, bets: state.bets });
        }
    }
    return usersWithBets;
}

export async function showCompetitionsMenu(update: TelegramUpdate, state: UserState, env: Env, period: TimePeriod = 'week', boardType: LeaderboardType = 'roi') {
    const message = update.message || update.callback_query?.message;
    if (!message) return;

    const chatId = message.chat.id;
    const messageId = update.callback_query ? message.message_id : null;

    const loadingText = "🔄 Загрузка данных соревнований...";
    if (messageId) {
        await editMessageText(chatId, messageId, loadingText, env);
    } else {
        await sendMessage(chatId, loadingText, env);
    }
    
    const allUsersWithBets = await getAllUsersWithBetsFromKV(env);
    const leaderboards = generateLeaderboards(allUsersWithBets, period);
    
    const boardData = leaderboards[boardType];
    const boardTitles = { roi: 'Короли ROI', top_winners: 'Топ выигрыши', unluckiest: 'Клуб "Неповезло"', most_active: 'Самые активные' };
    const periodTitles = { week: 'Неделя', month: 'Месяц', year: 'Год', all_time: 'Всё время' };
    
    let text = `*🏆 Соревнования (${periodTitles[period]})*\n\n`;
    text += `*${boardTitles[boardType]} (Топ-5):*\n`;

    if (boardData.length > 0) {
        boardData.slice(0, 5).forEach((p: CompetitionParticipant) => {
            let value = '';
            switch(boardType) {
                case 'roi': value = `${p.stats.roi.toFixed(2)}%`; break;
                case 'top_winners': value = `${p.stats.biggestWin.toFixed(2)} ₽`; break;
                case 'unluckiest': value = `${p.stats.biggestLoss.toFixed(2)} ₽`; break;
                case 'most_active': value = `${p.stats.totalBets} ставок`; break;
            }
            text += `${p.stats.rank}. ${p.user.nickname} - *${value}*\n`;
        });
    } else {
        text += '_Нет данных для отображения в этом периоде._\n';
    }

    const periodButtons = (Object.keys(periodTitles) as TimePeriod[]).map(p => ({
        text: period === p ? `• ${periodTitles[p]} •` : periodTitles[p],
        callback_data: buildCompCb(COMP_ACTIONS.VIEW, p, boardType)
    }));

    const boardButtons = (Object.keys(boardTitles) as LeaderboardType[]).map(b => ({
        text: boardType === b ? `• ${boardTitles[b]} •` : boardTitles[b],
        callback_data: buildCompCb(COMP_ACTIONS.VIEW, period, b)
    }));
    
    const keyboard = makeKeyboard([
        boardButtons.slice(0, 2),
        boardButtons.slice(2, 4),
        periodButtons,
        [{ text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageId) {
         await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        // This case is for when it's called directly by a command
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handleCompetitionCallback(callbackQuery: TelegramCallbackQuery, state: UserState, env: Env) {
    const [_, action, period, boardType] = callbackQuery.data.split('|');

    if (action === COMP_ACTIONS.VIEW) {
        const update: TelegramUpdate = { update_id: 0, callback_query: callbackQuery };
        await showCompetitionsMenu(update, state, env, period as TimePeriod, boardType as LeaderboardType);
    }
}
