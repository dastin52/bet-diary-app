// functions/telegram/competition.ts
import { TelegramCallbackQuery, TelegramUpdate, UserState, Env, CompetitionParticipant, Bet, User, BetStatus, BetType, Achievement } from './types';
import { editMessageText, sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { getAllUsersWithBets } from '../data/userStore';
import { getPeriodStart } from '../utils/dateHelpers';
import { CB } from './router';

// --- Merged from achievements.ts and competitionData.ts to avoid adding new files ---

const ACHIEVEMENTS: { [key: string]: Achievement } = {
    ROI_KING: { id: 'ROI_KING', name: 'Король ROI', description: 'Самый высокий ROI за период', icon: '👑' },
    LUCKY_HAND: { id: 'LUCKY_HAND', name: 'Удачливая рука', description: 'Самый крупный выигрыш с одной ставки', icon: '💰' },
    CRAZY_LOSS: { id: 'CRAZY_LOSS', name: 'Безумный проигрыш', description: 'Самый крупный проигрыш с одной ставки', icon: '💸' },
    MARATHON_RUNNER: { id: 'MARATHON_RUNNER', name: 'Марафонец', description: 'Наибольшее количество сделанных ставок', icon: '🏃‍♂️' },
    PARLAY_KING: { id: 'PARLAY_KING', name: 'Король экспрессов', description: 'Самый высокий выигранный коэффициент в экспрессе', icon: '🚂' },
};

type UserAchievements = { [userId: string]: Achievement[] };
interface ParticipantData { user: { email: string }; bets: Bet[]; }
interface RoiParticipant { user: { email: string }; stats: { roi: number }; }

const calculateAchievements = (participantsData: ParticipantData[], roiLeaderboard: RoiParticipant[]): UserAchievements => {
    const achievements: UserAchievements = {};
    if (participantsData.length === 0) return {};

    participantsData.forEach(p => { achievements[p.user.email] = []; });
    
    if (roiLeaderboard.length > 0 && roiLeaderboard[0].stats.roi > 0) {
        achievements[roiLeaderboard[0].user.email]?.push(ACHIEVEMENTS.ROI_KING);
    }

    let maxWin = { email: '', value: 0 };
    let maxLoss = { email: '', value: 0 };
    let maxBets = { email: '', value: 0 };
    let maxParlayOdds = { email: '', value: 0 };

    participantsData.forEach(p => {
        if (p.bets.length > maxBets.value) {
            maxBets = { email: p.user.email, value: p.bets.length };
        }
        
        p.bets.forEach(bet => {
            if (bet.status === BetStatus.Won && (bet.profit ?? 0) > maxWin.value) {
                maxWin = { email: p.user.email, value: bet.profit! };
            }
            if (bet.status === BetStatus.Lost && Math.abs(bet.profit ?? 0) > maxLoss.value) {
                maxLoss = { email: p.user.email, value: Math.abs(bet.profit!) };
            }
            if (bet.status === BetStatus.Won && bet.betType === BetType.Parlay && bet.odds > maxParlayOdds.value) {
                maxParlayOdds = { email: p.user.email, value: bet.odds };
            }
        });
    });

    if (maxWin.value > 0 && achievements[maxWin.email]) achievements[maxWin.email].push(ACHIEVEMENTS.LUCKY_HAND);
    if (maxLoss.value > 0 && achievements[maxLoss.email]) achievements[maxLoss.email].push(ACHIEVEMENTS.CRAZY_LOSS);
    if (maxBets.value > 0 && achievements[maxBets.email]) achievements[maxBets.email].push(ACHIEVEMENTS.MARATHON_RUNNER);
    if (maxParlayOdds.value > 0 && achievements[maxParlayOdds.email]) achievements[maxParlayOdds.email].push(ACHIEVEMENTS.PARLAY_KING);

    return achievements;
};

const calculateParticipantStats = (user: User, bets: Bet[], period: 'week' | 'month' | 'year' | 'all_time') => {
    // Sanitize the input array to prevent crashes on corrupted data (e.g., null entries)
    const validBets = bets.filter(b => b && typeof b === 'object');

    const periodStartDate = period === 'all_time' ? null : getPeriodStart(period);

    const periodBets = periodStartDate
        ? validBets.filter(b => new Date(b.createdAt) >= periodStartDate)
        : validBets;

    const settledBets = periodBets.filter(b => b.status !== BetStatus.Pending && b.status !== BetStatus.Void);
    const totalStaked = settledBets.reduce((acc, bet) => acc + (Number.isFinite(bet.stake) ? bet.stake : 0), 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (Number.isFinite(bet.profit) ? bet.profit : 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    
    const wins = settledBets.filter(b => b.status === BetStatus.Won);
    const losses = settledBets.filter(b => b.status === BetStatus.Lost);
    
    const biggestWin = wins.reduce((max, bet) => Math.max(max, (Number.isFinite(bet.profit) ? bet.profit : 0)), 0);
    const biggestLoss = losses.reduce((min, bet) => Math.min(min, (Number.isFinite(bet.profit) ? bet.profit : 0)), 0);
    
    return {
        user: { nickname: user.nickname, email: user.email },
        bets: settledBets,
        stats: {
            roi,
            totalBets: settledBets.length,
            wonBets: wins.length,
            lostBets: losses.length,
            biggestWin,
            biggestLoss,
            totalStaked,
            totalProfit,
        }
    };
};

const generateLeaderboards = (allUsersWithBets: { user: User, bets: Bet[] }[], period: 'week' | 'month' | 'year' | 'all_time') => {
    
    const participantRawData = allUsersWithBets
        .map(({ user, bets }) => calculateParticipantStats(user, bets, period))
        .filter(p => p.stats.totalBets > 0);

    const roiBoard = [...participantRawData].sort((a, b) => b.stats.roi - a.stats.roi);
    const winnersBoard = [...participantRawData].sort((a, b) => b.stats.biggestWin - a.stats.biggestWin);
    const unluckiestBoard = [...participantRawData].sort((a, b) => a.stats.biggestLoss - b.stats.biggestLoss);
    const activeBoard = [...participantRawData].sort((a, b) => b.stats.totalBets - a.stats.totalBets);

    const achievementsByUser = calculateAchievements(participantRawData, roiBoard);

    const formatBoard = (board: typeof participantRawData): CompetitionParticipant[] => {
        return board.map((p, index) => ({
            user: p.user,
            stats: {
                ...p.stats,
                rank: index + 1,
                achievements: achievementsByUser[p.user.email] || [],
            }
        }));
    };

    return {
        roi: formatBoard(roiBoard),
        top_winners: formatBoard(winnersBoard),
        unluckiest: formatBoard(unluckiestBoard),
        most_active: formatBoard(activeBoard),
    };
};
// --- End of merged logic ---

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

    // Use the new, efficient data fetching method
    const allUsersWithBets = await getAllUsersWithBets(env);
    
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

export async function handleCompetitionCallback(update: TelegramUpdate, state: UserState, env: Env) {
    const callbackQuery = update.callback_query;
    if (!callbackQuery) return;
    const [_, board, period] = callbackQuery.data.split('|') as [string, Board, Period];
    await showCompetitionsMenu(update, state, env, board, period);
}