import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bet, BetLeg, BetStatus, BetType, BankTransaction, BankTransactionType, Goal, GoalStatus } from '../types';
import { BET_TYPE_OPTIONS } from '../constants';
import { generateEventString, calculateProfit } from '../utils/betUtils';
import { loadUserData, saveUserData } from '../data/betStore';
import { updateGoalProgress } from '../utils/goalUtils';

export interface UseBetsReturn {
  bets: Bet[];
  bankroll: number;
  goals: Goal[];
  bankHistory: BankTransaction[];
  addBet: (bet: Omit<Bet, 'id' | 'createdAt' | 'event'>) => void;
  addMultipleBets: (bets: Omit<Bet, 'id' | 'createdAt' | 'event'>[]) => void;
  updateBet: (id: string, updatedBet: Partial<Omit<Bet, 'id' | 'createdAt' | 'event'>>) => void;
  deleteBet: (id: string) => void;
  updateBankroll: (newBankroll: number) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'>) => void;
  updateGoal: (id: string, updatedGoal: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  analytics: {
    totalStaked: number;
    turnover: number;
    totalProfit: number;
    roi: number;
    yield: number;
    betCount: number;
    lostBetsCount: number;
    winRate: number;
    balanceHistory: { date: string; balance: number }[];
    profitBySport: { sport: string; profit: number; roi: number; }[];
    profitByBetType: { type: string; profit: number; roi: number; }[];
    winLossBySport: { sport: string; wins: number; losses: number; }[];
    performanceByOdds: { range: string; wins: number; losses: number; winRate: number; roi: number; }[];
  };
}

export const useBets = (userKey: string): UseBetsReturn => {
  const isDemoMode = userKey === 'demo_user';
  
  const [bets, setBets] = useState<Bet[]>([]);
  const [bankroll, setBankroll] = useState<number>(10000);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bankHistory, setBankHistory] = useState<BankTransaction[]>([]);
  
  useEffect(() => {
    const data = loadUserData(userKey);
    setBets(data.bets);
    setBankroll(data.bankroll);
    setGoals(data.goals);
    
    if (data.bankHistory.length === 0 && data.bets.length === 0 && !isDemoMode) {
      // New user: create initial bank deposit transaction
      const initialTransaction: BankTransaction = {
        id: new Date().toISOString() + Math.random(),
        timestamp: new Date().toISOString(),
        type: BankTransactionType.Deposit,
        amount: data.bankroll,
        previousBalance: 0,
        newBalance: data.bankroll,
        description: 'Начальный банк',
      };
      setBankHistory([initialTransaction]);
    } else {
      setBankHistory(data.bankHistory);
    }
  }, [userKey, isDemoMode]);


  useEffect(() => {
    if (isDemoMode) return;
    saveUserData(userKey, { bets, bankroll, goals, bankHistory });
  }, [bets, bankroll, goals, bankHistory, userKey, isDemoMode]);

  // Effect for updating goal progress safely
  useEffect(() => {
    if (isDemoMode || goals.length === 0) {
        return;
    }
    const settledBets = bets.filter(b => b.status !== BetStatus.Pending);
    const updatedGoals = goals.map(goal => updateGoalProgress(goal, settledBets));
    
    // Prevent infinite loops by checking for actual changes before updating state.
    if (JSON.stringify(updatedGoals) !== JSON.stringify(goals)) {
        setGoals(updatedGoals);
    }
  }, [bets, goals, isDemoMode]);


  const addBankTransaction = useCallback((
    amount: number,
    type: BankTransactionType,
    description: string,
    betId?: string
  ) => {
    setBankroll(prevBankroll => {
        const newBalance = prevBankroll + amount;
        const newTransaction: BankTransaction = {
            id: new Date().toISOString() + Math.random(),
            timestamp: new Date().toISOString(),
            type,
            amount,
            previousBalance: prevBankroll,
            newBalance,
            description,
            betId,
        };
        setBankHistory(prevHistory => [newTransaction, ...prevHistory]);
        return newBalance;
    });
  }, []);

