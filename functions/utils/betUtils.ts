import { Bet, BetLeg, BetStatus, BetType } from '../telegram/types';

export const calculateProfit = (bet: Omit<Bet, 'id' | 'createdAt' | 'event'>): number => {
  switch (bet.status) {
    case BetStatus.Won:
      return bet.stake * (bet.odds - 1);
    case BetStatus.Lost:
      return -bet.stake;
    case BetStatus.Void:
      return 0;
    case BetStatus.CashedOut:
      // For cashed out, profit is manually entered. If not provided, assume 0.
      return bet.profit ?? 0;
    default: // Pending
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

/**
 * Рассчитывает рекомендуемый размер ставки на основе модели управления рисками,
 * учитывающей банк пользователя и коэффициент ставки.
 * Модель предлагает ставить меньший процент от банка на более высокие коэффициенты (более рискованные ставки),
 * чтобы обеспечить устойчивый рост в долгосрочной перспективе.
 * @param bankroll - Текущий банк игрока.
 * @param odds - Коэффициент ставки.
 * @returns Объект с рекомендуемой суммой ставки и процентом от банка, или null, если ставка не рекомендуется.
 */
export const calculateRiskManagedStake = (bankroll: number, odds: number): { stake: number; percentage: number } | null => {
  if (bankroll <= 0 || odds <= 1) {
    return null;
  }

  let percentageOfBankroll: number;

  if (odds < 1.5) {
    // Высокая вероятность, низкий риск. Ставка: 2.5% от банка.
    percentageOfBankroll = 0.025;
  } else if (odds >= 1.5 && odds < 2.5) {
    // Средний риск. Ставка: 1.5% от банка.
    percentageOfBankroll = 0.015;
  } else if (odds >= 2.5 && odds < 4.0) {
    // Повышенный риск (андердоги). Ставка: 0.75% от банка.
    percentageOfBankroll = 0.0075;
  } else { // odds >= 4.0
    // Высокий риск (дальние выстрелы). Ставка: 0.5% от банка.
    percentageOfBankroll = 0.005;
  }

  // Устанавливаем максимальный порог в 5% для предотвращения слишком крупных ставок
  const finalPercentage = Math.min(percentageOfBankroll, 0.05);
  const recommendedStake = bankroll * finalPercentage;
  
  // Не рекомендуем ставить, если рассчитанная сумма слишком мала (например, меньше 1)
  if (recommendedStake < 1) {
      return null;
  }

  return {
    stake: recommendedStake,
    percentage: finalPercentage * 100,
  };
};
