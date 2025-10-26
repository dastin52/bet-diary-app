import { useState, useEffect, useMemo, useCallback } from 'react';
// @google/genai-fix: Import ApiActivityLog type.
import { Bet, User, BetStatus, TeamStats, ApiActivityLog } from '../types';
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
  activityLog: ApiActivityLog[];
  isLoading: boolean;
  updateUserStatus: (email: string, status: 'active' | 'blocked') => void;
}

export const useAdminData = (): UseAdminDataReturn => {
  const [users, setUsers] = useState<User[]>([]);
  const [allBets, setAllBets] = useState<Bet[]>([]);
  const [activityLog, setActivityLog] = useState<ApiActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
        try {
            // 1. Get all registered web users from localStorage
            const webUsers = getUsers();
            
            // 2. Fetch bot users from our secure endpoint.
            const botUsersResponse = await fetch('/api/admin/users');
            const botUsersData = await botUsersResponse.json();
            const botUsers = botUsersData.users || [];

            // 3. Fetch API activity log
            const activityResponse = await fetch('/api/admin/activity');
            const activityData = await activityResponse.json();
            setActivityLog(Array.isArray(activityData) ? activityData : []);

            // 4. Combine and de-duplicate users
            const allUsersMap = new Map<string, User>();
            [...webUsers, ...botUsers].forEach(user => {
                if(user && user.email) {
                    const existing = allUsersMap.get(user.email);
                    if (!existing || (user.source === 'web' && existing.source !== 'web')) {
                        allUsersMap.set(user.email, user);
                    }
                }
            });
            const allUniqueUsers = Array.from(allUsersMap.values());
            setUsers(allUniqueUsers.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()));

            // 5. Aggregate bets from all users
            let collectedBets: Bet[] = [];
            for (const user of allUniqueUsers) {
                const { bets } = loadUserData(user.email);
                collectedBets = [...collectedBets, ...bets];
            }
            setAllBets(collectedBets);
        } catch (error) {
            console.error("Failed to load admin data", error);
        } finally {
            setIsLoading(false);
        }
    };
    fetchData();
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
    // FIX: Ensure bet.stake is treated as a number to prevent arithmetic errors.
    const totalStaked = settledBets.reduce((acc, bet) => acc + (Number(bet.stake) || 0), 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const platformRoi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;

    const statsBySport = settledBets.reduce<Record<string, { profit: number; staked: number }>>((acc, bet) => {
        const sport = bet.sport;
        if (!acc[sport]) {
            acc[sport] = { profit: 0, staked: 0 };
        }
        acc[sport].profit += bet.profit ?? 0;
        // FIX: Ensure bet.stake is treated as a number to prevent arithmetic errors.
        acc[sport].staked += Number(bet.stake) || 0;
        return acc;
    }, {});

    const profitBySport = Object.keys(statsBySport).map((sport) => {
        const data = statsBySport[sport];
        return {
            sport,
            profit: data.profit,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
        };
    });
    
    // FIX: Add explicit generic type to the reduce function to ensure correct type inference for the accumulator. This resolves errors where `count` was inferred as `unknown`.
    const popularSportsCounts = settledBets.reduce((acc: Record<string, number>, bet) => {
        acc[bet.sport] = (acc[bet.sport] || 0) + 1;
        return acc;
    }, {});
    const popularSports = Object.entries(popularSportsCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // FIX: Add explicit generic type to the reduce function to ensure correct type inference for the accumulator. This resolves errors where `count` was inferred as `unknown`.
    const popularBookmakersCounts = settledBets.reduce((acc: Record<string, number>, bet) => {
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
            // FIX: Safely add to the staked amount by converting `bet.stake` to a number and providing a fallback of 0 to prevent `NaN` values.
            bucket.staked += Number(bet.stake) || 0;
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

    // @google/genai-fix: Add explicit type to initial value of reduce to fix type inference issue.
    // FIX: Changed type assertion on initial value to explicitly typing the accumulator parameter for more reliable type inference.
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
                // @google/genai-fix: Ensure bet.stake is treated as a number.
                teamData.staked += Number(bet.stake) || 0;
                teamData.profit += bet.profit ?? 0;
                // FIX: Safely add to the odds sum by converting `bet.odds` to a number and providing a fallback of 0 to prevent `NaN` values.
                teamData.oddsSum += Number(bet.odds) || 0;
                if (bet.status === BetStatus.Won) teamData.wins += 1;
                else if (bet.status === BetStatus.Lost) teamData.losses += 1;
            }
            processTeam(leg.homeTeam);
            processTeam(leg.awayTeam);
        });
        return acc;
    }, {});

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

  return { users, allBets, analytics, activityLog, isLoading, updateUserStatus: updateUserStatusInState };
};
