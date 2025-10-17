// functions/telegram/analytics.ts
import { UserState, BetStatus, Bet } from './types';
import { BET_TYPE_OPTIONS } from '../constants';

// Helper to calculate analytics data from user state
function calculateAnalytics(state: UserState) {
    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won);
    const lostBets = settledBets.filter(b => b.status === BetStatus.Lost);
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets.length / nonVoidBets.length) * 100 : 0;

    const statsBySport = settledBets.reduce((acc, bet) => {
        if (!acc[bet.sport]) acc[bet.sport] = { profit: 0, staked: 0, wins: 0, losses: 0 };
        acc[bet.sport].profit += bet.profit ?? 0;
        acc[bet.sport].staked += bet.stake;
        if (bet.status === BetStatus.Won) acc[bet.sport].wins++;
        if (bet.status === BetStatus.Lost) acc[bet.sport].losses++;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number; wins: number; losses: number } });

    const statsByBetType = settledBets.reduce((acc, bet) => {
        const typeLabel = BET_TYPE_OPTIONS.find(o => o.value === bet.betType)?.label || bet.betType;
        if (!acc[typeLabel]) acc[typeLabel] = { profit: 0, staked: 0 };
        acc[typeLabel].profit += bet.profit ?? 0;
        acc[typeLabel].staked += bet.stake;
        return acc;
    }, {} as { [key: string]: { profit: number; staked: number } });

    const oddsRanges = [
        { label: '1.0-1.5', min: 1, max: 1.5, bets: [] as Bet[] },
        { label: '1.5-2.0', min: 1.5, max: 2.0, bets: [] as Bet[] },
        { label: '2.0-2.5', min: 2.0, max: 2.5, bets: [] as Bet[] },
        { label: '2.5+', min: 2.5, max: Infinity, bets: [] as Bet[] },
    ];
    settledBets.forEach(bet => {
        const range = oddsRanges.find(r => bet.odds >= r.min && bet.odds < r.max);
        if (range) range.bets.push(bet);
    });

    return {
        bankroll: state.bankroll,
        totalProfit,
        roi,
        turnover: totalStaked,
        totalBets: settledBets.length,
        winRate,
        wonBetsCount: wonBets.length,
        lostBetsCount: lostBets.length,
        statsBySport,
        statsByBetType,
        oddsRanges,
    };
}


export function generateShortStatsReport(state: UserState): string {
    if (!state.user) return "Пожалуйста, сначала привяжите свой аккаунт.";
    if (state.bets.filter(b => b.status !== BetStatus.Pending).length === 0) {
        return "У вас пока нет рассчитанных ставок для отображения статистики.";
    }

    const analytics = calculateAnalytics(state);
    const profitSign = analytics.totalProfit >= 0 ? '+' : '';
    const profitEmoji = analytics.totalProfit >= 0 ? '📈' : '📉';

    return `*📊 Ваша статистика*

- 💰 *Текущий банк:* ${analytics.bankroll.toFixed(2)} ₽
- ${profitEmoji} *Общая прибыль:* ${profitSign}${analytics.totalProfit.toFixed(2)} ₽
- 🎯 *ROI:* ${analytics.roi.toFixed(2)}%
- 🔄 *Оборот:* ${analytics.turnover.toFixed(2)} ₽
- 🎲 *Всего ставок:* ${analytics.totalBets}
- ✅ *Выигрыши:* ${analytics.wonBetsCount} | ❌ *Проигрыши:* ${analytics.lostBetsCount}
- 📈 *Процент побед:* ${analytics.winRate.toFixed(2)}%`;
}


export function generateDetailedReport(state: UserState): string {
    const analytics = calculateAnalytics(state);
    const profitSign = analytics.totalProfit >= 0 ? '+' : '';
    const profitEmoji = analytics.totalProfit >= 0 ? '📈' : '📉';

    let report = `*📝 Ваш подробный отчет*

*Ключевые показатели:*
- 💰 *Банк:* ${analytics.bankroll.toFixed(2)} ₽
- ${profitEmoji} *Прибыль:* ${profitSign}${analytics.totalProfit.toFixed(2)} ₽
- 🎯 *ROI:* ${analytics.roi.toFixed(2)}%
- 🔄 *Оборот:* ${analytics.turnover.toFixed(2)} ₽
- 🎲 *Всего ставок:* ${analytics.totalBets}
- 📈 *Процент побед:* ${analytics.winRate.toFixed(2)}%
- ✅ *Выигрыши / ❌ Проигрыши:* ${analytics.wonBetsCount} / ${analytics.lostBetsCount}
`;

    report += "\n*Прибыль по видам спорта:*\n";
    Object.entries(analytics.statsBySport).forEach(([sport, data]) => {
        const roi = data.staked > 0 ? (data.profit / data.staked) * 100 : 0;
        report += `- ${sport}: ${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)} ₽ (ROI: ${roi.toFixed(1)}%)\n`;
    });

    report += "\n*Прибыль по типам ставок:*\n";
    Object.entries(analytics.statsByBetType).forEach(([type, data]) => {
        const roi = data.staked > 0 ? (data.profit / data.staked) * 100 : 0;
        report += `- ${type}: ${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)} ₽ (ROI: ${roi.toFixed(1)}%)\n`;
    });

    report += "\n*В/П по видам спорта:*\n";
    Object.entries(analytics.statsBySport).forEach(([sport, data]) => {
        report += `- ${sport}: ${data.wins} В / ${data.losses} П\n`;
    });

    report += "\n*Проходимость по коэффициентам:*\n";
    analytics.oddsRanges.forEach(range => {
        const total = range.bets.length;
        if (total === 0) return;
        const wins = range.bets.filter(b => b.status === BetStatus.Won).length;
        const losses = range.bets.filter(b => b.status === BetStatus.Lost).length;
        const passRate = total > 0 ? (wins / (wins + losses)) * 100 : 0;
        const staked = range.bets.reduce((acc, b) => acc + b.stake, 0);
        const profit = range.bets.reduce((acc, b) => acc + (b.profit ?? 0), 0);
        const roi = staked > 0 ? (profit / staked) * 100 : 0;
        report += `- ${range.label}: ${passRate.toFixed(1)}% проход (${wins}В/${losses}П) | ROI: ${roi.toFixed(1)}%\n`;
    });

    return report;
}


