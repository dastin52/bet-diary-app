import { Bet, BetLeg, BetStatus, BetType } from '../types';

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
        return `Экспресс (${count} ${ending})`;
    }
    if (betType === BetType.System) {
        return 'Системная ставка';
    }
    return legs[0]?.market || 'Неизвестное событие';
};

export const exportBetsToCSV = (bets: Bet[]): void => {
  if (bets.length === 0) return;

  const headers = [
    'Date',
    'Sport',
    'Event',
    'Bookmaker',
    'BetType',
    'Stake',
    'Odds',
    'Status',
    'Profit',
    'Tags'
  ];

  const rows = bets.map(bet => {
    const formattedDate = new Date(bet.createdAt).toISOString();
    const cleanEvent = `"${(bet.event || '').replace(/"/g, '""')}"`;
    const cleanBookmaker = `"${(bet.bookmaker || '').replace(/"/g, '""')}"`;
    const cleanTags = `"${(bet.tags || []).join(';')}"`;

    return [
      formattedDate,
      bet.sport,
      cleanEvent,
      cleanBookmaker,
      bet.betType,
      bet.stake,
      bet.odds,
      bet.status,
      bet.profit ?? 0,
      cleanTags
    ].join(',');
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `bet_diary_export_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
