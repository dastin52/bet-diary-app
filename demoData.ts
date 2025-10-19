import { Bet, BetStatus, BetType, BankTransaction, BankTransactionType } from './types';
import { generateEventString } from './utils/betUtils';

// A local, simplified version for pre-calculating demo profits.
const calculateProfit = (bet: { status: BetStatus, stake: number, odds: number, profit?: number }): number => {
    const stake = Number(bet.stake);
    const odds = Number(bet.odds);

    if (bet.status === BetStatus.CashedOut) {
        // FIX: Use nullish coalescing operator for safety.
        return bet.profit ?? 0;
    }

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

const DEMO_BETS_RAW: Omit<Bet, 'id' | 'createdAt' | 'event' | 'profit'>[] = [
    { sport: 'Футбол', legs: [{ homeTeam: 'Реал Мадрид', awayTeam: 'Барселона', market: 'П1' }], bookmaker: 'FONBET', betType: BetType.Single, stake: 100, odds: 2.15, status: BetStatus.Won, tags: ['класико', 'value_bet'] },
    { sport: 'Футбол', legs: [{ homeTeam: 'Манчестер Юнайтед', awayTeam: 'Ливерпуль', market: 'Обе забьют - Да' }], bookmaker: 'Winline', betType: BetType.Single, stake: 75, odds: 1.6, status: BetStatus.Lost },
    { sport: 'Баскетбол', legs: [{ homeTeam: 'Лейкерс', awayTeam: 'Клипперс', market: 'Тотал > 220.5' }], bookmaker: 'BetBoom', betType: BetType.Single, stake: 50, odds: 1.9, status: BetStatus.Won, tags: ['nba', 'тотал'] },
    { sport: 'Теннис', legs: [{ homeTeam: 'Даниил Медведев', awayTeam: 'Андрей Рублев', market: 'П1' }], bookmaker: 'Лига Ставок', betType: BetType.Single, stake: 120, odds: 1.55, status: BetStatus.Won },
    { sport: 'Хоккей', legs: [{ homeTeam: 'ЦСКА', awayTeam: 'СКА', market: 'Тотал < 4.5' }], bookmaker: 'PARI', betType: BetType.Single, stake: 80, odds: 2.05, status: BetStatus.Lost, tags: ['кхл'] },
    { sport: 'ММА', legs: [{ homeTeam: 'Ислам Махачев', awayTeam: 'Арман Царукян', market: 'Победа 1 досрочно' }], bookmaker: 'БЕТСИТИ', betType: BetType.Single, stake: 60, odds: 3.5, status: BetStatus.Won, tags: ['ufc', 'досрочно'] },
    { sport: 'Футбол', legs: [{ homeTeam: 'Бавария', awayTeam: 'Боруссия Д', market: 'Тотал > 3.5' }, { homeTeam: 'ПСЖ', awayTeam: 'Марсель', market: 'П1' }], bookmaker: 'OLIMPBET', betType: BetType.Parlay, stake: 40, odds: 3.2, status: BetStatus.Won, tags: ['экспресс_надежный'] },
    { sport: 'Киберспорт', legs: [{ homeTeam: 'Team Spirit', awayTeam: 'G2 Esports', market: 'П1' }], bookmaker: 'МЕЛБЕТ', betType: BetType.Single, stake: 90, odds: 1.7, status: BetStatus.Lost },
    { sport: 'Теннис', legs: [{ homeTeam: 'Арина Соболенко', awayTeam: 'Ига Швёнтек', market: 'Тотал по геймам > 21.5' }], bookmaker: 'МАРАФОН БЕТ', betType: BetType.Single, stake: 110, odds: 1.88, status: BetStatus.Won, tags: ['wta', 'тотал'] },
    { sport: 'Баскетбол', legs: [{ homeTeam: 'Бостон Селтикс', awayTeam: 'Даллас Маверикс', market: 'Фора 1 (-5.5)' }, { homeTeam: 'Голден Стэйт', awayTeam: 'Финикс Санз', market: 'Тотал > 230.5' }], bookmaker: 'Tennisi.bet', betType: BetType.Parlay, stake: 30, odds: 3.8, status: BetStatus.Lost },
    { sport: 'Футбол', legs: [{ homeTeam: 'Арсенал', awayTeam: 'Тоттенхэм', market: 'X' }], bookmaker: 'Leon', betType: BetType.Single, stake: 25, odds: 4.1, status: BetStatus.Void, tags: ['риск'] },
    { sport: 'Хоккей', legs: [{ homeTeam: 'Ак Барс', awayTeam: 'Салават Юлаев', market: 'П1 (вкл. ОТ и буллиты)' }], bookmaker: 'Winline', betType: BetType.Single, stake: 150, odds: 1.8, status: BetStatus.Won, tags: ['кхл', 'дерби'] },
    { sport: 'ММА', legs: [{ homeTeam: 'Алекс Перейра', awayTeam: 'Иржи Прохазка', market: 'Тотал раундов < 2.5' }], bookmaker: 'BetBoom', betType: BetType.Single, stake: 70, odds: 2.2, status: BetStatus.Won, tags: ['ufc', 'досрочно'] },
    { sport: 'Футбол', legs: [{ homeTeam: 'Ювентус', awayTeam: 'Интер', market: 'Тотал < 2.5' }], bookmaker: 'FONBET', betType: BetType.Single, stake: 100, odds: 1.95, status: BetStatus.Lost, tags: ['серия_а', 'value_bet'] },
    { sport: 'Теннис', legs: [{ homeTeam: 'Карлос Алькарас', awayTeam: 'Янник Синнер', market: 'Точный счет по сетам 2:1' }], bookmaker: 'Лига Ставок', betType: BetType.Single, stake: 45, odds: 4.5, status: BetStatus.Lost, tags: ['atp', 'риск'] }
];


const createDate = (daysAgo: number, hour: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
}

export const DEMO_BETS: Bet[] = DEMO_BETS_RAW.map((bet, index) => {
    const fullBet: Bet = {
        ...bet,
        id: `demo-${index}`,
        createdAt: createDate(DEMO_BETS_RAW.length - index, 18 + (index % 4)),
        event: generateEventString(bet.legs, bet.betType, bet.sport),
    };
    fullBet.profit = calculateProfit(fullBet);
    return fullBet;
}).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());


