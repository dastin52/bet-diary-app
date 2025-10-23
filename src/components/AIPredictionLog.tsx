import React, { useMemo, useState } from 'react';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPredictionStatus, SharedPrediction } from '../types';
import Select from './ui/Select';
import { usePredictionContext } from '../contexts/PredictionContext';

const SPORT_MAP: Record<string, string> = {
    football: 'Футбол',
    basketball: 'Баскетбол',
    hockey: 'Хоккей',
    nba: 'NBA',
};

const getStatusInfo = (status: AIPredictionStatus): { label: string; color: string } => {
    switch (status) {
        case AIPredictionStatus.Correct: return { label: 'Верно', color: 'bg-green-500/20 text-green-400' };
        case AIPredictionStatus.Incorrect: return { label: 'Неверно', color: 'bg-red-500/20 text-red-400' };
        default: return { label: 'В ожидании', color: 'bg-yellow-500/20 text-yellow-400' };
    }
};

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


const AIPredictionLog: React.FC = () => {
    const { predictions } = usePredictionContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const allAiPredictions = useMemo(() => 
        predictions.map(p => p.prediction).filter((p): p is NonNullable<typeof p> => p !== null), 
    [predictions]);

    const availableOutcomes = useMemo(() => {
        const outcomes = new Set<string>();
        allAiPredictions.forEach(p => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities) {
                    Object.keys(data.probabilities).forEach(key => outcomes.add(key));
                }
            } catch {}
        });
        return Array.from(outcomes).sort();
    }, [allAiPredictions]);

    const { stats, deepAnalytics } = useMemo(() => {
        const settled = allAiPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correct = settled.filter(p => p.status === AIPredictionStatus.Correct).length;
        const total = settled.length;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;
        
        const initialOutcomeStats: Record<string, { correct: number; total: number }> = {
            'П1': { correct: 0, total: 0 },
            'X': { correct: 0, total: 0 },
            'П2': { correct: 0, total: 0 },
        };

        // FIX: Explicitly typing the accumulator `acc` in the reduce callback helps TypeScript correctly infer its type.
        const outcomeStats = settled.reduce((acc: Record<string, { correct: number; total: number }>, p) => {
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
        }, initialOutcomeStats);
        
        const accuracyByOutcome = Object.entries(outcomeStats).map(([outcome, data]) => ({
            outcome, accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0, count: data.total,
        }));
        
        const predictionsWithResults = predictions.filter(p => p.prediction && p.scores);

        const deepAnalyticsData = predictionsWithResults.reduce<Record<string, { correct: number, total: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction!.prediction);
                if (data.probabilities && p.scores) {
                    for (const market in data.probabilities) {
                        if (!acc[market]) acc[market] = { correct: 0, total: 0 };
                        const result = resolveMarketOutcome(market, p.scores);
                        if (result !== 'unknown') {
                            acc[market].total++;
                            if (result === 'correct') acc[market].correct++;
                        }
                    }
                }
            } catch {}
            return acc;
        }, {});
        
        const deepAnalyticsResult = Object.entries(deepAnalyticsData).map(([market, data]) => ({
            market,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            count: data.total,
        })).sort((a,b) => b.count - a.count);
        
        return { stats: { total, correct, accuracy, accuracyByOutcome }, deepAnalytics: deepAnalyticsResult };
    }, [predictions, allAiPredictions]);

    const filteredPredictions = useMemo(() => {
        return predictions.filter(p => {
            const sportMatch = sportFilter === 'all' || p.sport === sportFilter;
            if (!p.prediction) return false;

            let outcomeMatch = outcomeFilter === 'all';
            if (outcomeFilter !== 'all') {
                 try {
                    const data = JSON.parse(p.prediction.prediction);
                    outcomeMatch = (outcomeFilter in data.probabilities) || (data.recommended_outcome === outcomeFilter);
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && outcomeMatch;
        });
    }, [predictions, sportFilter, outcomeFilter]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">База прогнозов AI</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Всего оценено" value={String(stats.total)} />
                <KpiCard title="Верных прогнозов" value={String(stats.correct)} colorClass="text-green-400" />
                <KpiCard title="Общая точность" value={`${stats.accuracy.toFixed(1)}%`} colorClass="text-indigo-400" />
            </div>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Точность по основным исходам</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {stats.accuracyByOutcome.map(item => (
                         <div key={item.outcome} className="p-3 bg-gray-700/50 rounded-lg">
                            <div className="flex justify-between items-baseline">
                                <span className="font-bold text-lg text-white">{item.outcome}</span>
                                <span className="text-xs text-gray-400">{item.count} оценок</span>
                            </div>
                            <p className="font-bold text-2xl text-indigo-400 mt-1">{item.accuracy.toFixed(1)}%</p>
                        </div>
                    ))}
                </div>
            </Card>
            
            <Card>
                 <h3 className="text-lg font-semibold mb-4">Глубокая аналитика по исходам</h3>
                 {deepAnalytics.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {deepAnalytics.map(item => (
                            <div key={item.market} className="p-3 bg-gray-700/50 rounded-lg">
                                <div className="flex justify-between items-baseline">
                                    <span className="font-semibold text-sm text-white truncate" title={item.market}>{item.market}</span>
                                    <span className="text-xs text-gray-400">{item.count}</span>
                                </div>
                                <p className="font-bold text-xl text-indigo-400 mt-1">{item.accuracy.toFixed(1)}%</p>
                            </div>
                        ))}
                    </div>
                 ) : (
                    <p className="text-center text-gray-500 py-4">Нет оцененных матчей для глубокой аналитики.</p>
                 )}
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Журнал прогнозов</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Select value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
                        <option value="all">Все виды спорта</option>
                        {Object.entries(SPORT_MAP).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
                            </tr>
                        </thead>
                        <tbody className="bg-gray-900 divide-y divide-gray-700">
                            {filteredPredictions.length > 0 ? filteredPredictions.map(p => {
                                const pred = p.prediction;
                                if (!pred) return null;
                                return (
                                <tr key={pred.id} className="hover:bg-gray-800/50">
                                    <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(pred.createdAt).toLocaleDateString('ru-RU')}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                        {p.teams}
                                        <p className="text-xs text-gray-500">{SPORT_MAP[p.sport] || p.sport}</p>
                                        {p.score && (
                                            <p className="text-xs font-mono bg-gray-700 px-1.5 py-0.5 rounded inline-block mt-1">{p.score}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <PredictionDetails prediction={pred.prediction} />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusInfo(pred.status).color}`}>
                                            {getStatusInfo(pred.status).label}
                                        </span>
                                    </td>
                                </tr>
                            )}) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-500">
                                        Нет прогнозов, соответствующих вашим фильтрам.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default AIPredictionLog;
