
import { UserState, BetStatus } from './types';
import { BET_TYPE_OPTIONS } from '../constants';

// This is a server-side equivalent of the analytics calculation from the useBets hook.
export function calculateBotAnalytics(state: UserState) {
    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const lostBetsCount = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void).length;
    // FIX: Removed incorrect `.length` access on `nonVoidBets` which is a number.
    const winRate = nonVoidBets > 0 ? (wonBets / nonVoidBets) * 100 : 0;

    const statsBySport = settledBets.reduce((acc, bet) => {
        const sport = bet.sport;
        if (!acc[sport]) {
            acc[sport] = { profit: 0, staked: 0, wins: 0, losses: 0 };
        }
        acc[sport].profit += bet.profit ?? 0;
        acc[sport].staked += bet.stake;
        if (bet.status === BetStatus.Won) acc[sport].wins++;
        if (bet.status === BetStatus.Lost) acc[sport].losses++;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number, wins: number; losses: number } });

    const profitBySport = Object.keys(statsBySport).map((sport) => {
        const data = statsBySport[sport];
        return {
            sport,
            profit: data.profit,
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0,
            wins: data.wins,
            losses: data.losses,
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
            if (bet.status === BetStatus.Won) bucket.wins++;
            if (bet.status === BetStatus.Lost) bucket.losses++;
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
      turnover: totalStaked,
      totalProfit,
      roi,
      betCount,
      winRate,
      lostBetsCount,
      profitBySport,
      profitByBetType: profitByBetTypeArray,
      performanceByOdds,
    };
}


export function formatAnalyticsToText(analytics: ReturnType<typeof calculateBotAnalytics>, bankroll: number): string {
    const profitSign = analytics.totalProfit > 0 ? '+' : '';
    let report = `*📊 Ваш подробный отчет*\n\n`;

    report += `*Ключевые показатели:*\n`;
    report += `  - *Текущий банк:* ${bankroll.toFixed(2)} ₽\n`;
    report += `  - *Общая прибыль:* ${profitSign}${analytics.totalProfit.toFixed(2)} ₽\n`;
    report += `  - *ROI:* ${analytics.roi.toFixed(2)}%\n`;
    report += `  - *Оборот:* ${analytics.turnover.toFixed(2)} ₽\n`;
    report += `  - *Всего ставок:* ${analytics.betCount}\n`;
    report += `  - *Процент побед:* ${analytics.winRate.toFixed(2)}%\n`;
    report += `  - *Выигрышей/Проигрышей:* ${analytics.betCount - analytics.lostBetsCount} / ${analytics.lostBetsCount}\n\n`;

    if (analytics.profitBySport.length > 0) {
        report += `*Прибыль по видам спорта:*\n`;
        analytics.profitBySport.forEach(item => {
            const itemProfitSign = item.profit > 0 ? '+' : '';
            report += `  - *${item.sport}:* ${itemProfitSign}${item.profit.toFixed(2)} ₽ (ROI: ${item.roi.toFixed(1)}%)\n`;
        });
        report += `\n`;
    }
    
    if (analytics.profitByBetType.length > 0) {
        report += `*Прибыль по типам ставок:*\n`;
        analytics.profitByBetType.forEach(item => {
             const itemProfitSign = item.profit > 0 ? '+' : '';
            report += `  - *${item.type}:* ${itemProfitSign}${item.profit.toFixed(2)} ₽ (ROI: ${item.roi.toFixed(1)}%)\n`;
        });
        report += `\n`;
    }
    
    if (analytics.profitBySport.length > 0) {
        report += `*В/П по видам спорта:*\n`;
        analytics.profitBySport.forEach(item => {
            report += `  - *${item.sport}:* ${item.wins} В / ${item.losses} П\n`;
        });
        report += `\n`;
    }

    if (analytics.performanceByOdds.length > 0) {
        report += `*Проходимость по коэффициентам:*\n`;
        analytics.performanceByOdds.forEach(item => {
            if (item.wins + item.losses > 0) {
                report += `  - *${item.range}:* ${item.winRate.toFixed(1)}% проход (${item.wins}В/${item.losses}П) | ROI: ${item.roi.toFixed(1)}%\n`;
            }
        });
    }

    return report;
}
