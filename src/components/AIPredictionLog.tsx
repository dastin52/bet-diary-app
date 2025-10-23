import React, { useMemo, useState } from 'react';
import { useBetContext } from '../contexts/BetContext';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus } from '../types';
import Button from './ui/Button';
import { SPORTS } from '../constants';
import Select from './ui/Select';

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

        return (
            <div className="text-xs space-y-1">
                <p>
                    <span className="font-bold text-white">Рекомендация: {mainOutcome}</span>
                    <span className="text-gray-300"> ({data.probabilities[mainOutcome]}%)</span>
                </p>
                <p className="text-gray-400">
                    {Object.entries(data.probabilities)
                        .filter(([key]) => key !== mainOutcome)
                        .map(([key, value]) => `${key}: ${value}%`)
                        .join(' | ')}
                </p>
            </div>
        )

    } catch (e) {
        // Fallback for old string format
        return <span className="text-gray-300 whitespace-pre-wrap text-xs">{prediction.replace(/\*/g, '').trim()}</span>;
    }
}

const AIPredictionLog: React.FC = () => {
    const { aiPredictions, updateAIPrediction } = useBetContext();
    const [sportFilter, setSportFilter] = useState('all');
    const [outcomeFilter, setOutcomeFilter] = useState('all');

    const stats = useMemo(() => {
        const settled = aiPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correct = settled.filter(p => p.status === AIPredictionStatus.Correct).length;
        const total = settled.length;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;
        
        const outcomeStats = settled.reduce<Record<string, { correct: number; total: number }>>((acc, p) => {
            try {
                const data = JSON.parse(p.prediction);
                const outcome = data.recommended_outcome;
                if (outcome && ['П1', 'X', 'П2'].includes(outcome)) {
                    if (!acc[outcome]) acc[outcome] = { correct: 0, total: 0 };
                    acc[outcome].total++;
                    if (p.status === AIPredictionStatus.Correct) {
                        acc[outcome].correct++;
                    }
                }
            } catch {}
            return acc;
        }, { 'П1': {correct: 0, total: 0}, 'X': {correct: 0, total: 0}, 'П2': {correct: 0, total: 0} });

        const accuracyByOutcome = Object.entries(outcomeStats).map(([outcome, data]) => ({
            outcome,
            accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
            count: data.total,
        }));
        
        return { total, correct, accuracy, accuracyByOutcome };
    }, [aiPredictions]);

    const filteredPredictions = useMemo(() => {
        return aiPredictions.filter(p => {
            const sportMatch = sportFilter === 'all' || p.sport === sportFilter;
            let outcomeMatch = outcomeFilter === 'all';
            if (outcomeFilter !== 'all') {
                try {
                    const data = JSON.parse(p.prediction);
                    outcomeMatch = data.recommended_outcome === outcomeFilter;
                } catch {
                    outcomeMatch = false;
                }
            }
            return sportMatch && outcomeMatch;
        });
    }, [aiPredictions, sportFilter, outcomeFilter]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">База прогнозов AI</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Всего оценено" value={String(stats.total)} />
                <KpiCard title="Верных прогнозов" value={String(stats.correct)} colorClass="text-green-400" />
                <KpiCard title="Общая точность" value={`${stats.accuracy.toFixed(1)}%`} colorClass="text-indigo-400" />
            </div>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Точность по исходам</h3>
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
                <h3 className="text-lg font-semibold mb-4">Журнал прогнозов</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Select value={sportFilter} onChange={e => setSportFilter(e.target.value)}>
                        <option value="all">Все виды спорта</option>
                        {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                     <Select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
                        <option value="all">Все исходы</option>
                        <option value="П1">П1</option>
                        <option value="X">X</option>
                        <option value="П2">П2</option>
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
                            {filteredPredictions.length > 0 ? filteredPredictions.map(p => (
                                <tr key={p.id} className="hover:bg-gray-800/50">
                                    <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                        {p.matchName}
                                        <p className="text-xs text-gray-500">{p.sport}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <PredictionDetails prediction={p.prediction} />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusInfo(p.status).color}`}>
                                            {getStatusInfo(p.status).label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center text-sm">
                                        {p.status === AIPredictionStatus.Pending ? (
                                            <div className="flex justify-center gap-2">
                                                <Button onClick={() => updateAIPrediction(p.id, AIPredictionStatus.Correct)} className="!text-xs !py-1 !px-2 !bg-green-500/20 hover:!bg-green-500/40 !text-green-300">✅ Верно</Button>
                                                <Button onClick={() => updateAIPrediction(p.id, AIPredictionStatus.Incorrect)} className="!text-xs !py-1 !px-2 !bg-red-500/20 hover:!bg-red-500/40 !text-red-300">❌ Неверно</Button>
                                            </div>
                                        ) : (
                                             <Button onClick={() => updateAIPrediction(p.id, AIPredictionStatus.Pending)} className="!text-xs !py-1 !px-2" variant="secondary">Сбросить</Button>
                                        )}
                                    </td>
                                </tr>
                            )) : (
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