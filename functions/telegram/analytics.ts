// functions/telegram/analytics.ts
import { BetStatus, UserState } from './types';
import { BET_TYPE_OPTIONS } from '../constants';

export interface AnalyticsData {
    bankroll: number;
    totalProfit: number;
    roi: number;
    winRate: number;
    betCount: number;
    wonBetsCount: number;
    lostBetsCount: number;
    turnover: number;
    profitBySport: { sport: string; profit: number; roi: number; }[];
    profitByBetType: { type: string; profit: number; roi: number; }[];
    winLossBySport: { sport: string; wins: number; losses: number; }[];
    performanceByOdds: { range: string; wins: number; losses: number; winRate: number; roi: number; }[];
}

export function calculateAnalytics(state: UserState): AnalyticsData {
    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won);
    const lostBetsCount = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets.length / nonVoidBets.length) * 100 : 0;
    
    // The rest of the complex calculations for profitBySport, byBetType, etc.
    // ... (full logic from useBets hook) ...
    const statsBySport = settledBets.reduce((acc: Record<string, { profit: number, staked: number }>, bet) => {
        if (!acc[bet.sport]) acc[bet.sport] = { profit: 0, staked: 0 };
        acc[bet.sport].profit += bet.profit ?? 0;
        acc[bet.sport].staked += bet.stake;
        return acc;
    }, {});
    // ... and so on for all other metrics

    return {
        bankroll: state.bankroll,
        totalProfit,
        roi,
        winRate,
        betCount,
        wonBetsCount: wonBets.length,
        lostBetsCount,
        turnover: totalStaked,
        profitBySport: Object.entries(statsBySport).map(([sport, data]) => ({ sport, ...data, roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0})),
        // ... (return all other calculated metrics)
        profitByBetType: [], 
        winLossBySport: [], 
        performanceByOdds: []
    };
}

export function formatShortReportText(analytics: AnalyticsData): string {
    const profitSign = analytics.totalProfit >= 0 ? '+' : '';
    return `*📊 Ваша статистика*
    
- 💰 *Текущий банк:* ${analytics.bankroll.toFixed(2)} ₽
- ${analytics.totalProfit >= 0 ? '📈' : '📉'} *Общая прибыль:* ${profitSign}${analytics.totalProfit.toFixed(2)} ₽
- 🎯 *ROI:* ${analytics.roi.toFixed(2)}%
- 🔄 *Оборот:* ${analytics.turnover.toFixed(2)} ₽
- 🏆 *Процент побед:* ${analytics.winRate.toFixed(2)}%
- ✅ *Выигрыши:* ${analytics.wonBetsCount} | ❌ *Проигрыши:* ${analytics.lostBetsCount}
- 📋 *Всего ставок:* ${analytics.betCount}`;
}

export function formatDetailedReportText(analytics: AnalyticsData): string {
    // ... (full formatting logic with emojis for all sections)
    return `*📝 Ваш подробный отчет*\n\n${formatShortReportText(analytics)}\n\n... (detailed sections would go here)`;
}

export function generateAnalyticsHtml(analytics: AnalyticsData): string {
    // ... (full logic to generate a styled HTML string)
    return `<!DOCTYPE html><html><head><title>Отчет</title></head><body><h1>Ваш отчет</h1><p>Банк: ${analytics.bankroll}</p></body></html>`;
}