  const addBet = useCallback((betData: Omit<Bet, 'id' | 'createdAt' | 'event'>) => {
    if (isDemoMode) return;
    const newBet: Bet = {
      ...betData,
      id: new Date().toISOString() + Math.random(),
      createdAt: new Date().toISOString(),
      event: generateEventString(betData.legs, betData.betType, betData.sport),
    };
    if (newBet.status !== BetStatus.Pending) {
        newBet.profit = calculateProfit(newBet);
        if(newBet.profit !== 0) {
            const type = newBet.profit > 0 ? BankTransactionType.BetWin : BankTransactionType.BetLoss;
            addBankTransaction(newBet.profit, type, `Ставка рассчитана: ${newBet.event}`, newBet.id);
        }
    }
    setBets(prevBets => [...prevBets, newBet].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [isDemoMode, addBankTransaction]);

  const addMultipleBets = useCallback((betsData: Omit<Bet, 'id' | 'createdAt' | 'event'>[]) => {
    if (isDemoMode) return;
    
    let totalProfitFromImport = 0;
    
    const newBets: Bet[] = betsData.map(betData => {
        const betWithProfit = { ...betData };
        if (betWithProfit.status !== BetStatus.Pending) {
            betWithProfit.profit = calculateProfit(betWithProfit);
            totalProfitFromImport += betWithProfit.profit || 0;
        }

        return {
            ...betWithProfit,
            id: new Date().toISOString() + Math.random(),
            createdAt: new Date().toISOString(),
            event: generateEventString(betData.legs, betData.betType, betData.sport),
        };
    });

    setBets(prevBets => [...prevBets, ...newBets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

    if (totalProfitFromImport !== 0) {
        addBankTransaction(
            totalProfitFromImport,
            BankTransactionType.Correction,
            `Импорт ${newBets.length} рассчитанных ставок`,
            undefined
        );
    }
  }, [isDemoMode, addBankTransaction]);

  const updateBet = useCallback((id: string, updatedBetData: Partial<Omit<Bet, 'id' | 'createdAt' | 'event'>>) => {
    if (isDemoMode) return;
    let betEventString = '';

    setBets(prevBets => {
        const originalBet = prevBets.find(b => b.id === id);
        if (!originalBet) return prevBets;

        const wasSettled = originalBet.status !== BetStatus.Pending;
        const originalProfit = wasSettled ? (originalBet.profit ?? calculateProfit(originalBet)) : 0;

        const updatedBet = { ...originalBet, ...updatedBetData };
        
        if(updatedBetData.legs || updatedBetData.betType || updatedBetData.sport) {
            updatedBet.event = generateEventString(updatedBet.legs, updatedBet.betType, updatedBet.sport);
        }
        betEventString = updatedBet.event;

        const isNowSettled = updatedBet.status !== BetStatus.Pending;
        
        if (updatedBet.status !== BetStatus.CashedOut) {
            updatedBet.profit = calculateProfit(updatedBet);
        }
        
        const newProfit = isNowSettled ? (updatedBet.profit ?? 0) : 0;
        
        const profitChange = newProfit - originalProfit;

        if (profitChange !== 0) {
            let type: BankTransactionType;
            let description: string;
            switch(updatedBet.status) {
                case BetStatus.Won:
                    type = BankTransactionType.BetWin;
                    description = `Ставка выиграла: ${betEventString}`;
                    break;
                case BetStatus.Lost:
                    type = BankTransactionType.BetLoss;
                    description = `Ставка проиграла: ${betEventString}`;
                    break;
                case BetStatus.Void:
                     type = BankTransactionType.BetVoid;
                     description = `Возврат по ставке: ${betEventString}`;
                     break;
                case BetStatus.CashedOut:
                    type = BankTransactionType.BetCashout;
                    description = `Кэшаут по ставке: ${betEventString}`;
                    break;
                default:
                    type = BankTransactionType.Correction;
                    description = `Корректировка по ставке: ${betEventString}`;
            }
             addBankTransaction(profitChange, type, description, id);
        }

        return prevBets.map(bet => (bet.id === id ? updatedBet : bet));
    });
  }, [isDemoMode, addBankTransaction]);

  const deleteBet = useCallback((id: string) => {
    if (isDemoMode) return;
    const betToDelete = bets.find(b => b.id === id);
    if (betToDelete) {
        if (betToDelete.status !== BetStatus.Pending) {
            const profitToReverse = betToDelete.profit ?? 0;
            if (profitToReverse !== 0) {
                 addBankTransaction(-profitToReverse, BankTransactionType.Correction, `Отмена расчета (удаление ставки): ${betToDelete.event}`, betToDelete.id);
            }
        }
        setBets(prevBets => prevBets.filter(bet => bet.id !== id));
    }
  }, [bets, isDemoMode, addBankTransaction]);

  const updateBankroll = useCallback((newBankroll: number) => {
    if (isDemoMode) return;
    if(!isNaN(newBankroll) && newBankroll >= 0) {
        setBankroll(current => {
            const amount = newBankroll - current;
            if (amount !== 0) {
                const type = amount > 0 ? BankTransactionType.Deposit : BankTransactionType.Withdrawal;
                const description = amount > 0 ? 'Ручное пополнение' : 'Вывод средств';
                
                const newTransaction: BankTransaction = {
                    id: new Date().toISOString() + Math.random(),
                    timestamp: new Date().toISOString(),
                    type,
                    amount,
                    previousBalance: current,
                    newBalance: newBankroll,
                    description,
                };
                setBankHistory(prevHistory => [newTransaction, ...prevHistory]);
            }
            return newBankroll;
        });
    }
  }, [isDemoMode]);

    const addGoal = useCallback((goalData: Omit<Goal, 'id' | 'createdAt' | 'currentValue' | 'status'>) => {
        if(isDemoMode) return;
        const newGoal: Goal = {
            ...goalData,
            id: new Date().toISOString() + Math.random(),
            createdAt: new Date().toISOString(),
            currentValue: 0,
            status: GoalStatus.InProgress,
        };
        setGoals(prev => [newGoal, ...prev]);
    }, [isDemoMode]);

    const updateGoal = useCallback((id: string, updatedGoalData: Partial<Goal>) => {
        if(isDemoMode) return;
        setGoals(prev => prev.map(g => g.id === id ? {...g, ...updatedGoalData} : g));
    }, [isDemoMode]);

    const deleteGoal = useCallback((id: string) => {
        if(isDemoMode) return;
        setGoals(prev => prev.filter(g => g.id !== id));
    }, [isDemoMode]);


  const analytics = useMemo(() => {
    const settledBets = bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const yield_ = roi; // In sports betting context, ROI and Yield are often used interchangeably
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const lostBetsCount = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    const balanceHistory = (() => {
        if (bankHistory.length > 1) {
             return [...bankHistory]
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .map(t => ({
                    date: new Date(t.timestamp).toLocaleDateString('ru-RU'),
                    balance: t.newBalance,
                }));
        }
        const initialBankroll = bankroll - totalProfit;
        return [{ date: 'Начало', balance: initialBankroll }, { date: 'Сейчас', balance: bankroll }];
    })();

    const statsBySport = settledBets.reduce((acc, bet) => {
        const sport = bet.sport;
        if (!acc[sport]) {
            acc[sport] = { profit: 0, staked: 0 };
        }
        acc[sport].profit += bet.profit ?? 0;
        acc[sport].staked += bet.stake;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number } });

    const profitBySportArray = Object.keys(statsBySport).map((sport) => {
        const data = statsBySport[sport];
        return {
            sport,
            profit: data.profit,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
        };
    });

    const profitByBetType = settledBets.reduce((acc, bet) => {
        const betTypeLabel = BET_TYPE_OPTIONS.find(opt => opt.value === bet.betType)?.label || bet.betType;
        if (!acc[betTypeLabel]) {
            acc[betTypeLabel] = { profit: 0, staked: 0 };
        }
        acc[betTypeLabel].profit += bet.profit ?? 0;
        acc[betTypeLabel].staked += bet.stake;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number } });

    const profitByBetTypeArray = Object.keys(profitByBetType).map((type) => {
        const data = profitByBetType[type];
        return {
            type,
            profit: data.profit,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
        };
    });

    const winLossBySportAcc = settledBets.reduce((acc, bet) => {
        const sport = bet.sport;
        if (!acc[sport]) {
            acc[sport] = { wins: 0, losses: 0 };
        }
        if (bet.status === BetStatus.Won) {
            acc[sport].wins += 1;
        } else if (bet.status === BetStatus.Lost) {
            acc[sport].losses += 1;
        }
        return acc;
    }, {} as { [key: string]: { wins: number; losses: number } });

    const winLossBySport = Object.keys(winLossBySportAcc).map(sport => ({
        sport,
        wins: winLossBySportAcc[sport].wins,
        losses: winLossBySportAcc[sport].losses,
    }));

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

    return {
      totalStaked,
      turnover: totalStaked,
      totalProfit,
      roi,
      yield: yield_,
      betCount,
      lostBetsCount,
      winRate,
      balanceHistory,
      profitBySport: profitBySportArray,
      profitByBetType: profitByBetTypeArray,
      winLossBySport,
      performanceByOdds,
    };
  }, [bets, bankroll, bankHistory, isDemoMode]);

  return { bets, bankHistory, addBet, addMultipleBets, updateBet, deleteBet, analytics, bankroll, updateBankroll, goals, addGoal, updateGoal, deleteGoal };
};
