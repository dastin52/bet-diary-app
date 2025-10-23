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
import { SPORTS } from '../constants';


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
    const { predictions: centralPredictions, isLoading, fetchPredictions, activeSport } = usePredictionContext();
    const { aiPredictions: personalPredictions, updateAIPrediction } = useBetContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [leagueFilter, setLeagueFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');
    const [isChartExpanded, setIsChartExpanded] = useState(true);

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
    
    const { stats, deepAnalytics, accuracyChartData } = useMemo(() => {
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
        
        // FIX: Add an explicit type to the reduce accumulator to ensure correct type inference.
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
        
        // FIX: Add an explicit type to the reduce accumulator to ensure correct type inference.
        const deepAnalyticsData = predictionsWithResults.reduce<Record<string, { correct: number, total: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities && p.matchResult) {
                    for (const market in data.probabilities) {
                        if (!acc[market]) acc[market] = { correct: 0, total: 0 };
                        const result = resolveMarketOutcome(market, p.matchResult.scores);
                        if (result !== 'unknown') {
                            acc[market].total++;
                            if (result === 'correct') {
                                acc[market].correct++;
                            }
                        }
                    }
                }
            } catch {}
            return acc;
        }, {});
        
        const sortedDeepAnalytics = Object.entries(deepAnalyticsData)
            .map(([market, data]) => ({
                market,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                count: data.total,
            }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);
        
        const chartData = [...sortedDeepAnalytics].sort((a,b) => b.count - a.count).slice(0, 10);

        return {
            stats: { total, correct: correctPredictions.length, accuracy, avgCorrectCoefficient, accuracyByOutcome },
            deepAnalytics: sortedDeepAnalytics,
            accuracyChartData: chartData,
        };
    }, [filteredPredictions]);

    const handleRefresh = () => {
        fetchPredictions(activeSport, true);
    };

    const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                 <div></div>
                 <Button onClick={handleRefresh} variant="secondary">
                     <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M20 4l-4 4M4 20l4-4" /></svg>
                    Обновить
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Всего оценено" value={String(stats.total)} />
                <KpiCard title="Верных прогнозов" value={String(stats.correct)} />
                <KpiCard title="Общая точность" value={`${stats.accuracy.toFixed(1)}%`} colorClass={stats.accuracy >= 50 ? 'text-green-400' : 'text-red-400'}/>
                <KpiCard title="Средний верный коэф." value={stats.avgCorrectCoefficient.toFixed(2)} colorClass="text-amber-400" />
            </div>

             <Card>
                <h3 className="text-lg font-semibold mb-2">Точность по основным исходам</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {stats.accuracyByOutcome.map(({ outcome, accuracy, count }) => (
                         <div key={outcome} className="p-4 bg-gray-900/50 rounded-lg text-center">
                            <p className="text-sm text-gray-400">{outcome}</p>
                            <p className={`text-3xl font-bold mt-1 ${accuracy >= 50 ? 'text-green-400' : accuracy > 0 ? 'text-red-400' : 'text-gray-300'}`}>{accuracy.toFixed(1)}%</p>
                            <p className="text-xs text-gray-500 mt-1">{count} оценок</p>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-2">Глубокая аналитика по исходам</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {deepAnalytics.map(({ market, accuracy, count }) => (
                         <div key={market} className="p-3 bg-gray-900/50 rounded-lg text-center">
                            <p className="text-sm text-gray-400 truncate" title={market}>{market}</p>
                            <p className={`text-2xl font-bold mt-1 ${accuracy >= 50 ? 'text-green-400' : accuracy > 0 ? 'text-red-400' : 'text-gray-300'}`}>{accuracy.toFixed(1)}%</p>
                            <p className="text-xs text-gray-500 mt-1">{count} оценок</p>
                        </div>
                    ))}
                </div>
            </Card>

             <Card>
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsChartExpanded(!isChartExpanded)}>
                    <h3 className="text-lg font-semibold">Визуальный анализ точности</h3>
                    <ChevronIcon isOpen={isChartExpanded} />
                </div>
                 <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isChartExpanded ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <BarChart data={accuracyChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-20" />
                                <XAxis type="number" domain={[0, 100]} stroke="currentColor" className="text-xs text-gray-400" />
                                <YAxis type="category" dataKey="market" stroke="currentColor" className="text-xs text-gray-400" width={120} />
                                <Tooltip content={<AIPredictionAccuracyTooltip />} cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} />
                                <Bar dataKey="accuracy" name="Точность (%)">
                                    {accuracyChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.accuracy >= 50 ? '#48BB78' : '#F56565'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Журнал прогнозов</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Дата</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Матч</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Прогноз AI</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Статус</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-900 divide-y divide-gray-700">
                             {filteredPredictions.map(p => {
                                const status = getStatusInfo(p.status);
                                return (
                                    <tr key={p.id}>
                                        <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-white">{p.matchName}</p>
                                            <p className="text-xs text-gray-500">{p.sport}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <PredictionDetails prediction={p.prediction} />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                             <span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>{status.label}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => updateAIPrediction(p.id, { status: AIPredictionStatus.Correct })} className="p-1 rounded-full text-green-400 hover:bg-green-900/50"><CheckIcon/></button>
                                                <button onClick={() => updateAIPrediction(p.id, { status: AIPredictionStatus.Incorrect })} className="p-1 rounded-full text-red-400 hover:bg-red-900/50"><XIcon/></button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default AIPredictionLog;
