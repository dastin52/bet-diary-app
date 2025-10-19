// functions/telegram/competition.ts
import { TelegramUpdate, UserState, Env, CompetitionParticipant } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';
import { getAllUsersWithBets } from '../data/userStore';
import { generateLeaderboards } from './competitionData';

export const COMP_PREFIX = 'c|';
type LeaderboardType = 'roi' | 'top_winners' | 'unluckiest' | 'most_active';
type TimePeriod = 'week' | 'month' | 'year' | 'all_time';

export const buildCompCb = (leaderboard: LeaderboardType, period: TimePeriod) => `${COMP_PREFIX}${leaderboard}|${period}`;

const leaderboardLabels: Record<LeaderboardType, string> = {
    roi: '👑 Короли ROI',
    top_winners: '💰 Топ выигрыши',
    unluckiest: '💸 Клуб "Неповезло"',
    most_active: '🏃‍♂️ Самые активные',
};

const periodLabels: Record<TimePeriod, string> = {
    week: 'Неделя',
    month: 'Месяц',
    year: 'Год',
    all_time: 'Все время',
};

function formatLeaderboardText(participants: CompetitionParticipant[], title: string, period: TimePeriod): string {
    let text = `*${title} (за ${periodLabels[period].toLowerCase()})*\n\n`;
    if (participants.length === 0) {
        return text + "_Нет участников для отображения в этом периоде._";
    }
    participants.slice(0, 10).forEach(p => {
        text += `${p.stats.rank}. ${p.user.nickname} - ROI: ${p.stats.roi.toFixed(1)}%, Прибыль: ${p.stats.totalProfit.toFixed(1)}₽\n`;
    });
    return text;
}

export async function showCompetitionsMenu(update: TelegramUpdate, state: UserState, env: Env, leaderboard: LeaderboardType = 'roi', period: TimePeriod = 'week') {
    const message = update.message || update.callback_query?.message;
    if (!message) return;
    const messageId = update.callback_query ? message.message_id : null;
    const chatId = message.chat.id;

    const allUsersData = await getAllUsersWithBets(env);
    const leaderboards = generateLeaderboards(allUsersData, period);
    
    const activeLeaderboardData = leaderboards[leaderboard];
    const text = formatLeaderboardText(activeLeaderboardData, leaderboardLabels[leaderboard], period);

    const leaderboardButtons = (Object.keys(leaderboardLabels) as LeaderboardType[]).map(key => ({
        text: leaderboard === key ? `[ ${leaderboardLabels[key]} ]` : leaderboardLabels[key],
        callback_data: buildCompCb(key, period)
    }));

    const periodButtons = (Object.keys(periodLabels) as TimePeriod[]).map(key => ({
        text: period === key ? `[ ${periodLabels[key]} ]` : periodLabels[key],
        callback_data: buildCompCb(leaderboard, key)
    }));

    const keyboard = makeKeyboard([
        leaderboardButtons.slice(0, 2),
        leaderboardButtons.slice(2, 4),
        periodButtons.slice(0, 2),
        periodButtons.slice(2, 4),
        [{ text: '◀️ В меню', callback_data: CB.BACK_TO_MAIN }]
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, env, keyboard);
    } else {
        await sendMessage(chatId, text, env, keyboard);
    }
}

export async function handleCompetitionCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const cb = update.callback_query;
    if (!cb || !cb.data) return;

    const [_, leaderboard, period] = cb.data.split('|');
    await showCompetitionsMenu(update, state, env, leaderboard as LeaderboardType, period as TimePeriod);
}
