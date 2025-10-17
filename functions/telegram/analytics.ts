// functions/telegram/analytics.ts
import { UserState, BetStatus } from './types';

export function generateStatsReport(state: UserState): string {
    if (!state.user) {
        return "Пожалуйста, сначала привяжите свой аккаунт.";
    }

    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    if (settledBets.length === 0) {
        return "У вас пока нет рассчитанных ставок для отображения статистики.";
    }

    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    return `*📊 Ваша статистика*

- *Текущий банк:* ${state.bankroll.toFixed(2)} ₽
- *Общая прибыль:* ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽
- *ROI:* ${roi.toFixed(2)}%
- *Процент выигрышей:* ${winRate.toFixed(2)}%
- *Всего рассчитанных ставок:* ${settledBets.length}`;
}
