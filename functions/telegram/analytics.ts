// functions/telegram/analytics.ts
import { BetStatus, UserState } from './types';
import { getPeriodStart } from '../utils/dateHelpers';

export type AnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all_time';

export interface AnalyticsData {
    bankroll: number;
    totalProfit: number;
    roi: number;
    winRate: number;
    betCount: number;
    wonBetsCount: number;
    lostBetsCount: number;
    turnover: number;
    profitBySport: { sport: string; profit: number; roi: number; count: number }[];
    profitByBetType: { type: string; profit: number; roi: number; count: number }[];
    period: AnalyticsPeriod;
}

const periodLabels: Record<AnalyticsPeriod, string> = {
    week: 'за неделю',
    month: 'за месяц',
    quarter: 'за квартал',
    year: 'за год',
    all_time: 'за все время',
};


export function calculateAnalytics(state: UserState, period: AnalyticsPeriod = 'all_time'): AnalyticsData {
    const periodStartDate = period === 'all_time' ? null : getPeriodStart(period as 'week' | 'month' | 'quarter' | 'year');
    
    const relevantBets = periodStartDate 
        ? state.bets.filter(b => new Date(b.createdAt) >= periodStartDate)
        : state.bets;

    const settledBets = relevantBets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const betCount = settledBets.length;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won);
    const lostBetsCount = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets.length / nonVoidBets.length) * 100 : 0;
    
    // FIX: Explicitly cast the initial object for reduce to fix type inference issues.
    const statsBySport = settledBets.reduce((acc: Record<string, { profit: number, staked: number, count: number }>, bet) => {
        if (!acc[bet.sport]) acc[bet.sport] = { profit: 0, staked: 0, count: 0 };
        acc[bet.sport].profit += bet.profit ?? 0;
        acc[bet.sport].staked += bet.stake;
        acc[bet.sport].count += 1;
        return acc;
    }, {} as Record<string, { profit: number, staked: number, count: number }>);

    // FIX: Explicitly cast the initial object for reduce to fix type inference issues.
    const statsByBetType = settledBets.reduce((acc: Record<string, { profit: number, staked: number, count: number }>, bet) => {
        const betTypeLabel = bet.betType; // Simpler for bot
        if (!acc[betTypeLabel]) acc[betTypeLabel] = { profit: 0, staked: 0, count: 0 };
        acc[betTypeLabel].profit += bet.profit ?? 0;
        acc[betTypeLabel].staked += bet.stake;
        acc[betTypeLabel].count += 1;
        return acc;
    }, {} as Record<string, { profit: number, staked: number, count: number }>);

    return {
        bankroll: state.bankroll,
        totalProfit,
        roi,
        winRate,
        betCount,
        wonBetsCount: wonBets.length,
        lostBetsCount,
        turnover: totalStaked,
        // FIX: Rewrite map function without spread to avoid potential type inference issues.
        profitBySport: Object.entries(statsBySport).map(([sport, data]) => ({ 
            sport, 
            profit: data.profit, 
            count: data.count, 
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0
        })),
        profitByBetType: Object.entries(statsByBetType).map(([type, data]) => ({ 
            type, 
            profit: data.profit, 
            count: data.count, 
            roi: data.staked > 0 ? (data.profit / data.staked) * 100 : 0
        })),
        period,
    };
}

export function analyticsToText(analytics: AnalyticsData): string {
    return `
Вот сводные данные по ставкам пользователя для анализа:
- Общая прибыль: ${analytics.totalProfit.toFixed(2)}
- ROI: ${analytics.roi.toFixed(2)}%
- Количество ставок: ${analytics.betCount}
- Процент выигрышей: ${analytics.winRate.toFixed(2)}%
- Прибыль по видам спорта: ${JSON.stringify(analytics.profitBySport.map(p => `${p.sport}: ${p.profit.toFixed(2)}`))}
- Прибыль по типам ставок: ${JSON.stringify(analytics.profitByBetType.map(p => `${p.type}: ${p.profit.toFixed(2)}`))}
    `;
}

export function formatShortReportText(analytics: AnalyticsData): string {
    const profitSign = analytics.totalProfit >= 0 ? '+' : '';
    const periodText = periodLabels[analytics.period];

    return `*📊 Ваша статистика (${periodText})*
    
- 💰 *Текущий банк:* ${analytics.bankroll.toFixed(2)} ₽
- ${analytics.totalProfit >= 0 ? '📈' : '📉'} *Общая прибыль:* ${profitSign}${analytics.totalProfit.toFixed(2)} ₽
- 🎯 *ROI:* ${analytics.roi.toFixed(2)}%
- 🔄 *Оборот:* ${analytics.turnover.toFixed(2)} ₽
- 🏆 *Процент побед:* ${analytics.winRate.toFixed(2)}%
- ✅ *Выигрыши:* ${analytics.wonBetsCount} | ❌ *Проигрыши:* ${analytics.lostBetsCount}
- 📋 *Всего ставок:* ${analytics.betCount}`;
}

export function formatDetailedReportText(analytics: AnalyticsData): string {
    let text = formatShortReportText(analytics);
    text += '\n\n*Прибыль по видам спорта:*\n';
    if(analytics.profitBySport.length > 0) {
        analytics.profitBySport.sort((a,b) => b.profit - a.profit).forEach(s => {
             const sign = s.profit >= 0 ? '+' : '';
             text += `- ${s.sport}: ${sign}${s.profit.toFixed(2)} ₽ (ROI: ${s.roi.toFixed(1)}%)\n`;
        });
    } else {
        text += '_Нет данных_\n';
    }

    return text;
}

export function generateAnalyticsHtml(analytics: AnalyticsData): string {
    const styles = `<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#111827;color:#e5e7eb;padding:2rem}div{background-color:#1f2937;border:1px solid #374151;border-radius:0.75rem;padding:1.5rem;margin-bottom:1.5rem}h1,h2{color:white}h1{font-size:2rem}h2{border-bottom:1px solid #374151;padding-bottom:0.5rem;margin-top:2rem}ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #374151}span:last-child{font-weight:600}.profit{color:#4ade80}.loss{color:#f87171}</style>`;
    const periodText = periodLabels[analytics.period];
    
    let body = `<h1>📊 Отчет BetDiary (${periodText})</h1>`;
    body += `<div><h2>Общая сводка</h2><ul>`;
    body += `<li><span>Текущий банк</span><span>${analytics.bankroll.toFixed(2)} ₽</span></li>`;
    body += `<li><span>Общая прибыль</span><span class="${analytics.totalProfit >= 0 ? 'profit' : 'loss'}">${analytics.totalProfit.toFixed(2)} ₽</span></li>`;
    body += `<li><span>ROI</span><span class="${analytics.roi >= 0 ? 'profit' : 'loss'}">${analytics.roi.toFixed(2)}%</span></li>`;
    body += `<li><span>Процент побед</span><span>${analytics.winRate.toFixed(2)}%</span></li>`;
    body += `<li><span>Всего ставок</span><span>${analytics.betCount}</span></li>`;
    body += `</ul></div>`;
    
    body += `<div><h2>Прибыль по спортам</h2><ul>`;
    analytics.profitBySport.sort((a,b) => b.profit - a.profit).forEach(s => {
        body += `<li><span>${s.sport} (${s.count} ставок)</span><span class="${s.profit >= 0 ? 'profit' : 'loss'}">${s.profit.toFixed(2)} ₽ (ROI: ${s.roi.toFixed(1)}%)</span></li>`;
    });
    body += `</ul></div>`;

    return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Отчет BetDiary</title>${styles}</head><body>${body}</body></html>`;
}