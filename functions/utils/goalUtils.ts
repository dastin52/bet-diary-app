// functions/utils/goalUtils.ts
import { Bet, Goal, GoalMetric, GoalStatus, BetStatus } from '../telegram/types';

const calculateMetric = (metric: GoalMetric, bets: Bet[]): number => {
    if (bets.length === 0) return 0;

    switch (metric) {
        case GoalMetric.Profit:
            return bets.reduce((acc, b) => acc + (b.profit ?? 0), 0);
        case GoalMetric.ROI: {
            const totalStaked = bets.reduce((acc, b) => acc + b.stake, 0);
            if (totalStaked === 0) return 0;
            const totalProfit = bets.reduce((acc, b) => acc + (b.profit ?? 0), 0);
            return (totalProfit / totalStaked) * 100;
        }
        case GoalMetric.WinRate: {
            const nonVoidBets = bets.filter(b => b.status !== BetStatus.Void);
            if (nonVoidBets.length === 0) return 0;
            const wonBets = nonVoidBets.filter(b => b.status === BetStatus.Won).length;
            return (wonBets / nonVoidBets.length) * 100;
        }
        case GoalMetric.BetCount:
            return bets.length;
        default:
            return 0;
    }
};

export const updateGoalProgress = (goal: Goal, allSettledBets: Bet[]): Goal => {
    const relevantBets = allSettledBets.filter(bet => {
        if (!goal || !goal.scope) return false;
        if (new Date(bet.createdAt) < new Date(goal.createdAt)) return false;

        if (goal.scope.type === 'all') return true;
        if (goal.scope.type === 'sport' && bet.sport === goal.scope.value) return true;
        if (goal.scope.type === 'betType' && bet.betType === goal.scope.value) return true;
        if (goal.scope.type === 'tag' && bet.tags?.includes(goal.scope.value!)) return true;
        return false;
    });

    const currentValue = calculateMetric(goal.metric, relevantBets);
    let status = goal.status;

    if (status === GoalStatus.InProgress) {
        if (goal.targetValue >= 0 && currentValue >= goal.targetValue) {
            status = GoalStatus.Achieved;
        } else if (goal.targetValue < 0 && currentValue <= goal.targetValue) { // For loss-limiting goals
             status = GoalStatus.Achieved;
        } else if (new Date() > new Date(goal.deadline)) {
            status = GoalStatus.Failed;
        }
    }

    return { ...goal, currentValue, status };
};

export const getGoalProgress = (goal: Goal): { percentage: number, label: string } => {
    let percentage = 0;
    
    if (goal.targetValue > 0) {
        percentage = (goal.currentValue / goal.targetValue) * 100;
    } else if (goal.targetValue === 0) {
        percentage = goal.currentValue >= 0 ? 100 : 0;
    } else { // targetValue is negative (e.g., limit loss to -500)
        if (goal.currentValue >= 0) {
            percentage = 0;
        } else {
            percentage = (goal.currentValue / goal.targetValue) * 100;
        }
    }
    
    let label = '';
    switch (goal.metric) {
        case GoalMetric.Profit:
            label = `${goal.currentValue.toFixed(2)} / ${goal.targetValue.toFixed(2)} ₽`;
            break;
        case GoalMetric.ROI:
        case GoalMetric.WinRate:
            label = `${goal.currentValue.toFixed(2)}% / ${goal.targetValue.toFixed(2)}%`;
            break;
        case GoalMetric.BetCount:
            label = `${Math.floor(goal.currentValue)} / ${goal.targetValue}`;
            break;
    }
    return { percentage: Math.max(0, Math.min(100, percentage)), label };
};