export function generateHtmlReport(state: UserState): string {
    const analytics = calculateAnalytics(state);
    const profitSign = analytics.totalProfit >= 0 ? '+' : '';
    const profitEmoji = analytics.totalProfit >= 0 ? '📈' : '📉';

    const tableRow = (cells: string[]) => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    const headerRow = (cells: string[]) => `<tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr>`;

    const body = `
        <h1>📊 Отчет по ставкам</h1>
        <p>Сгенерировано: ${new Date().toLocaleString('ru-RU')}</p>
        
        <h2>Ключевые показатели</h2>
        <div class="kpi-grid">
            <div class="kpi-card"><span>💰 Банк</span><strong>${analytics.bankroll.toFixed(2)} ₽</strong></div>
            <div class="kpi-card"><span>${profitEmoji} Прибыль</span><strong class="${analytics.totalProfit >= 0 ? 'green' : 'red'}">${profitSign}${analytics.totalProfit.toFixed(2)} ₽</strong></div>
            <div class="kpi-card"><span>🎯 ROI</span><strong class="${analytics.roi >= 0 ? 'green' : 'red'}">${analytics.roi.toFixed(2)}%</strong></div>
            <div class="kpi-card"><span>🔄 Оборот</span><strong>${analytics.turnover.toFixed(2)} ₽</strong></div>
            <div class="kpi-card"><span>🎲 Всего ставок</span><strong>${analytics.totalBets}</strong></div>
            <div class="kpi-card"><span>📈 % побед</span><strong>${analytics.winRate.toFixed(2)}%</strong></div>
            <div class="kpi-card"><span>✅/❌</span><strong>${analytics.wonBetsCount} / ${analytics.lostBetsCount}</strong></div>
        </div>

        <h2>Прибыль по категориям</h2>
        <div class="table-grid">
            <div>
                <h3>По видам спорта</h3>
                <table>
                    <thead>${headerRow(['Спорт', 'Прибыль', 'ROI'])}</thead>
                    <tbody>
                        ${Object.entries(analytics.statsBySport).map(([sport, data]) => {
                            const roi = data.staked > 0 ? (data.profit / data.staked) * 100 : 0;
                            return tableRow([sport, `${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)} ₽`, `${roi.toFixed(1)}%`]);
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div>
                <h3>По типам ставок</h3>
                <table>
                     <thead>${headerRow(['Тип', 'Прибыль', 'ROI'])}</thead>
                     <tbody>
                        ${Object.entries(analytics.statsByBetType).map(([type, data]) => {
                            const roi = data.staked > 0 ? (data.profit / data.staked) * 100 : 0;
                            return tableRow([type, `${data.profit >= 0 ? '+' : ''}${data.profit.toFixed(2)} ₽`, `${roi.toFixed(1)}%`]);
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <h2>Проходимость</h2>
        <div class="table-grid">
             <div>
                <h3>В/П по видам спорта</h3>
                <table>
                    <thead>${headerRow(['Спорт', 'Выигрыши', 'Проигрыши'])}</thead>
                    <tbody>
                        ${Object.entries(analytics.statsBySport).map(([sport, data]) => 
                            tableRow([sport, String(data.wins), String(data.losses)])
                        ).join('')}
                    </tbody>
                </table>
            </div>
            <div>
                <h3>По коэффициентам</h3>
                <table>
                    <thead>${headerRow(['Коэф.', 'Проход', 'В/П', 'ROI'])}</thead>
                    <tbody>
                        ${analytics.oddsRanges.map(range => {
                            const total = range.bets.length;
                            if (total === 0) return '';
                            const wins = range.bets.filter(b => b.status === BetStatus.Won).length;
                            const losses = range.bets.filter(b => b.status === BetStatus.Lost).length;
                            const passRate = total > 0 ? (wins / (wins + losses)) * 100 : 0;
                             const staked = range.bets.reduce((acc, b) => acc + b.stake, 0);
                             const profit = range.bets.reduce((acc, b) => acc + (b.profit ?? 0), 0);
                             const roi = staked > 0 ? (profit / staked) * 100 : 0;
                            return tableRow([range.label, `${passRate.toFixed(1)}%`, `${wins}/${losses}`, `${roi.toFixed(1)}%`]);
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const html = `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Отчет BetDiary</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #111827; color: #d1d5db; margin: 0; padding: 2rem; }
            h1, h2, h3 { color: #fff; border-bottom: 1px solid #374151; padding-bottom: 0.5rem; }
            .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
            .kpi-card { background-color: #1f2937; padding: 1rem; border-radius: 0.5rem; text-align: center; border: 1px solid #374151; }
            .kpi-card span { font-size: 0.9rem; color: #9ca3af; }
            .kpi-card strong { display: block; font-size: 1.5rem; color: #fff; }
            .table-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #374151; }
            th { background-color: #374151; color: #fff; }
            tbody tr:hover { background-color: #374151; }
            .green { color: #4ade80; } .red { color: #f87171; }
            @media (max-width: 768px) { .table-grid { grid-template-columns: 1fr; } }
        </style>
    </head>
    <body>${body}</body>
    </html>`;

    return html;
}
