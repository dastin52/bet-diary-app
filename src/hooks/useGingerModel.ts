import { useMemo, useCallback, useState } from 'react';
import { Bet, BetStatus, AIPrediction, AIPredictionStatus } from '../types';
import { resolveMarketOutcome } from '../utils/predictionUtils';

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


export const useGingerModel = (allPredictions: AIPrediction[]) => {
    const [retrainCounter, setRetrainCounter] = useState(0);

    const learnedPatterns = useMemo(() => {
        console.log(`[Ginger] Retraining model on AI predictions... (Trigger: ${retrainCounter})`);
        
        // Use predictions with known outcomes
        const settledPredictions = allPredictions.filter(p => p.status !== AIPredictionStatus.Pending && p.matchResult);
        
        const patternStats: Record<string, { staked: number, profit: number, count: number }> = {};

        settledPredictions.forEach(prediction => {
            try {
                const data = JSON.parse(prediction.prediction);
                const marketAnalysis = data.market_analysis;
                
                if (!marketAnalysis || !prediction.matchResult) return;

                for (const market in marketAnalysis) {
                    const marketData = marketAnalysis[market];
                    const key = `${prediction.sport}#${market}`;

                    if (!patternStats[key]) {
                        patternStats[key] = { staked: 0, profit: 0, count: 0 };
                    }
                    
                    const stake = 1; // Assume a flat 1-unit stake for analysis
                    let profit = 0;
                    
                    // Resolve outcome for this specific market
                    const result = resolveMarketOutcome(market, prediction.matchResult.scores, prediction.matchResult.winner);

                    if (result === 'correct') {
                        const coefficient = marketData.coefficient || 1.0;
                        profit = stake * (coefficient - 1);
                    } else if (result === 'incorrect') {
                        profit = -stake;
                    }

                    // Only count markets that were resolved
                    if (result !== 'unknown') {
                        patternStats[key].staked += stake;
                        patternStats[key].profit += profit;
                        patternStats[key].count += 1;
                    }
                }
            } catch (e) {
                // Ignore predictions with invalid JSON
            }
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
    }, [allPredictions, retrainCounter]);

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
