import React, { useMemo, useState, useCallback } from 'react';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus } from '../types';
import Select from './ui/Select';
import { usePredictionContext } from '../contexts/PredictionContext';
import Button from './ui/Button';
import { SPORTS } from '../constants';
import Modal from './ui/Modal';
import { fetchAIPredictionAnalysis } from '../services/aiService';
import { resolveMarketOutcome } from '../utils/predictionUtils';


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

const PredictionDetails: React.FC<{ prediction: string }> = ({ prediction }) => {
    try {
        const data = JSON.parse(prediction);
        // NEW STRUCTURE
        if (data.market_analysis) {
            const { market_analysis, value_bet_outcome, most_likely_outcome } = data;
            const valueBetInfo = market_analysis[value_bet_outcome];
            const mostLikelyInfo = market_analysis[most_likely_outcome];

            return (
                <div className="text-xs space-y-2">
                     <p className="flex items-center gap-2" title="Value Bet: исход с наилучшим математическим ожиданием (вероятность * коэф. - 1)">
                        <span className="font-bold text-amber-400">📈 Value:</span>
                        <span className="font-medium text-white">{value_bet_outcome}</span>
                        {valueBetInfo && <span className="text-gray-400">({(valueBetInfo.probability * 100).toFixed(0)}%)</span>}
                        {valueBetInfo && <span className="text-amber-500 font-mono">@{valueBetInfo.coefficient.toFixed(2)}</span>}
                    </p>
                     <p className="flex items-center gap-2" title="Most Likely: исход с самой высокой вероятностью по мнению AI">
                        <span className="font-bold text-cyan-400">🎯 Likely:</span>
                        <span className="font-medium text-white">{most_likely_outcome}</span>
                        {mostLikelyInfo && <span className="text-gray-400">({(mostLikelyInfo.probability * 100).toFixed(0)}%)</span>}
                    </p>
                    <details className="text-xs pt-1">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-300">Подробнее об исходах</summary>
                        <div className="mt-2 space-y-1 p-2 bg-gray-900/50 rounded-md max-h-40 overflow-y-auto">
                            {Object.entries(market_analysis).map(([key, value]: [string, any]) => (
                                <div key={key} className="p-1 rounded" title={`Обоснование: ${value.justification}`}>
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium">{key}</span>
                                        <div>
                                            <span className="text-cyan-300">{(value.probability * 100).toFixed(1)}%</span>
                                            <span className="text-amber-400 font-mono ml-2">@{value.coefficient.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            );
        }
        // OLD STRUCTURE FALLBACK
        if (!data.probabilities) return <span className="text-gray-400 text-xs">{prediction}</span>;

        const mainOutcome = data.recommended_outcome;
        return (
             <p>
                <span className="font-bold text-white">Рекомендация: {mainOutcome}</span>
             </p>
        )

    } catch (e) {
        return <span className="text-gray-300 whitespace-pre-wrap text-xs">{prediction.replace(/\*/g, '').trim()}</span>;
    }
}

const calculateMode = (numbers: number[]): number => {
    if (numbers.length === 0) return 0;
    const frequency: Record<string, number> = {};
    let maxFreq = 0;
    let mode = numbers[0];

    for (const num of numbers) {
        const fixedNum = num.toFixed(2); // Group similar floats
        frequency[fixedNum] = (frequency[fixedNum] || 0) + 1;
        if (frequency[fixedNum] > maxFreq) {
            maxFreq = frequency[fixedNum];
            mode = num;
        }
    }
    return mode;
};

type EnhancedAIPrediction = AIPrediction & { leagueName?: string };

const AIPredictionLog: React.FC = () => {
    const { allPredictions: centralPredictions, isLoading, fetchAllPredictions } = usePredictionContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [leagueFilter, setLeagueFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');
    const [analysisType, setAnalysisType] = useState<'value' | 'likely'>('value');

    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisText, setAnalysisText] = useState('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    
    const allEnhancedPredictions = useMemo(() => {
        return centralPredictions
            .filter(p => p.prediction) 
            .map(p => ({
                ...(p.prediction as AIPrediction),
                leagueName: p.eventName,
            }))
            .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [centralPredictions]);


    const { availableOutcomes, availableLeagues } = useMemo(() => {
        const outcomes = new Set<string>();
        const leagues = new Set<string>();
        allEnhancedPredictions.forEach(p => {
            if (p.leagueName) leagues.add(p.leagueName);
            try {
                const data = JSON.parse(p.prediction);
                if (data.value_bet_outcome) outcomes.add(data.value_bet_outcome);
                if (data.most_likely_outcome) outcomes.add(data.most_likely_outcome);
            } catch {}
        });
        return { 
            availableOutcomes: Array.from(outcomes).filter(o => o !== 'Нет выгодной ставки' && o !== 'N/A').sort(),
            availableLeagues: Array.from(leagues).sort()
        };
    }, [allEnhancedPredictions]);

    const filteredPredictions = useMemo(() => {
        return allEnhancedPredictions.filter(p => {
            const sportMatch = sportFilter === 'all' || (SPORT_MAP[p.sport.toLowerCase()] === sportFilter) || p.sport === sportFilter;
            const leagueMatch = leagueFilter === 'all' || p.leagueName === leagueFilter;

            let outcomeMatch = outcomeFilter === 'all';
            if (outcomeFilter !== 'all') {
                 try {
                    const data = JSON.parse(p.prediction);
                    outcomeMatch = (data.value_bet_outcome === outcomeFilter || data.most_likely_outcome === outcomeFilter);
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && leagueMatch && outcomeMatch;
        });
    }, [allEnhancedPredictions, sportFilter, leagueFilter, outcomeFilter]);
    
    const { generalStats, mainOutcomeStats, deepOutcomeStats, probabilityStats } = useMemo(() => {
        const settled = filteredPredictions.filter(p => p.status !== AIPredictionStatus.Pending && p.matchResult);
        
        const correct = settled.filter(p => {
            try {
                const data = JSON.parse(p.prediction);
                const outcomeToCheck = analysisType === 'value' ? data.value_bet_outcome : data.most_likely_outcome;
                if (!outcomeToCheck || outcomeToCheck === 'Нет выгодной ставки' || outcomeToCheck === 'N/A' || !p.matchResult) return false;
                const result = resolveMarketOutcome(outcomeToCheck, p.matchResult.scores, p.matchResult.winner);
                return result === 'correct';
            } catch { return false; }
        });
        
        const total = settled.length;
        const accuracy = total > 0 ? (correct.length / total) * 100 : 0;
        
        const correctCoefficients = correct.reduce<number[]>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcomeToCheck = analysisType === 'value' ? data.value_bet_outcome : data.most_likely_outcome;
                const coeff = data.market_analysis?.[outcomeToCheck]?.coefficient;
                if (typeof coeff === 'number') acc.push(coeff);
            } catch {}
            return acc;
        }, []);
        
        const modalCorrectCoefficient = calculateMode(correctCoefficients);
        
        // @google/genai-fix: Explicitly typed the accumulator in the `reduce` function for `statsByAllOutcomes` and changed the initial value to an empty object to ensure correct type inference and resolve downstream 'unknown' type errors.
        const statsByAllOutcomes = settled.reduce((acc: Record<string, { correct: number, total: number, allCoefficients: number[] }>, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.market_analysis && p.matchResult) {
                    for (const market in data.market_analysis) {
                        if (!acc[market]) acc[market] = { correct: 0, total: 0, allCoefficients: [] };
                        const result = resolveMarketOutcome(market, p.matchResult.scores, p.matchResult.winner);
                        if (result !== 'unknown') {
                            acc[market].total++;
                            if (result === 'correct') acc[market].correct++;
                            const coeff = data.market_analysis[market]?.coefficient;
                            if (typeof coeff === 'number') acc[market].allCoefficients.push(coeff);
                        }
                    }
                }
            } catch {}
            return acc;
        }, {});
        
        const mainOutcomes = ['П1', 'X', 'П2'];
        const mainOutcomeStats = mainOutcomes.map(outcome => {
            const data = statsByAllOutcomes[outcome] || { correct: 0, total: 0, allCoefficients: [] };
            return {
                outcome,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                modalCoeff: calculateMode(data.allCoefficients),
                count: data.total,
            };
        });

        const deepOutcomeStats = Object.entries(statsByAllOutcomes)
            .map(([market, data]) => ({
                market,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                modalCoeff: calculateMode(data.allCoefficients),
                count: data.total,
                correct: data.correct,
            }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);

        // @google/genai-fix: Corrected property names in the object literal from 'c' and 't' to 'correct' and 'total' to match the `Record<string, { correct: number, total: number }>` type definition. This resolves multiple "Object literal may only specify known properties" errors.
        const probabilityBuckets: Record<string, { correct: number, total: number }> = { '0-25%':{correct:0,total:0}, '25-40%':{correct:0,total:0}, '40-55%':{correct:0,total:0}, '55-70%':{correct:0,total:0}, '70-85%':{correct:0,total:0}, '85-100%':{correct:0,total:0} };
        settled.forEach(p => {
            try {
                const data = JSON.parse(p.prediction);
                const outcomeToCheck = analysisType === 'value' ? data.value_bet_outcome : data.most_likely_outcome;
                const prob = data.market_analysis?.[outcomeToCheck]?.probability * 100;
                if (typeof prob !== 'number') return;
                let bucketKey: string|null = null;
                if(prob>=0&&prob<=25)bucketKey='0-25%';else if(prob>25&&prob<=40)bucketKey='25-40%';else if(prob>40&&prob<=55)bucketKey='40-55%';else if(prob>55&&prob<=70)bucketKey='55-70%';else if(prob>70&&prob<=85)bucketKey='70-85%';else if(prob>85&&prob<=100)bucketKey='85-100%';
                if(bucketKey){probabilityBuckets[bucketKey].total++;if(resolveMarketOutcome(outcomeToCheck,p.matchResult!.scores,p.matchResult!.winner)==='correct'){probabilityBuckets[bucketKey].correct++;}}
            } catch {}
        });
        const probabilityStats = Object.entries(probabilityBuckets).map(([range, data]) => ({ range, ...data, accuracy: data.total>0?(data.correct/data.total)*100:0 }));

        return { generalStats: { total, correct: correct.length, accuracy, modalCorrectCoefficient }, mainOutcomeStats, deepOutcomeStats, probabilityStats };
    }, [filteredPredictions, analysisType]);

    const handleRefresh = () => { fetchAllPredictions(true); };

    const handleGetAIAnalysis = useCallback(async () => {
        if (generalStats.total === 0) { setIsAnalysisModalOpen(true); setAnalysisText("Недостаточно данных для анализа."); return; }
        setIsAnalysisLoading(true); setAnalysisText(''); setIsAnalysisModalOpen(true);
        const analyticsText = `Анализ по типу: ${analysisType === 'value' ? 'Value Bet' : 'Most Likely'}\n\nОбщая статистика:\n- Всего: ${generalStats.total}, Верно: ${generalStats.correct}, Точность: ${generalStats.accuracy.toFixed(1)}%\n\nТочность по исходам:\n${deepOutcomeStats.map(i=>`- ${i.market}: ${i.accuracy.toFixed(1)}% (${i.correct}/${i.count})`).join('\n')}`;
        try { const result = await fetchAIPredictionAnalysis(analyticsText); setAnalysisText(result); } catch (error) { setAnalysisText(error instanceof Error ? error.message : "Ошибка."); } finally { setIsAnalysisLoading(false); }
    }, [generalStats, deepOutcomeStats, analysisType]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                 <div className="flex items-center gap-2 p-1 bg-gray-900/50 rounded-lg">
                    <span className="text-sm font-medium pl-2">Анализ по:</span>
                    <Button size="sm" variant={analysisType === 'value' ? 'primary' : 'secondary'} onClick={() => setAnalysisType('value')}>📈 Value Bet</Button>
                    <Button size="sm" variant={analysisType === 'likely' ? 'primary' : 'secondary'} onClick={() => setAnalysisType('likely')}>🎯 Most Likely</Button>
                </div>
                 <Button onClick={handleRefresh} variant="secondary">
                     <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M20 4l-4 4M4 20l4-4" /></svg>
                    Обновить
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Всего оценено" value={String(generalStats.total)} />
                <KpiCard title="Верных прогнозов" value={String(generalStats.correct)} />
                <KpiCard title="Общая точность" value={`${generalStats.accuracy.toFixed(1)}%`} colorClass={generalStats.accuracy >= 50 ? 'text-green-400' : 'text-red-400'}/>
                <KpiCard title="Частый верный коэф." value={generalStats.modalCorrectCoefficient.toFixed(2)} colorClass="text-amber-400" />
            </div>
            
            <Card>
                <h3 className="text-lg font-semibold mb-4">Точность по вероятности AI ({analysisType === 'value' ? 'Value Bet' : 'Most Likely'})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {probabilityStats.map(bucket => (
                        <div key={bucket.range}>
                            <div className="flex justify-between items-center text-sm mb-1"><span className="font-medium text-gray-300">Вероятность {bucket.range}</span><span className="text-xs text-gray-400">{bucket.correct} из {bucket.total}</span></div>
                            <div className="w-full bg-gray-700 rounded-full h-4"><div className="bg-indigo-500 h-4 rounded-full text-xs text-white flex items-center justify-center" style={{ width: `${bucket.accuracy}%` }}>{bucket.total > 0 && `${bucket.accuracy.toFixed(1)}%`}</div></div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Журнал прогнозов</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Select value={sportFilter} onChange={e => setSportFilter(e.target.value)}><option value="all">Все виды спорта</option>{SPORTS.map(s => <option key={s} value={s}>{s}</option>)}</Select>
                    <Select value={leagueFilter} onChange={e => setLeagueFilter(e.target.value)}><option value="all">Все лиги</option>{availableLeagues.map(l => <option key={l} value={l}>{l}</option>)}</Select>
                    <Select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}><option value="all">Все исходы</option>{availableOutcomes.map(o => <option key={o} value={o}>{o}</option>)}</Select>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Дата/Время</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Матч</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Прогноз AI</th><th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">Статус</th></tr></thead>
                        <tbody className="bg-gray-900 divide-y divide-gray-700">
                             {filteredPredictions.map(p => {
                                const status = getStatusInfo(p.status);
                                return (
                                    <tr key={p.id}>
                                        <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleString('ru-RU')}</td>
                                        <td className="px-4 py-3"><p className="text-sm font-medium text-white">{p.matchName}</p><p className="text-xs text-gray-500">{p.sport}</p></td>
                                        <td className="px-4 py-3"><PredictionDetails prediction={p.prediction} /></td>
                                        <td className="px-4 py-3 text-center"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${status.color}`}>{status.label}</span></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {isAnalysisModalOpen && (<Modal title="Анализ производительности AI" onClose={() => setIsAnalysisModalOpen(false)}>{isAnalysisLoading ? (<div className="flex justify-center items-center h-40"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div></div>) : (<div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-gray-300">{analysisText}</div>)}</Modal>)}
        </div>
    );
};

export default AIPredictionLog;