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
import { useGingerModel } from '../hooks/useGingerModel';


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

const PredictionDetails: React.FC<{ prediction: string, confidence: number | null }> = ({ prediction, confidence }) => {
    try {
        const data = JSON.parse(prediction);
        // NEW STRUCTURE
        if (data.market_analysis) {
            const { market_analysis, most_likely_outcome } = data;
            const mostLikelyInfo = market_analysis[most_likely_outcome];

            return (
                <div className="text-xs space-y-2">
                     <p className="flex items-center gap-2" title="Most Likely: исход с самой высокой вероятностью по мнению AI">
                        <span className="font-bold text-cyan-400">🎯 AI-Прогноз:</span>
                        <span className="font-medium text-white">{most_likely_outcome}</span>
                        {mostLikelyInfo && <span className="text-gray-400">({(mostLikelyInfo.probability * 100).toFixed(0)}%)</span>}
                    </p>
                    {confidence !== null && (
                         <p className="flex items-center gap-2" title="Уверенность основана на глобальном ROI AI на похожих рынках.">
                            <span className="font-bold text-fuchsia-400">👩‍🔬 Джинджер:</span>
                             <span className="font-medium text-white">Уверенность {confidence.toFixed(0)}%</span>
                        </p>
                    )}
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

    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisText, setAnalysisText] = useState('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    
    const allEnhancedPredictions = useMemo(() => {
        return centralPredictions
            .filter(p => p.prediction) 
            .map(p => {
                const pred = p.prediction as AIPrediction;
                return {
                    ...pred,
                    leagueName: p.eventName,
                    // @google/genai-fix: Correctly map matchResult from SharedPrediction if not in AIPrediction
                    matchResult: pred.matchResult || (p.scores && p.winner ? { 
                        scores: p.scores, 
                        winner: p.winner 
                    } : undefined),
                    matchName: p.teams,
                    sport: p.sport,
                };
            })
            .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [centralPredictions]);
    
    const { getConfidenceForPrediction } = useGingerModel(allEnhancedPredictions);


    const { availableOutcomes, availableLeagues } = useMemo(() => {
        const outcomes = new Set<string>();
        const leagues = new Set<string>();
        allEnhancedPredictions.forEach(p => {
            if (p.leagueName) leagues.add(p.leagueName);
            try {
                const data = JSON.parse(p.prediction);
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
                    if (data.market_analysis) {
                        outcomeMatch = outcomeFilter in data.market_analysis;
                    } else if (data.probabilities) {
                        outcomeMatch = outcomeFilter in data.probabilities;
                    } else {
                        outcomeMatch = false;
                    }
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && leagueMatch && outcomeMatch;
        });
    }, [allEnhancedPredictions, sportFilter, leagueFilter, outcomeFilter]);
    
    const { aiStats, detailedOutcomeStats } = useMemo(() => {
        const settled = filteredPredictions.filter(p => p.status !== AIPredictionStatus.Pending && p.matchResult);
        
        const calculateStatsForType = () => {
             const resolvableSettled = settled.filter(p => {
                try {
                    const data = JSON.parse(p.prediction);
                    if (!p.matchResult) return false;
                    
                    let outcomeToCheck: string | undefined = data.most_likely_outcome || data.recommended_outcome;
                    if (!outcomeToCheck || outcomeToCheck === 'N/A') return false;
                    
                    return resolveMarketOutcome(outcomeToCheck, p.matchResult.scores, p.matchResult.winner) !== 'unknown';

                } catch { return false; }
            });

            const correct = resolvableSettled.filter(p => {
                try {
                    const data = JSON.parse(p.prediction);
                    const matchResult = p.matchResult!;
                    let outcomeToCheck: string | undefined = data.most_likely_outcome || data.recommended_outcome;
                    
                    return resolveMarketOutcome(outcomeToCheck!, matchResult.scores, matchResult.winner) === 'correct';
                } catch { return false; }
            });
            
            const totalWithRec = resolvableSettled.length;
            return {
                total: totalWithRec,
                correct: correct.length,
                accuracy: totalWithRec > 0 ? (correct.length / totalWithRec) * 100 : 0,
            };
        }
        
        const aiStats = calculateStatsForType();
        
        const statsByAllOutcomes = settled.reduce<Record<string, { correct: number, total: number, correctCoefficients: number[] }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (p.matchResult) {
                    if (data.market_analysis) {
                        for (const market in data.market_analysis) {
                            if (!acc[market]) acc[market] = { correct: 0, total: 0, correctCoefficients: [] };
                            const result = resolveMarketOutcome(market, p.matchResult.scores, p.matchResult.winner);
                            if (result !== 'unknown') {
                                acc[market].total++;
                                const coeff = data.market_analysis[market]?.coefficient;
                                if (result === 'correct') {
                                    acc[market].correct++;
                                    if (typeof coeff === 'number') acc[market].correctCoefficients.push(coeff);
                                }
                            }
                        }
                    }
                }
            } catch {}
            return acc;
        }, {});
        
        const detailedOutcomeStats = Object.entries(statsByAllOutcomes)
            .map(([market, data]: [string, { correct: number, total: number, correctCoefficients: number[] }]) => ({
                market,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                evaluations: `${data.correct} / ${data.total}`,
                frequentCoefficient: calculateMode(data.correctCoefficients),
                count: data.total,
            }))
            .filter(item => item.count >= 3 && item.market !== "Нет выгодной ставки" && item.market !== "N/A")
            .sort((a, b) => b.count - a.count);

        return {
            aiStats,
            detailedOutcomeStats,
        };

    }, [filteredPredictions]);
    
    const handleOpenAnalysisModal = useCallback(async () => {
        setIsAnalysisModalOpen(true);
        setIsAnalysisLoading(true);

        const analyticsString = `
        Общая точность (AI-Прогноз): ${aiStats.accuracy.toFixed(1)}% (${aiStats.correct}/${aiStats.total})
        Детальная статистика по всем исходам: ${detailedOutcomeStats.map(s => `${s.market}: ${s.accuracy.toFixed(1)}% (${s.count})`).join(', ')}
        `;

        try {
            const result = await fetchAIPredictionAnalysis(analyticsString);
            setAnalysisText(result);
        } catch (e) {
            setAnalysisText("Не удалось получить анализ от AI.");
        } finally {
            setIsAnalysisLoading(false);
        }

    }, [aiStats, detailedOutcomeStats]);

    const getDynamicStatus = useCallback((prediction: EnhancedAIPrediction): AIPredictionStatus => {
        if (prediction.status === AIPredictionStatus.Pending || !prediction.matchResult) {
            return AIPredictionStatus.Pending;
        }
        try {
            const data = JSON.parse(prediction.prediction);
            let outcomeToCheck: string | undefined = data.most_likely_outcome || data.recommended_outcome;

            if (!outcomeToCheck || outcomeToCheck === 'N/A') {
                return AIPredictionStatus.Incorrect;
            }

            const result = resolveMarketOutcome(outcomeToCheck, prediction.matchResult.scores, prediction.matchResult.winner);
            
            if (result === 'unknown') return AIPredictionStatus.Incorrect;
            
            return result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;

        } catch {
            return AIPredictionStatus.Incorrect;
        }
    }, []);

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-xl font-semibold">База Прогнозов AI</h2>
                        <p className="text-sm text-gray-400 mt-1">Оценка точности AI на основе результатов матчей.</p>
                    </div>
                     <div className="flex gap-2">
                        <Button onClick={handleOpenAnalysisModal} variant="secondary">Анализ от AI</Button>
                        <Button onClick={() => fetchAllPredictions(true)} disabled={isLoading} variant="secondary">
                            {isLoading ? 'Обновление...' : 'Обновить'}
                        </Button>
                    </div>
                </div>
            </Card>

            <Card>
                 <h3 className="text-lg font-semibold mb-4">Общая Статистика</h3>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard title="Точность AI" value={`${aiStats.accuracy.toFixed(1)}%`} subtext={`${aiStats.correct} / ${aiStats.total} ставок`} colorClass={aiStats.accuracy >= 50 ? "text-green-400" : "text-amber-400"}/>
                    <KpiCard title="Всего прогнозов" value={String(allEnhancedPredictions.length)} subtext="В базе данных"/>
                    <KpiCard title="Оценено" value={String(filteredPredictions.filter(p => p.status !== 'pending').length)} subtext="С известным результатом"/>
                 </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Детальная точность по всем исходам</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-800">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Исход</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Точность</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Оценки</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Частый верный коэф.</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-900 divide-y divide-gray-700">
                            {detailedOutcomeStats.map(stat => (
                                <tr key={stat.market}>
                                    <td className="px-4 py-3 text-sm font-medium text-white">{stat.market}</td>
                                    <td className={`px-4 py-3 text-sm text-center font-bold ${stat.accuracy > 55 ? 'text-green-400' : 'text-gray-300'}`}>{stat.accuracy.toFixed(1)}%</td>
                                    <td className="px-4 py-3 text-sm text-center text-gray-300">{stat.evaluations}</td>
                                    <td className="px-4 py-3 text-sm text-center font-mono text-cyan-400">{stat.frequentCoefficient > 0 ? stat.frequentCoefficient.toFixed(2) : '-'}</td>
                                </tr>
                            ))}
                            {detailedOutcomeStats.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="text-center py-6 text-gray-500">Нет данных для детальной статистики.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card>
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Матч</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Прогноз AI</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Результат</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Статус AI</th>
                            </tr>
                         </thead>
                         <tbody className="bg-gray-900 divide-y divide-gray-700">
                            {filteredPredictions.map(p => {
                                const confidence = getConfidenceForPrediction(p);
                                const status = getDynamicStatus(p);
                                return (
                                <tr key={p.id}>
                                    <td className="px-4 py-3 text-sm">
                                        <p className="font-medium text-white">{p.matchName}</p>
                                        <p className="text-xs text-gray-500">{p.leagueName} | {new Date(p.createdAt).toLocaleDateString('ru-RU')}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <PredictionDetails prediction={p.prediction} confidence={confidence} />
                                    </td>
                                     <td className="px-4 py-3 text-sm text-center font-mono">
                                        {p.matchResult ? `${p.matchResult.scores.home} - ${p.matchResult.scores.away}` : '–'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusInfo(status).color}`}>
                                            {getStatusInfo(status).label}
                                        </span>
                                    </td>
                                </tr>
                                )
                            })}
                         </tbody>
                    </table>
                </div>
            </Card>
            
            {isAnalysisModalOpen && (
                <Modal title="Анализ от AI" onClose={() => setIsAnalysisModalOpen(false)}>
                    {isAnalysisLoading ? <p>Анализирую...</p> : (
                        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                            {analysisText}
                        </div>
                    )}
                </Modal>
            )}

        </div>
    );
};

export default AIPredictionLog;