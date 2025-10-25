import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bet, User, BetStatus, TeamStats } from '../types';
import { getUsers, updateUserStatus } from '../data/userStore';
import { loadUserData } from '../data/betStore';

export interface AdminAnalytics {
  totalUsers: number;
  totalBets: number;
  totalStaked: number;
  totalProfit: number;
  platformRoi: number;
  profitBySport: { sport: string; profit: number; roi: number; }[];
  popularSports: { name: string; count: number }[];
  popularBookmakers: { name: string; count: number }[];
  performanceByOdds: { range: string; wins: number; losses: number; winRate: number; roi: number; }[];
  teamAnalytics: TeamStats[];
}

export interface UseAdminDataReturn {
  users: User[];
  allBets: Bet[];
  analytics: AdminAnalytics | null;
  isLoading: boolean;
  updateUserStatus: (email: string, status: 'active' | 'blocked') => void;
}

export const useAdminData = (): UseAdminDataReturn => {
  const [users, setUsers] = useState<User[]>([]);
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      // 1. Get all registered users
      const allUsers = getUsers();
      // FIX: Use .getTime() to perform arithmetic on Date objects for sorting.
      setUsers(allUsers.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()));

      // 2. Aggregate bets from all users
      let collectedBets: Bet[] = [];
      for (const user of allUsers) {
        const { bets } = loadUserData(user.email);
        collectedBets = [...collectedBets, ...bets];
      }
      setAllBets(collectedBets);
    } catch (error) {
      console.error("Failed to load admin data", error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const updateUserStatusInState = useCallback((email: string, status: 'active' | 'blocked') => {
    updateUserStatus(email, status);
    setUsers(prevUsers => prevUsers.map(u => u.email === email ? { ...u, status } : u));
  }, []);

  const analytics = useMemo((): AdminAnalytics | null => {
    if (isLoading || users.length === 0) {
      return null;
    }

    const settledBets = allBets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const platformRoi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    const statsBySport = settledBets.reduce((acc, bet) => {
        const sport = bet.sport;
        if (!acc[sport]) {
            acc[sport] = { profit: 0, staked: 0 };
        }
        acc[sport].profit += bet.profit ?? 0;
        acc[sport].staked += bet.stake;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number } });

    const profitBySport = Object.keys(statsBySport).map((sport) => {
        const data = statsBySport[sport];
        return {
            sport,
            profit: data.profit,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
        };
    });
    
    // FIX: Explicitly type the accumulator for the reduce function to resolve incorrect type inference.
    const popularSportsCounts = settledBets.reduce<Record<string, number>>((acc, bet) => {
        acc[bet.sport] = (acc[bet.sport] || 0) + 1;
        return acc;
    }, {});
    const popularSports = Object.entries(popularSportsCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // FIX: Explicitly type the accumulator for the reduce function to resolve incorrect type inference.
    const popularBookmakersCounts = settledBets.reduce<Record<string, number>>((acc, bet) => {
        acc[bet.bookmaker] = (acc[bet.bookmaker] || 0) + 1;
        return acc;
    }, {});
    const popularBookmakers = Object.entries(popularBookmakersCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    const oddsRanges = [
        { label: '< 1.5', min: 1, max: 1.5 },
        { label: '1.5 - 2.0', min: 1.5, max: 2.0 },
        { label: '2.0 - 2.5', min: 2.0, max: 2.5 },
        { label: '2.5 - 3.5', min: 2.5, max: 3.5 },
        { label: '> 3.5', min: 3.5, max: Infinity },
    ];
    
    const performanceByOddsAcc = oddsRanges.reduce((acc, range) => {
        acc[range.label] = { wins: 0, losses: 0, staked: 0, profit: 0 };
        return acc;
    }, {} as { [key: string]: { wins: number; losses: number; staked: number; profit: number } });
    
    settledBets.forEach(bet => {
        const range = oddsRanges.find(r => bet.odds >= r.min && bet.odds < r.max);
        if (range) {
            const bucket = performanceByOddsAcc[range.label];
            bucket.staked += bet.stake;
            bucket.profit += bet.profit ?? 0;
            if (bet.status === BetStatus.Won) {
                bucket.wins += 1;
            } else if (bet.status === BetStatus.Lost) {
                bucket.losses += 1;
            }
        }
    });
    
    const performanceByOdds = Object.keys(performanceByOddsAcc).map(label => {
        const data = performanceByOddsAcc[label];
        const totalBets = data.wins + data.losses;
        return {
            range: label,
            wins: data.wins,
            losses: data.losses,
            winRate: totalBets > 0 ? (data.wins / totalBets) * 100 : 0,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
        };
    });

    type TeamStatAccumulator = { [key: string]: { sport: string; count: number; wins: number; losses: number; staked: number; profit: number, oddsSum: number } };

    const teamStatsAggregator = settledBets.reduce((acc: TeamStatAccumulator, bet) => {
        bet.legs.forEach(leg => {
            const processTeam = (teamName: string) => {
                if (!teamName) return;
                 if (!acc[teamName]) {
                    acc[teamName] = {
                        sport: bet.sport, count: 0, wins: 0, losses: 0,
                        staked: 0, profit: 0, oddsSum: 0,
                    };
                }
                const teamData = acc[teamName];
                teamData.count += 1;
                teamData.staked += bet.stake;
                teamData.profit += bet.profit ?? 0;
                teamData.oddsSum += bet.odds;
                if (bet.status === BetStatus.Won) teamData.wins += 1;
                else if (bet.status === BetStatus.Lost) teamData.losses += 1;
            }
            processTeam(leg.homeTeam);
            processTeam(leg.awayTeam);
        });
        return acc;
    }, {} as TeamStatAccumulator);

    const teamAnalytics: TeamStats[] = Object.keys(teamStatsAggregator)
        .map((name) => {
            const data = teamStatsAggregator[name];
            const totalDecided = data.wins + data.losses;
            return {
                name,
                sport: data.sport,
                betCount: data.count,
                winRate: totalDecided > 0 ? (data.wins / totalDecided) * 100 : 0,
                totalProfit: data.profit,
                roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
                avgOdds: data.count > 0 ? data.oddsSum / data.count : 0,
            };
        })
        .filter(team => team.betCount > 0);


    return {
      totalUsers: users.length,
      totalBets: settledBets.length,
      totalStaked,
      totalProfit,
      platformRoi,
      profitBySport,
      popularSports,
      popularBookmakers,
      performanceByOdds,
      teamAnalytics,
    };
  }, [allBets, users, isLoading]);

  return { users, allBets, analytics, isLoading, updateUserStatus: updateUserStatusInState };
};
