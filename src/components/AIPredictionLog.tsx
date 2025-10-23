import React, { useMemo, useState } from 'react';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus } from '../types';
import Select from './ui/Select';
import { usePredictionContext } from '../contexts/PredictionContext';
// FIX: The useBetContext hook is exported from BetContext, not useBets.
import { useBetContext } from '../contexts/BetContext';
import Button from './ui/Button';

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


const AIPredictionLog: React.FC = () => {
    const { predictions: centralPredictions } = usePredictionContext();
    const { aiPredictions: personalPredictions, updateAIPrediction } = useBetContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const combinedPredictions = useMemo(() => {
        const centralAsAIPrediction = centralPredictions
            .map(p => p.prediction)
            .filter((p): p is AIPrediction => p !== null);
        
        const allPredictions = [...personalPredictions, ...centralAsAIPrediction];
        const uniquePredictions = Array.from(new Map(allPredictions.map(p => [p.matchName, p])).values());
        
        return uniquePredictions.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [centralPredictions, personalPredictions]);


    const availableOutcomes = useMemo(() => {
        const outcomes = new Set<string>();
        combinedPredictions.forEach(p => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities) {
                    Object.keys(data.probabilities).forEach(key => outcomes.add(key));
                }
            } catch {}
        });
        return Array.from(outcomes).sort();
    }, [combinedPredictions]);

    const { stats, deepAnalytics } = useMemo(() => {
        const settled = combinedPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correctPredictions = settled.filter(p => p.status === AIPredictionStatus.Correct);
        
        const total = settled.length;
        const accuracy = total > 0 ? (correctPredictions.length / total) * 100 : 0;
        
        const winningCoefficients = correctPredictions.reduce<number[]>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcome = data.recommended_outcome;
                const coeff = data.coefficients?.[outcome];
                if (typeof coeff === 'number') {
                    acc.push(coeff);
                }
            } catch {}
            return acc;
        }, []);
        
        const avgCorrectCoefficient = winningCoefficients.length > 0
            ? winningCoefficients.reduce((sum, coeff) => sum + coeff, 0) / winningCoefficients.length
            : 0;
        
        const initialOutcomeStats: Record<string, { correct: number; total: number }> = {
            'П1': { correct: 0, total: 0 },
            'X': { correct: 0, total: 0 },
            'П2': { correct: 0, total: 0 },
        };

        const outcomeStats = settled.reduce((acc: Record<string, { correct: number; total: number }>, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcome = data.recommended_outcome;
                if (outcome && ['П1', 'X', 'П2'].includes(outcome)) {
                    if (!acc[outcome]) {
                        acc[outcome] = { correct: 0, total: 0 };
                    }
                    const outcomeStat = acc[outcome];
                    outcomeStat.total++;
                    if (p.status === AIPredictionStatus.Correct) {
                        outcomeStat.correct++;
                    }
                }
            } catch {}
            return acc;
        }, initialOutcomeStats);
        
        const accuracyByOutcome = Object.entries(outcomeStats).map(([outcome, data]) => ({
            outcome, accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0, count: data.total,
        }));
        
        const predictionsWithResults = combinedPredictions.filter(p => p.matchResult && p.matchResult.scores);
        // FIX: Add explicit type for accumulator to prevent type inference issues.
        const deepAnalyticsData = predictionsWithResults.reduce((acc: Record<string, { correct: number, total: number }>, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities && p.matchResult) {
                    for (const market in data.probabilities) {
                        if (!acc[market]) {
                            acc[market] = { correct: 0, total: 0 };
                        }
                        const marketStats = acc[market];
                        const result = resolveMarketOutcome(market, p.matchResult.scores);
                        if (result !== 'unknown') {
                            marketStats.total++;
                            if (result === 'correct') {
                                marketStats.correct++;
                            }
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
        
        return { stats: { total, correct: correctPredictions.length, accuracy, accuracyByOutcome, avgCorrectCoefficient }, deepAnalytics: deepAnalyticsResult };
    }, [combinedPredictions]);

    const filteredPredictions = useMemo(() => {
        return combinedPredictions.filter(p => {
            const sportMatch = sportFilter === 'all' || (SPORT_MAP[p.sport] === sportFilter) || p.sport === sportFilter;

            let outcomeMatch = outcomeFilter === 'all';
            if (outcomeFilter !== 'all') {
                 try {
                    const data = JSON.parse(p.prediction);
                    outcomeMatch = (outcomeFilter in data.probabilities) || (data.recommended_outcome === outcomeFilter);
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && outcomeMatch;
        });
    }, [combinedPredictions, sportFilter, outcomeFilter]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Всего оценено" value={String(stats.total)} />
                <KpiCard title="Верных прогнозов" value={String(stats.correct)} colorClass="text-green-400" />
                <KpiCard title="Общая точность" value={`${stats.accuracy.toFixed(1)}%`} colorClass="text-indigo-400" />
                <KpiCard title="Средний верный коэф." value={`${stats.avgCorrectCoefficient.toFixed(2)}`} colorClass="text-amber-400" />
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
                        {Object.values(SPORT_MAP).filter((v, i, a) => a.indexOf(v) === i).map(label => <option key={label} value={label}>{label}</option>)}
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
                            {filteredPredictions.length > 0 ? filteredPredictions.map(p => {
                                const isPersonal = personalPredictions.some(pp => pp.id === p.id);
                                return (
                                <tr key={p.id} className="hover:bg-gray-800/50">
                                    <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                        {p.matchName}
                                        <p className="text-xs text-gray-500">{SPORT_MAP[p.sport] || p.sport}</p>
                                        {p.matchResult && p.matchResult.scores && (
                                            <p className="text-xs font-mono bg-gray-700 px-1.5 py-0.5 rounded inline-block mt-1">{p.matchResult.scores.home} - {p.matchResult.scores.away}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <PredictionDetails prediction={p.prediction} />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusInfo(p.status).color}`}>
                                            {getStatusInfo(p.status).label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {isPersonal && p.status === AIPredictionStatus.Pending ? (
                                            <div className="flex gap-2 justify-center">
                                                <Button onClick={() => updateAIPrediction(p.id, { status: AIPredictionStatus.Correct })} className="!p-1.5 !bg-green-500/20 hover:!bg-green-500/40"><CheckIcon/></Button>
                                                <Button onClick={() => updateAIPrediction(p.id, { status: AIPredictionStatus.Incorrect })} className="!p-1.5 !bg-red-500/20 hover:!bg-red-500/40"><XIcon/></Button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-500">{isPersonal ? 'Оценено' : 'Авто'}</span>
                                        )}
                                    </td>
                                </tr>
                            )}) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-10 text-gray-500">
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