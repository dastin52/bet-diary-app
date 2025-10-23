import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus, SharedPrediction } from '../types';
import Select from './ui/Select';
import { usePredictionContext } from '../contexts/PredictionContext';
import { useBetContext } from '../contexts/BetContext';
import Button from './ui/Button';
import { SPORTS } from '../constants';
import Modal from './ui/Modal';
import { fetchAIPredictionAnalysis } from '../services/aiService';


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

const resolveMarketOutcome = (market: string, scores: { home: number; away: number }, winner?: 'home' | 'away' | 'draw'): 'correct' | 'incorrect' | 'unknown' => {
    const { home, away } = scores;
    const total = home + away;

    switch (true) {
        case market === 'П1':
        case market === 'П1 (осн. время)':
            return (home > away) ? 'correct' : 'incorrect';
        case market === 'X':
        case market === 'X (осн. время)':
            return home === away ? 'correct' : 'incorrect';
        case market === 'П2':
        case market === 'П2 (осн. время)':
            return (away > home) ? 'correct' : 'incorrect';
        case market.startsWith('П1'):
            return winner === 'home' ? 'correct' : 'incorrect';
        case market.startsWith('П2'):
            return winner === 'away' ? 'correct' : 'incorrect';
        case market === '1X': return home >= away ? 'correct' : 'incorrect';
        case market === 'X2': return away >= home ? 'correct' : 'incorrect';
        case market === '12': return home !== away ? 'correct' : 'incorrect';
        case market === 'Обе забьют - Да': return home > 0 && away > 0 ? 'correct' : 'incorrect';
        case market === 'Обе забьют - Нет': return home === 0 || away === 0 ? 'correct' : 'incorrect';
        
        case market.includes('Тотал Больше'): {
            const value = parseFloat(market.split(' ')[2]);
            return !isNaN(value) && total > value ? 'correct' : 'incorrect';
        }
        case market.includes('Тотал Меньше'): {
            const value = parseFloat(market.split(' ')[2]);
            return !isNaN(value) && total < value ? 'correct' : 'incorrect';
        }
        
        default:
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

    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [analysisText, setAnalysisText] = useState('');
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);


    useEffect(() => {
        const finishedMatches = centralPredictions.filter(p => p.winner && p.scores);
        if (finishedMatches.length === 0) return;

        const pendingPersonalPredictions = personalPredictions.filter(p => p.status === AIPredictionStatus.Pending);
        if (pendingPersonalPredictions.length === 0) return;

        pendingPersonalPredictions.forEach(prediction => {
            const finishedMatch = finishedMatches.find(m => m.teams === prediction.matchName && (SPORT_MAP[m.sport] === prediction.sport || m.sport === prediction.sport));
            
            if (finishedMatch && finishedMatch.scores && finishedMatch.winner) {
                let recommendedOutcome: string | null = null;
                try {
                    const predictionData = JSON.parse(prediction.prediction);
                    recommendedOutcome = predictionData?.recommended_outcome || null;
                } catch (e) { return; }

                if (!recommendedOutcome) return;
                
                const result = resolveMarketOutcome(recommendedOutcome, finishedMatch.scores, finishedMatch.winner);

                if (result !== 'unknown') {
                    const newStatus = result === 'correct' ? AIPredictionStatus.Correct : AIPredictionStatus.Incorrect;
                     updateAIPrediction(prediction.id, {
                        status: newStatus,
                        matchResult: { winner: finishedMatch.winner, scores: { home: finishedMatch.scores.home, away: finishedMatch.scores.away } }
                    });
                }
            }
        });
    }, [centralPredictions, personalPredictions, updateAIPrediction]);

    const combinedAndEnhancedPredictions = useMemo(() => {
        const predictionsMap = new Map<string, EnhancedAIPrediction>();
        centralPredictions.forEach(p => {
            if (p.prediction) {
                predictionsMap.set(p.teams, { ...p.prediction, leagueName: p.eventName });
            }
        });
        personalPredictions.forEach(p => {
            const existing = predictionsMap.get(p.matchName);
            predictionsMap.set(p.matchName, { ...p, leagueName: existing?.leagueName || 'Личные' });
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
                if (data.recommended_outcome) outcomes.add(data.recommended_outcome);
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
                    outcomeMatch = (data.recommended_outcome === outcomeFilter);
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && leagueMatch && outcomeMatch;
        });
    }, [combinedAndEnhancedPredictions, sportFilter, leagueFilter, outcomeFilter]);
    
    const { generalStats, mainOutcomeStats, deepOutcomeStats } = useMemo(() => {
        const settled = filteredPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correct = settled.filter(p => p.status === AIPredictionStatus.Correct);
        
        const total = settled.length;
        const accuracy = total > 0 ? (correct.length / total) * 100 : 0;
        
        const winningCoefficients = correct.reduce<number[]>((acc, p) => {
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
        
        // FIX: Added explicit generic type to the reduce accumulator to ensure correct type inference.
        const statsByAllOutcomes = settled.reduce<Record<string, { correct: number, total: number, oddsSum: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                if (data.probabilities && p.matchResult) {
                    for (const market in data.probabilities) {
                        if (!acc[market]) acc[market] = { correct: 0, total: 0, oddsSum: 0 };

                        const result = resolveMarketOutcome(market, p.matchResult.scores, p.matchResult.winner);

                        if (result !== 'unknown') {
                            acc[market].total++;
                            if (result === 'correct') {
                                acc[market].correct++;
                                const coeff = data.coefficients?.[market];
                                if (typeof coeff === 'number') acc[market].oddsSum += coeff;
                            }
                        }
                    }
                }
            } catch {}
            return acc;
        }, {});
        
        const mainOutcomes = ['П1', 'X', 'П2'];
        const mainOutcomeStats = mainOutcomes.map(outcome => {
            const data = statsByAllOutcomes[outcome] || { correct: 0, total: 0, oddsSum: 0 };
            return {
                outcome,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                avgCoeff: data.correct > 0 ? data.oddsSum / data.correct : 0,
                count: data.total,
            };
        });

        const deepOutcomeStats = Object.entries(statsByAllOutcomes)
            .map(([market, data]) => ({
                market,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                avgCoeff: data.correct > 0 ? data.oddsSum / data.correct : 0,
                count: data.total,
                correct: data.correct,
            }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.count - a.count);

        return {
            generalStats: { total, correct: correct.length, accuracy, avgCorrectCoefficient },
            mainOutcomeStats,
            deepOutcomeStats,
        };
    }, [filteredPredictions]);

    const handleRefresh = () => {
        fetchPredictions(activeSport, true);
    };

    const handleGetAIAnalysis = useCallback(async () => {
        setIsAnalysisLoading(true);
        setAnalysisText('');
        setIsAnalysisModalOpen(true);

        const analyticsText = `
Общая статистика (с учетом фильтров):
- Всего оценено: ${generalStats.total}
- Верно: ${generalStats.correct}
- Точность: ${generalStats.accuracy.toFixed(1)}%

Точность по типам всех исходов (не только рекомендованных):
${deepOutcomeStats.map(item => 
`- ${item.market}: ${item.accuracy.toFixed(1)}% (${item.correct}/${item.count})`
).join('\n')}
`;
        try {
            const result = await fetchAIPredictionAnalysis(analyticsText);
            setAnalysisText(result);
        } catch (error) {
            setAnalysisText(error instanceof Error ? error.message : "Произошла ошибка при анализе.");
        } finally {
            setIsAnalysisLoading(false);
        }
    }, [generalStats, deepOutcomeStats]);


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                 <Button onClick={handleGetAIAnalysis} variant="secondary">
                     🤖 Получить выводы от AI
                 </Button>
                 <Button onClick={handleRefresh} variant="secondary">
                     <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M20 4l-4 4M4 20l4-4" /></svg>
                    Обновить
                </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Всего оценено" value={String(generalStats.total)} />
                <KpiCard title="Верных прогнозов" value={String(generalStats.correct)} />
                <KpiCard title="Общая точность" value={`${generalStats.accuracy.toFixed(1)}%`} colorClass={generalStats.accuracy >= 50 ? 'text-green-400' : 'text-red-400'}/>
                <KpiCard title="Средний верный коэф." value={generalStats.avgCorrectCoefficient.toFixed(2)} colorClass="text-amber-400" />
            </div>

             <Card>
                <h3 className="text-lg font-semibold mb-2">Точность по основным исходам</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {mainOutcomeStats.map(({ outcome, accuracy, avgCoeff, count }) => (
                         <div key={outcome} className="p-4 bg-gray-900/50 rounded-lg text-center">
                            <p className="text-sm text-gray-400">{outcome}</p>
                            <div className="flex items-baseline justify-center gap-2 mt-1">
                                <p className={`text-3xl font-bold ${accuracy >= 50 ? 'text-green-400' : accuracy > 0 ? 'text-red-400' : 'text-gray-300'}`}>{accuracy.toFixed(1)}%</p>
                                {avgCoeff > 0 && <span className="text-sm text-amber-400 font-mono" title="Средний коэф.">{avgCoeff.toFixed(2)}</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{count} оценок</p>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-2">Глубокая аналитика по исходам</h3>
                 <p className="text-xs text-gray-500 mb-4">Статистика по всем возможным исходам, отсортировано по количеству.</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {deepOutcomeStats.map(({ market, accuracy, avgCoeff, count }) => (
                         <div key={market} className="p-3 bg-gray-900/50 rounded-lg text-center">
                            <p className="text-sm text-gray-400 truncate" title={market}>{market}</p>
                             <div className="flex items-baseline justify-center gap-1 mt-1">
                                <p className={`text-2xl font-bold ${accuracy >= 50 ? 'text-green-400' : accuracy > 0 ? 'text-red-400' : 'text-gray-300'}`}>{accuracy.toFixed(1)}%</p>
                                {avgCoeff > 0 && <span className="text-xs text-amber-400 font-mono" title="Средний коэф.">{avgCoeff.toFixed(2)}</span>}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{count} оценок</p>
                        </div>
                    ))}
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

            {isAnalysisModalOpen && (
                <Modal title="Анализ производительности AI" onClose={() => setIsAnalysisModalOpen(false)}>
                    {isAnalysisLoading ? (
                        <div className="flex justify-center items-center h-40">
                             <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-sm sm:prose-base max-w-none whitespace-pre-wrap leading-relaxed text-gray-300">
                            {analysisText}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default AIPredictionLog;