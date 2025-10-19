import { useState, useEffect, useMemo } from 'react';
import { Bet, User, BetStatus, Achievement } from '../types';
import { getUsers } from '../data/userStore';
import { loadUserData } from '../data/betStore';
import { getPeriodStart } from '../utils/dateHelpers';
import { calculateAchievements } from '../utils/achievements';

export type TimePeriod = 'week' | 'month' | 'year' | 'all_time';

export interface ParticipantStats {
    rank: number;
    roi: number;
    totalBets: number;
    wonBets: number;
    lostBets: number;
    biggestWin: number;
    biggestLoss: number;
    totalStaked: number;
    totalProfit: number;
    achievements: Achievement[];
}

export interface CompetitionParticipant {
    user: {
        nickname: string;
        email: string;
    };
    stats: ParticipantStats;
}

export interface UseCompetitionDataReturn {
    leaderboards: {
        roi: CompetitionParticipant[];
        top_winners: CompetitionParticipant[];
        unluckiest: CompetitionParticipant[];
        most_active: CompetitionParticipant[];
    },
    isLoading: boolean;
    setPeriod: (period: TimePeriod) => void;
    currentPeriod: TimePeriod;
}

export const useCompetitionData = (): UseCompetitionDataReturn => {
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [allUserBets, setAllUserBets] = useState<Map<string, Bet[]>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [currentPeriod, setPeriod] = useState<TimePeriod>('all_time');

    useEffect(() => {
        try {
            const users = getUsers();
            setAllUsers(users);
            
            const betsMap = new Map<string, Bet[]>();
            users.forEach(user => {
                const { bets } = loadUserData(user.email);
                betsMap.set(user.email, bets);
            });
            setAllUserBets(betsMap);
        } catch (error) {
            console.error("Failed to load competition data", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const leaderboards = useMemo(() => {
        if (isLoading || allUsers.length === 0) {
            return { roi: [], top_winners: [], unluckiest: [], most_active: [] };
        }

        const periodStartDate = currentPeriod === 'all_time' ? null : getPeriodStart(currentPeriod);

        const participantRawData = allUsers.map(user => {
            const userBets = allUserBets.get(user.email) || [];
            
            const periodBets = periodStartDate
                ? userBets.filter(b => new Date(b.createdAt) >= periodStartDate)
                : userBets;

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
                bets: settledBets, // for achievement calculation
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
        }).filter(p => p.stats.totalBets > 0); // Only include users with bets in the period

        // --- Leaderboards ---
        const roiBoard = [...participantRawData].sort((a, b) => b.stats.roi - a.stats.roi);
        const winnersBoard = [...participantRawData].sort((a, b) => b.stats.biggestWin - a.stats.biggestWin);
        const unluckiestBoard = [...participantRawData].sort((a, b) => a.stats.biggestLoss - b.stats.biggestLoss);
        const activeBoard = [...participantRawData].sort((a, b) => b.stats.totalBets - a.stats.totalBets);

        // --- Achievements ---
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

    }, [allUsers, allUserBets, isLoading, currentPeriod]);


    return { leaderboards, isLoading, setPeriod, currentPeriod };
};
