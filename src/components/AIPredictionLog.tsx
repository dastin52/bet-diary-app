import React, { useMemo, useState, useEffect } from 'react';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus, SharedPrediction } from '../types';
import Select from './ui/Select';
import { usePredictionContext } from '../contexts/PredictionContext';
import { useBetContext } from '../contexts/BetContext';
import Button from './ui/Button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { AIPredictionAccuracyTooltip } from './charts/ChartTooltip';


const SPORT_MAP: Record<string, string> = {
    football: 'Футбол',
    basketball: 'Баскетбол',
    hockey: 'Хоккей',
    nba: 'NBA',
    Футбол: 'Футбол',
    Баскетбол: 'Баскетбол',
    Хоккей: 'Хоккей',
};

const getStatusInfo = (status: AIPredictionStatus): { label: string; color: string } => {
    switch (status) {
        case AIPredictionStatus.Correct: return { label: 'Верно', color: 'bg-green-500/20 text-green-400' };
        case AIPredictionStatus.Incorrect: return { label: 'Неверно', color: 'bg-red-500/20 text-red-400' };
        default: return { label: 'В ожидании', color: 'bg-yellow-500/20 text-yellow-400' };
    }
};

const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;


const PredictionDetails: React.FC<{ prediction: string }> = ({ prediction }) => {
    try {
        const data = JSON.parse(prediction);
        if (!data.probabilities) return <span className="text-gray-400 text-xs">{prediction}</span>;

        const mainOutcome = data.recommended_outcome;
        const coefficients = data.coefficients;

        return (
            <div className="text-xs space-y-1">
                <p>
                    <span className="font-bold text-white">Рекомендация: {mainOutcome}</span>
                    <span className="text-gray-300"> ({data.probabilities[mainOutcome]}%)</span>
                     {coefficients && coefficients[mainOutcome] && <span className="text-amber-400 text-xs ml-2 font-mono">~{coefficients[mainOutcome].toFixed(2)}</span>}
                </p>
                <div className="text-gray-400 grid grid-cols-2 gap-x-2">
                    {Object.entries(data.probabilities)
                        .filter(([key]) => key !== mainOutcome)
                        .map(([key, value]) => (
                            <div key={key}>
                                <span>{key}: {value as number}%</span>
                                {coefficients && coefficients[key] && <span className="text-amber-400/70 text-xs ml-1 font-mono">~{coefficients[key].toFixed(2)}</span>}
                            </div>
                        ))}
                </div>
            </div>
        )

    } catch (e) {
        return <span className="text-gray-300 whitespace-pre-wrap text-xs">{prediction.replace(/\*/g, '').trim()}</span>;
    }
}

const resolveMarketOutcome = (market: string, scores: { home: number; away: number }): 'correct' | 'incorrect' | 'unknown' => {
    const { home, away } = scores;
    const total = home + away;

    switch (market) {
        case 'П1': return home > away ? 'correct' : 'incorrect';
        case 'X': return home === away ? 'correct' : 'incorrect';
        case 'П2': return away > home ? 'correct' : 'incorrect';
        case '1X': return home >= away ? 'correct' : 'incorrect';
        case 'X2': return away >= home ? 'correct' : 'incorrect';
        case 'Обе забьют - Да': return home > 0 && away > 0 ? 'correct' : 'incorrect';
        case 'Обе забьют - Нет': return home === 0 || away === 0 ? 'correct' : 'incorrect';
        default:
            const totalMatch = market.match(/Тотал (Больше|Меньше) (\d+(\.\d+)?)/);
            if (totalMatch) {
                const type = totalMatch[1];
                const value = parseFloat(totalMatch[2]);
                if (type === 'Больше') return total > value ? 'correct' : 'incorrect';
                if (type === 'Меньше') return total < value ? 'correct' : 'incorrect';
            }
            return 'unknown';
    }
};

type EnhancedAIPrediction = AIPrediction & { leagueName?: string };

