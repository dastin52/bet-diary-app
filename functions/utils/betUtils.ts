// functions/utils/betUtils.ts
import { Bet, BetLeg, BetStatus, BetType } from '../telegram/types';

export const calculateProfit = (bet: Omit<Bet, 'id' | 'createdAt' | 'event'>): number => {
  const stake = Number(bet.stake);
  const odds = Number(bet.odds);

  // For cashed out, profit is manually entered. Trust it if it's a valid number.
  if (bet.status === BetStatus.CashedOut) {
      const profit = Number(bet.profit);
      return Number.isFinite(profit) ? profit : 0;
  }

  // For other statuses, validate stake and odds before calculating.
  if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds <= 1) {
    return 0;
  }

  switch (bet.status) {
    case BetStatus.Won:
      return stake * (odds - 1);
    case BetStatus.Lost:
      return -stake;
    case BetStatus.Void:
    case BetStatus.Pending:
    default:
      return 0;
  }
};

export const generateEventString = (legs: BetLeg[], betType: BetType, sport: string): string => {
    if (!legs || legs.length === 0) return 'Пустое событие';
    
    if (betType === BetType.Single && legs.length === 1) {
        const leg = legs[0];
        if (!leg.homeTeam || !leg.awayTeam || !leg.market) return 'Неполные данные';
        const eventName = ['Теннис', 'Бокс', 'ММА'].includes(sport)
          ? `${leg.homeTeam} - ${leg.awayTeam}`
          : `${leg.homeTeam} vs ${leg.awayTeam}`;
        return `${eventName} - ${leg.market}`;
    }
    if (betType === BetType.Parlay) {
        const count = legs.length;
        if (count === 0) return 'Экспресс (пустой)';
        const endings: {[key: string]: string} = { one: 'событие', few: 'события', many: 'событий' };
        const ending = (count % 10 === 1 && count % 100 !== 11) ? endings.one : (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) ? endings.few : endings.many;
        const firstEvent = legs[0] ? `${legs[0].homeTeam} vs ${legs[0].awayTeam}` : '';
        return `Экспресс (${count} ${ending}, ${firstEvent}...)`;
    }
    if (betType === BetType.System) {
        return 'Системная ставка';
    }
    return legs[0]?.market || 'Неизвестное событие';
};

export const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) return null;

  let percentageOfBankroll: number;

  if (odds < 1.5) percentageOfBankroll = 0.025;
  else if (odds >= 1.5 && odds < 2.5) percentageOfBankroll = 0.015;
  else if (odds >= 2.5 && odds < 4.0) percentageOfBankroll = 0.0075;
  else percentageOfBankroll = 0.005;

  const finalPercentage = Math.min(percentageOfBankroll, 0.05);
  const recommendedStake = bankroll * finalPercentage;
  
  if (recommendedStake < 1) return null;

  return { stake: recommendedStake, percentage: finalPercentage * 100 };
};