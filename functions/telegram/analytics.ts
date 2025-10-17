// functions/telegram/analytics.ts
import { TelegramMessage, Env, UserState, BetStatus } from './types';
import { sendMessage } from './telegramApi';
import { makeKeyboard } from './ui';
import { CB } from './router';

export async function showAnalytics(message: TelegramMessage, state: UserState, env: Env) {
    const chatId = message.chat.id;

    const settledBets = state.bets.filter(b => b.status !== BetStatus.Pending);
    if (settledBets.length === 0) {
        await sendMessage(chatId, "У вас пока нет рассчитанных ставок для отображения статистики.", env);
        return;
    }
    
    const totalStaked = settledBets.reduce((acc, bet) => acc + bet.stake, 0);
    const totalProfit = settledBets.reduce((acc, bet) => acc + (bet.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const wonBets = settledBets.filter(b => b.status === BetStatus.Won).length;
    const lostBets = settledBets.filter(b => b.status === BetStatus.Lost).length;
    const nonVoidBets = settledBets.filter(b => b.status !== BetStatus.Void);
    const winRate = nonVoidBets.length > 0 ? (wonBets / nonVoidBets.length) * 100 : 0;

    const statsBySport = settledBets.reduce((acc, bet) => {
        if (!acc[bet.sport]) acc[bet.sport] = { profit: 0, count: 0 };
        acc[bet.sport].profit += bet.profit ?? 0;
        acc[bet.sport].count++;
        return acc;
    }, {} as { [key: string]: { profit: number, count: number } });

    const topSport = Object.entries(statsBySport).sort(([,a], [,b]) => b.profit - a.profit)[0];

    const statsText = `*📊 Расширенная аналитика*

*Общая картина:*
- *Текущий банк:* ${state.bankroll.toFixed(2)} ₽
- *Общая прибыль:* ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} ₽
- *ROI:* ${roi.toFixed(2)}%
- *W/L:* ${wonBets} / ${lostBets} (${winRate.toFixed(2)}%)
- *Всего рассчитанных ставок:* ${settledBets.length}

*Инсайты:*
- *Самый прибыльный спорт:* ${topSport ? `${topSport[0]} (${topSport[1].profit > 0 ? '+' : ''}${topSport[1].profit.toFixed(2)} ₽)` : 'Нет данных'}
`;

    await sendMessage(chatId, statsText, env, makeKeyboard([[{text: '◀️ Главное меню', callback_data: CB.BACK_TO_MAIN}]]));
}