const DEMO_BANKROLL_START = 10000;

const generateDemoHistory = (): { history: BankTransaction[], finalBankroll: number } => {
    let runningBalance = DEMO_BANKROLL_START;
    const history: BankTransaction[] = [];

    const initialDeposit: BankTransaction = {
        id: 'demo-initial',
        timestamp: createDate(DEMO_BETS_RAW.length + 1, 12),
        type: BankTransactionType.Deposit,
        amount: DEMO_BANKROLL_START,
        previousBalance: 0,
        newBalance: DEMO_BANKROLL_START,
        description: 'Начальный банк',
    };
    history.push(initialDeposit);

    const sortedBets = [...DEMO_BETS].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const bet of sortedBets) {
        if (bet.status === BetStatus.Pending) continue;

        const profit = bet.profit ?? 0;
        if (profit === 0 && bet.status !== BetStatus.Void) continue;

        let type: BankTransactionType;
        let description: string;

        switch(bet.status) {
            case BetStatus.Won:
                type = BankTransactionType.BetWin;
                description = `Выигрыш: ${bet.event}`;
                break;
            case BetStatus.Lost:
                type = BankTransactionType.BetLoss;
                description = `Проигрыш: ${bet.event}`;
                break;
            case BetStatus.Void:
                type = BankTransactionType.BetVoid;
                description = `Возврат: ${bet.event}`;
                break;
            case BetStatus.CashedOut:
                type = BankTransactionType.BetCashout;
                description = `Кэшаут: ${bet.event}`;
                break;
            default:
                continue;
        }

        const newTransaction: BankTransaction = {
            id: `demo-tx-${bet.id}`,
            timestamp: bet.createdAt,
            type,
            amount: profit,
            previousBalance: runningBalance,
            newBalance: runningBalance + profit,
            description,
            betId: bet.id,
        };
        
        runningBalance += profit;
        history.push(newTransaction);
    }
    
    return { history: history.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), finalBankroll: runningBalance };
};

const { history: DEMO_BANK_HISTORY, finalBankroll: DEMO_BANKROLL } = generateDemoHistory();

export const DEMO_STATE = {
  bets: DEMO_BETS,
  bankroll: DEMO_BANKROLL,
  bankHistory: DEMO_BANK_HISTORY,
  goals: [], // Demo starts with no goals
};
