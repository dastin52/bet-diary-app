import React, { useMemo } from 'react';
import { useBetContext } from '../contexts/BetContext';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { AIPrediction, AIPredictionStatus } from '../types';
import Button from './ui/Button';

const getStatusInfo = (status: AIPredictionStatus): { label: string; color: string } => {
    switch (status) {
        case AIPredictionStatus.Correct: return { label: 'Верно', color: 'bg-green-500/20 text-green-400' };
        case AIPredictionStatus.Incorrect: return { label: 'Неверно', color: 'bg-red-500/20 text-red-400' };
        default: return { label: 'В ожидании', color: 'bg-yellow-500/20 text-yellow-400' };
    }
};

const AIPredictionLog: React.FC = () => {
    const { aiPredictions, updateAIPrediction } = useBetContext();

    const stats = useMemo(() => {
        const settled = aiPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
        const correct = settled.filter(p => p.status === AIPredictionStatus.Correct).length;
        const total = settled.length;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;
        
        // FIX: Provide explicit type for the reduce accumulator to fix type inference issues.
        const bySport = aiPredictions.reduce<Record<string, { correct: number; total: number }>>((acc, p) => {
            if (!acc[p.sport]) {
                acc[p.sport] = { correct: 0, total: 0 };
            }
            if (p.status !== AIPredictionStatus.Pending) {
                acc[p.sport].total++;
                if (p.status === AIPredictionStatus.Correct) {
                    acc[p.sport].correct++;
                }
            }
            return acc;
        }, {});
        
        const accuracyBySport = Object.entries(bySport)
            .map(([sport, data]) => ({
                sport,
                accuracy: data.total > 0 ? (data.correct / data.total) * 100 : 0,
                count: data.total,
            }))
            .filter(s => s.count > 0)
            .sort((a, b) => b.count - a.count);

        return {
            total,
            correct,
            accuracy,
            accuracyBySport
        };
    }, [aiPredictions]);

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">База прогнозов AI</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Всего оценено" value={String(stats.total)} />
                <KpiCard title="Верных прогнозов" value={String(stats.correct)} colorClass="text-green-400" />
                <KpiCard title="Общая точность" value={`${stats.accuracy.toFixed(1)}%`} colorClass="text-indigo-400" />
            </div>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Точность по видам спорта</h3>
                {stats.accuracyBySport.length > 0 ? (
                    <div className="space-y-4">
                        {stats.accuracyBySport.map(item => (
                            <div key={item.sport}>
                                <div className="flex justify-between items-center text-sm mb-1">
                                    <span className="font-medium">{item.sport} ({item.count} оценок)</span>
                                    <span className="font-semibold">{item.accuracy.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2.5">
                                    <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${item.accuracy}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-gray-500 py-4">Нет данных для анализа.</p>
                )}
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Журнал прогнозов</h3>
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
                            {aiPredictions.length > 0 ? aiPredictions.map(p => (
                                <tr key={p.id} className="hover:bg-gray-800/50">
                                    <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                        {p.matchName}
                                        <p className="text-xs text-gray-500">{p.sport}</p>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-300 whitespace-pre-wrap">{p.prediction.replace(/\*/g, '').trim()}</td>
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
                                        Нет сохраненных прогнозов.
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
