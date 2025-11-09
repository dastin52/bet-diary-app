import { useMemo, useCallback, useState } from 'react';
import { Bet, BetStatus, AIPrediction } from '../types';

interface LearnedPattern {
    key: string;
    sport: string;
    market: string;
    roi: number;
    count: number;
}

const scaleRoiToConfidence = (roi: number): number => {
    // This function maps an ROI value to a 0-100 confidence score.
    // Highly positive ROI -> high confidence
    // Highly negative ROI -> low confidence
    // ROI around 0 -> medium confidence (50)
    
    if (roi > 25) return 95; // Very high confidence for excellent ROI
    if (roi > 10) return 80;
    if (roi > 5) return 65;
    if (roi > -5) return 50; // Neutral zone
    if (roi > -15) return 35;
    if (roi > -30) return 20;
    return 10; // Very low confidence for poor ROI
};


export const useGingerModel = (allBets: Bet[]) => {
    const [retrainCounter, setRetrainCounter] = useState(0);

    const learnedPatterns = useMemo(() => {
        console.log(`[Ginger] Retraining model... (Trigger: ${retrainCounter})`);
        const settledBets = allBets.filter(b => b.status !== BetStatus.Pending && b.status !== BetStatus.Void);
        
        const patternStats: Record<string, { staked: number, profit: number, count: number }> = {};

        settledBets.forEach(bet => {
            bet.legs.forEach(leg => {
                const key = `${bet.sport}#${leg.market}`;
                if (!patternStats[key]) {
                    patternStats[key] = { staked: 0, profit: 0, count: 0 };
                }
                // For parlays, we distribute the stake and profit across legs to evaluate market performance
                const effectiveStake = bet.stake / bet.legs.length;
                const effectiveProfit = (bet.profit || 0) / bet.legs.length;
                
                patternStats[key].staked += effectiveStake;
                patternStats[key].profit += effectiveProfit;
                patternStats[key].count += 1;
            });
        });
        
        const patterns: LearnedPattern[] = Object.entries(patternStats).map(([key, stats]) => {
            const [sport, market] = key.split('#');
            return {
                key,
                sport,
                market,
                roi: stats.staked > 0 ? (stats.profit / stats.staked) * 100 : 0,
                count: stats.count
            };
        });

        return patterns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allBets, retrainCounter]);

    const patternMap = useMemo(() => {
        return new Map(learnedPatterns.map(p => [p.key, p]));
    }, [learnedPatterns]);

    const getConfidenceForPrediction = useCallback((prediction: AIPrediction): number | null => {
        try {
            const data = JSON.parse(prediction.prediction);
            const outcome = data.most_likely_outcome || data.recommended_outcome;
            if (!outcome || outcome === 'N/A' || outcome === 'Нет выгодной ставки') return null;

            const key = `${prediction.sport}#${outcome}`;
            const pattern = patternMap.get(key);
            
            // If we have seen this pattern at least 3 times, use its ROI. Otherwise, neutral.
            if (pattern && pattern.count >= 3) {
                return scaleRoiToConfidence(pattern.roi);
            }
            
            return 50; // Neutral confidence for unknown patterns

        } catch {
            return null; // Cannot parse prediction
        }
    }, [patternMap]);

    const retrain = useCallback(() => {
        setRetrainCounter(c => c + 1);
    }, []);

    return { learnedPatterns, getConfidenceForPrediction, retrain };
};
