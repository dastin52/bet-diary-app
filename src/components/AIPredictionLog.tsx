import React, { useMemo, useState } from 'react';
import { usePredictionContext } from '../contexts/PredictionContext';
import { AIPrediction, AIPredictionStatus } from '../types';
import Card from './ui/Card';
import Select from './ui/Select';
import { SPORTS } from '../constants';

const SPORT_MAP: Record<string, string> = {
    football: 'Футбол',
    basketball: 'Баскетбол',
    hockey: 'Хоккей',
    nba: 'NBA',
};

const AIPredictionLog: React.FC = () => {
    const { allPredictions, isLoading } = usePredictionContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [leagueFilter, setLeagueFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const { availableLeagues, availableOutcomes } = useMemo(() => {
        const leagues = new Set<string>();
        const outcomes = new Set<string>();
        allPredictions.forEach(p => {
            if (p.prediction) {
                leagues.add(p.league.name);
                try {
                    const data = JSON.parse(p.prediction.prediction);
                    if (data.recommended_outcome) outcomes.add(data.recommended_outcome);
                } catch {}
            }
        });
        return { 
            availableLeagues: Array.from(leagues).sort(),
            availableOutcomes: Array.from(outcomes).sort()
        };
    }, [allPredictions]);
    
    const marketStats = useMemo(() => {
        const filtered = allPredictions.filter(p => {
            if (!p.prediction) return false;
            const sportName = SPORT_MAP[p.sport.toLowerCase()] || p.sport;
            const sportMatch = sportFilter === 'all' || sportName === sportFilter;
            const leagueMatch = leagueFilter === 'all' || p.league.name === leagueFilter;

            let outcomeMatch = outcomeFilter === 'all';
            if (!outcomeMatch) {
                try {
                    const data = JSON.parse(p.prediction.prediction);
                    outcomeMatch = data.recommended_outcome === outcomeFilter;
                } catch { outcomeMatch = false; }
            }
            return sportMatch && leagueMatch && outcomeMatch;
        });

        const settledPredictions = filtered
            .map(p => p.prediction)
            .filter((p): p is AIPrediction => p !== null && p.status !== AIPredictionStatus.Pending);

        const statsMap = new Map<string, { correct: number; total: number; oddsSum: number }>();

        settledPredictions.forEach(p => {
            try {
                const data = JSON.parse(p.prediction);
                const market = data.recommended_outcome;
                const odds = data.coefficients?.[market];

                if (!market || typeof odds !== 'number' || market === 'Нет выгодной ставки') return;

                if (!statsMap.has(market)) {
                    statsMap.set(market, { correct: 0, total: 0, oddsSum: 0 });
                }

                const marketData = statsMap.get(market)!;
                marketData.total++;
                marketData.oddsSum += odds;
                if (p.status === AIPredictionStatus.Correct) {
                    marketData.correct++;
                }
            } catch (e) {
                // Ignore predictions with invalid JSON
            }
        });

        return Array.from(statsMap.entries())
            .map(([market, data]) => ({
                market,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                avgOdds: data.total > 0 ? data.oddsSum / data.total : 0,
                count: data.total,
            }))
            .sort((a, b) => b.count - a.count);

    }, [allPredictions, sportFilter, leagueFilter, outcomeFilter]);

    const getPerfColor = (accuracy: number) => {
        if (accuracy >= 70) return 'text-green-400';
        if (accuracy >= 50) return 'text-lime-400';
        if (accuracy >= 40) return 'text-orange-400';
        return 'text-red-400';
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-400">Статистика по всем возможным исходам, отсортировано по количеству.</p>
            
            <Card>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Select value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
                        <option value="all">Все виды спорта</option>
                        {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                    <Select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)}>
                        <option value="all">Все лиги</option>
                        {availableLeagues.map(l => <option key={l} value={l}>{l}</option>)}
                    </Select>
                    <Select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
                        <option value="all">Все исходы</option>
                        {availableOutcomes.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                </div>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {marketStats.map(stat => (
                    <div key={stat.market} className="bg-gray-800 p-3 rounded-lg text-center flex flex-col border border-gray-700 h-full justify-between">
                        <p className="text-sm font-medium text-gray-300 h-10 flex items-center justify-center">{stat.market}</p>
                        <div className="my-2">
                            <span className={`text-3xl font-bold ${getPerfColor(stat.accuracy)}`}>
                                {stat.accuracy.toFixed(1)}%
                            </span>
                            <span className="text-lg text-gray-400 ml-1">
                                {stat.avgOdds.toFixed(2)}
                            </span>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500">{stat.count} оценок</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AIPredictionLog;