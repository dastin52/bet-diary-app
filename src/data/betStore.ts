import { Bet, BankTransaction, Goal, GoalMetric, GoalStatus } from '../types';
import { DEMO_STATE } from '../demoData';

const getKeys = (userKey: string) => ({
  betsKey: `sportsBets_${userKey}`,
  bankrollKey: `sportsBettingBankroll_${userKey}`,
  goalsKey: `sportsBettingGoals_${userKey}`,
  bankHistoryKey: `sportsBettingBankHistory_${userKey}`,
});

export interface UserBetData {
  bets: Bet[];
  bankroll: number;
  goals: Goal[];
  bankHistory: BankTransaction[];
}


// Function to sanitize and provide defaults for user data
const normalizeUserData = (data: Partial<UserBetData>): UserBetData => {
    const bets = Array.isArray(data.bets) ? data.bets : [];
    const bankroll = (typeof data.bankroll === 'number' && !isNaN(data.bankroll)) ? data.bankroll : 10000;
    const bankHistory = Array.isArray(data.bankHistory) ? data.bankHistory : [];

    const goals = (Array.isArray(data.goals) ? data.goals : [])
      .map((g: any) => {
        if (!g || typeof g !== 'object') return null;
        
        const scope = (g.scope && typeof g.scope === 'object' && g.scope.type) ? g.scope : { type: 'all' };
        const targetValue = (typeof g.targetValue === 'number' && !isNaN(g.targetValue)) ? g.targetValue : 0;
        const currentValue = (typeof g.currentValue === 'number' && !isNaN(g.currentValue)) ? g.currentValue : 0;
        
        return {
            id: typeof g.id === 'string' ? g.id : `goal_${Date.now()}_${Math.random()}`,
            title: typeof g.title === 'string' ? g.title : 'Без названия',
            metric: Object.values(GoalMetric).includes(g.metric) ? g.metric : GoalMetric.Profit,
            targetValue: targetValue,
            currentValue: currentValue,
            status: Object.values(GoalStatus).includes(g.status) ? g.status : GoalStatus.InProgress,
            createdAt: typeof g.createdAt === 'string' && !isNaN(new Date(g.createdAt).getTime()) ? g.createdAt : new Date().toISOString(),
            deadline: typeof g.deadline === 'string' && !isNaN(new Date(g.deadline).getTime()) ? g.deadline : new Date().toISOString(),
            scope: scope,
        };
      })
      .filter((g): g is Goal => g !== null);

    return { bets, bankroll, goals, bankHistory };
};


export const loadUserData = (userKey: string): UserBetData => {
  if (userKey === 'demo_user') {
    return normalizeUserData(DEMO_STATE);
  }

  const { betsKey, bankrollKey, goalsKey, bankHistoryKey } = getKeys(userKey);

  try {
    const storedBets = localStorage.getItem(betsKey);
    const storedBankroll = localStorage.getItem(bankrollKey);
    const storedHistory = localStorage.getItem(bankHistoryKey);
    const storedGoals = localStorage.getItem(goalsKey);

    const rawData: Partial<UserBetData> = {
        bets: storedBets ? JSON.parse(storedBets) : [],
        bankroll: storedBankroll ? parseFloat(storedBankroll) : 10000,
        bankHistory: storedHistory ? JSON.parse(storedHistory) : [],
        goals: storedGoals ? JSON.parse(storedGoals) : [],
    };
    
    return normalizeUserData(rawData);
    
  } catch (error) {
    console.error(`Error loading data from localStorage for user: ${userKey}, returning default normalized data.`, error);
    return normalizeUserData({});
  }
};


export const saveUserData = (userKey: string, data: UserBetData): void => {
  if (userKey === 'demo_user') return;
  
  const { betsKey, bankrollKey, goalsKey, bankHistoryKey } = getKeys(userKey);

  try {
    localStorage.setItem(betsKey, JSON.stringify(data.bets));
    localStorage.setItem(bankrollKey, String(data.bankroll));
    localStorage.setItem(goalsKey, JSON.stringify(data.goals));
    localStorage.setItem(bankHistoryKey, JSON.stringify(data.bankHistory));
  } catch (error) {
    console.error('Error saving user data to localStorage', error);
  }
};