const AIPredictionLog: React.FC = () => {
    const { predictions: centralPredictions, isLoading, setSport, activeSport } = usePredictionContext();
    const { aiPredictions: personalPredictions, updateAIPrediction } = useBetContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [leagueFilter, setLeagueFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    useEffect(() => {
        const finishedMatches = centralPredictions.filter(p => p.winner && p.scores);
        if (finishedMatches.length === 0) return;

        const pendingPersonalPredictions = personalPredictions.filter(p => p.status === AIPredictionStatus.Pending);
        if (pendingPersonalPredictions.length === 0) return;

        pendingPersonalPredictions.forEach(prediction => {
            const finishedMatch = finishedMatches.find(m => m.teams === prediction.matchName && (SPORT_MAP[m.sport] === prediction.sport || m.sport === prediction.sport));
            
            if (finishedMatch && finishedMatch.scores) {
                let recommendedOutcome: string | null = null;
                try {
                    const predictionData = JSON.parse(prediction.prediction);
                    recommendedOutcome = predictionData?.recommended_outcome || null;
                } catch (e) { return; }

                if (!recommendedOutcome) return;
                
                const result = resolveMarketOutcome(recommendedOutcome, finishedMatch.scores);

                if (result !== 'unknown') {
                    const newStatus = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                     updateAIPrediction(prediction.id, {
                        status: newStatus,
                        matchResult: { winner: finishedMatch.winner!, scores: finishedMatch.scores }
                    });
                }
            }
        });
    }, [centralPredictions, personalPredictions, updateAIPrediction]);

    const combinedAndEnhancedPredictions = useMemo(() => {
        const predictionsMap = new Map<string, EnhancedAIPrediction>();

        // First, add central predictions, which have league info
        centralPredictions.forEach(p => {
            if (p.prediction) {
                predictionsMap.set(p.teams, { ...p.prediction, leagueName: p.eventName });
            }
        });

        // Then, add or update with personal predictions
        personalPredictions.forEach(p => {
            const existing = predictionsMap.get(p.matchName);
            if (existing) {
                // If a personal prediction exists for a central one, update it
                // but keep the league name from the central one.
                predictionsMap.set(p.matchName, { ...p, leagueName: existing.leagueName });
            } else {
                // If it's a unique personal prediction, add it with a default league.
                predictionsMap.set(p.matchName, { ...p, leagueName: 'Личные' });
            }
        });

        return Array.from(predictionsMap.values())
            .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [centralPredictions, personalPredictions]);

    const { availableOutcomes, availableLeagues } = useMemo(() => {
        const outcomes = new Set<string>();
        const leagues = new Set<string>();
        combinedAndEnhancedPredictions.forEach(p => {
            if (p.leagueName) leagues.add(p.leagueName);
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities) {
                    Object.keys(data.probabilities).forEach(key => outcomes.add(key));
                }
            } catch {}
        });
        return { 
            availableOutcomes: Array.from(outcomes).sort(),
            availableLeagues: Array.from(leagues).sort()
        };
    }, [combinedAndEnhancedPredictions]);

    const filteredPredictions = useMemo(() => {
        return combinedAndEnhancedPredictions.filter(p => {
            const sportMatch = sportFilter === 'all' || (SPORT_MAP[p.sport] === sportFilter) || p.sport === sportFilter;
            const leagueMatch = leagueFilter === 'all' || p.leagueName === leagueFilter;

            let outcomeMatch = outcomeFilter === 'all';
            if (outcomeFilter !== 'all') {
                 try {
                    const data = JSON.parse(p.prediction);
                    outcomeMatch = (outcomeFilter in data.probabilities) || (data.recommended_outcome === outcomeFilter);
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && leagueMatch && outcomeMatch;
        });
    }, [combinedAndEnhancedPredictions, sportFilter, leagueFilter, outcomeFilter]);
    
    const { stats, deepAnalytics } = useMemo(() => {
        const settled = filteredPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correctPredictions = settled.filter(p => p.status === AIPredictionStatus.Correct);
        
        const total = settled.length;
        const accuracy = total > 0 ? (correctPredictions.length / total) * 100 : 0;
        
        const winningCoefficients = correctPredictions.reduce<number[]>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcome = data.recommended_outcome;
                const coeff = data.coefficients?.[outcome];
                if (typeof coeff === 'number') acc.push(coeff);
            } catch {}
            return acc;
        }, []);
        
        const avgCorrectCoefficient = winningCoefficients.length > 0
            ? winningCoefficients.reduce((sum, coeff) => sum + coeff, 0) / winningCoefficients.length
            : 0;
        
        // FIX: Explicitly type the accumulator with a generic to prevent `acc[outcome]` from being implicitly `any` and to ensure the final type is correct.
        const outcomeStats = settled.reduce<Record<string, { correct: number, total: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcome = data.recommended_outcome;
                if (outcome && ['П1', 'X', 'П2'].includes(outcome)) {
                    if (!acc[outcome]) acc[outcome] = { correct: 0, total: 0 };
                    acc[outcome].total++;
                    if (p.status === AIPredictionStatus.Correct) acc[outcome].correct++;
                }
            } catch {}
            return acc;
        }, { 'П1': { correct: 0, total: 0 }, 'X': { correct: 0, total: 0 }, 'П2': { correct: 0, total: 0 } });
        
        const accuracyByOutcome = Object.entries(outcomeStats).map(([outcome, data]) => ({
            outcome, accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0, count: data.total,
        }));
        
        const predictionsWithResults = filteredPredictions.filter(p => p.matchResult && p.matchResult.scores);
        // FIX: Explicitly type the accumulator with a generic to solve the `unknown` type issue on `data` in the subsequent `.map` call.
        const deepAnalyticsData = predictionsWithResults.reduce<Record<string, { correct: number, total: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities && p.matchResult) {
                    for (const market in