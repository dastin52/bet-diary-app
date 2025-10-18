// functions/telegram/analytics.ts
import { BetStatus, UserState } from './types';

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
    
    const statsBySport = settledBets.reduce((acc: Record<string, { profit: number, staked: number, count: number }>, bet) => {
        if (!acc[bet.sport]) acc[bet.sport] = { profit: 0, staked: 0, count: 0 };
        acc[bet.sport].profit += bet.profit ?? 0;
        acc[bet.sport].staked += bet.stake;
        acc[bet.sport].count += 1;
        return acc;
    }, {});

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
    
    let body = `<h1>📊 Отчет BetDiary</h1>`;
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