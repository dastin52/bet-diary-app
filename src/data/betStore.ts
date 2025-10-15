import { Bet, BankTransaction, Goal } from '../types';
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

export const loadUserData = (userKey: string): UserBetData => {
  if (userKey === 'demo_user') {
    return { ...DEMO_STATE };
  }

  const { betsKey, bankrollKey, goalsKey, bankHistoryKey } = getKeys(userKey);

  try {
    const storedBets = localStorage.getItem(betsKey);
    const bets = storedBets ? JSON.parse(storedBets) : [];

    const storedBankroll = localStorage.getItem(bankrollKey);
    const bankroll = storedBankroll ? parseFloat(storedBankroll) : 10000;

    const storedHistory = localStorage.getItem(bankHistoryKey);
    const bankHistory = storedHistory ? JSON.parse(storedHistory) : [];

    const storedGoals = localStorage.getItem(goalsKey);
    const goals = storedGoals ? JSON.parse(storedGoals) : [];
    
    return { bets, bankroll, goals, bankHistory };
  } catch (error) {
    console.error(`Error loading data from localStorage for user: ${userKey}`, error);
    return { bets: [], bankroll: 10000, goals: [], bankHistory: [] };
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
