import { Bet, Goal, GoalMetric, GoalStatus, BetStatus } from '../types';

// This function calculates the current value of a goal based on a set of bets.
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

// This function updates a single goal's progress.
export const updateGoalProgress = (goal: Goal, allSettledBets: Bet[]): Goal => {
    const relevantBets = allSettledBets.filter(bet => {
        // Ensure goal and scope are defined before filtering
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
        if (currentValue >= goal.targetValue) {
            status = GoalStatus.Achieved;
        } else if (new Date() > new Date(goal.deadline)) {
            status = GoalStatus.Failed;
        }
    }

    return { ...goal, currentValue, status };
};

// This function gets display-ready progress information for a goal.
export const getGoalProgress = (goal: Goal): { percentage: number, label: string } => {
    // Handle cases where target is 0 to avoid division by zero.
    // Also handle cases where a user might set a negative profit goal (e.g., "lose no more than -500").
    let percentage = 0;
    if (goal.targetValue > 0) {
        percentage = (goal.currentValue / goal.targetValue) * 100;
    } else if (goal.targetValue === 0) {
        percentage = goal.currentValue >= 0 ? 100 : 0;
    } else { // targetValue is negative
        // If current is less than a negative target, it's "better", so percentage should be higher.
        // If current is -600 and target is -500, you are further away.
        // If current is -400 and target is -500, you are "20%" of the way there from 0.
        // This logic can be complex, a simple approach is to see how much of the negative goal is "filled".
        percentage = (goal.currentValue / goal.targetValue) * 100;
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
            label = `${goal.currentValue} / ${goal.targetValue}`;
            break;
    }
    // Clamp the percentage between 0 and 100 for display purposes.
    return { percentage: Math.max(0, Math.min(100, percentage)), label };
};
