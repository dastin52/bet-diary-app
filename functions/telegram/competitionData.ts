// functions/telegram/competitionData.ts
import { Bet, User, BetStatus, Achievement, CompetitionParticipant } from './types';
import { getPeriodStart } from '../utils/dateHelpers';
import { calculateAchievements } from '../utils/achievements';

function calculateParticipantStats(user: User, bets: Bet[], period: 'week' | 'month' | 'year' | 'all_time') {
    const periodStartDate = period === 'all_time' ? null : getPeriodStart(period);

    const periodBets = periodStartDate
        ? bets.filter(b => new Date(b.createdAt) >= periodStartDate)
        : bets;

    const settledBets = periodBets.filter(b => b.status !== BetStatus.Pending && b.status !== BetStatus.Void);
    const totalStaked = settledBets.reduce((acc, bet) => acc + (bet.stake || 0), 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    
    const wins = settledBets.filter(b => b.status === BetStatus.Won);
    const losses = settledBets.filter(b => b.status === BetStatus.Lost);
    
    // FIX: Replaced Math.max(...array) with reduce to prevent "Maximum call stack size exceeded" error on large arrays.
    const biggestWin = wins.reduce((max, bet) => Math.max(max, bet.profit ?? 0), 0);
    const biggestLoss = losses.reduce((min, bet) => Math.min(min, bet.profit ?? 0), 0);
    
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
}

export function generateLeaderboards(allUsersWithBets: { user: User, bets: Bet[] }[], period: 'week' | 'month' | 'year' | 'all_time') {
    
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
}
