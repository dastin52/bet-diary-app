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
    const bankroll = typeof data.bankroll === 'number' && !isNaN(data.bankroll) ? data.bankroll : 10000;
    const bankHistory = Array.isArray(data.bankHistory) ? data.bankHistory : [];

    const goals = (Array.isArray(data.goals) ? data.goals : [])
      .map(g => {
        // If g is not a valid object, discard it.
        if (!g || typeof g !== 'object') return null;
        
        // Return a fully-structured goal object with defaults for missing fields.
        return {
            id: g.id || `goal_${Date.now()}_${Math.random()}`,
            title: g.title || 'Без названия',
            metric: g.metric || GoalMetric.Profit,
            targetValue: typeof g.targetValue === 'number' ? g.targetValue : 0,
            currentValue: typeof g.currentValue === 'number' ? g.currentValue : 0,
            status: g.status || GoalStatus.InProgress,
            createdAt: g.createdAt || new Date().toISOString(),
            deadline: g.deadline || new Date().toISOString(),
            scope: (g.scope && typeof g.scope === 'object') ? g.scope : { type: 'all' },
        };
      })
      .filter((g): g is Goal => g !== null); // Filter out nulls and type guard

    return { bets, bankroll, goals, bankHistory };
};


export const loadUserData = (userKey: string): UserBetData => {
  if (userKey === 'demo_user') {
    // Normalize demo state as well, just in case
    return normalizeUserData(DEMO_STATE);
  }

  const { betsKey, bankrollKey, goalsKey, bankHistoryKey } = getKeys(userKey);

  try {
    const storedBets = localStorage.getItem(betsKey);
    const storedBankroll = localStorage.getItem(bankrollKey);
    const storedHistory = localStorage.getItem(bankHistoryKey);
    const storedGoals = localStorage.getItem(goalsKey);

    // Parse data, providing empty arrays as fallback
    const rawData: Partial<UserBetData> = {
        bets: storedBets ? JSON.parse(storedBets) : [],
        bankroll: storedBankroll ? parseFloat(storedBankroll) : 10000,
        bankHistory: storedHistory ? JSON.parse(storedHistory) : [],
        goals: storedGoals ? JSON.parse(storedGoals) : [],
    };
    
    // Always run data through the normalizer
    return normalizeUserData(rawData);
    
  } catch (error) {
    console.error(`Error loading data from localStorage for user: ${userKey}, returning default normalized data.`, error);
    // On any parsing error, return safe, default, normalized data.
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