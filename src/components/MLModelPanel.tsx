import React, { useState, useMemo } from 'react';
import { AIPrediction } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { useGingerModel } from '../hooks/useGingerModel';
import { usePredictionContext } from '../contexts/PredictionContext';

const GingerMLPanel: React.FC = () => {
    const { allPredictions: centralPredictions, isLoading } = usePredictionContext();
    
    const allAIPredictions = useMemo(() => 
        centralPredictions
            .filter(p => p.prediction)
            .map(p => p.prediction as AIPrediction), 
    [centralPredictions]);

    const { learnedPatterns, retrain } = useGingerModel(allAIPredictions);
    const [isTraining, setIsTraining] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleRetrain = () => {
        if (isTraining) return;

        setIsTraining(true);
        setProgress(0);

        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 10;
            });
        }, 200);

        setTimeout(() => {
            clearInterval(interval);
            retrain();
            setProgress(100);
            setTimeout(() => {
                setIsTraining(false);
            }, 500);
        }, 2000);
    };

    const topPatterns = learnedPatterns
        .filter(p => p.count >= 3) // Show only patterns with enough data
        .sort((a, b) => b.roi - a.roi)
        .slice(0, 10);

    const worstPatterns = learnedPatterns
        .filter(p => p.count >= 3 && p.roi < 0)
        .sort((a, b) => a.roi - b.roi)
        .slice(0, 5);
        
    if (isLoading) {
        return (
            <Card>
                <p className="text-center text-gray-400">Загрузка данных для модели Джинджер...</p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card>
                <div className="flex flex-col md:flex-row items-center gap-4">
                    <div className="text-4xl">👩‍🔬</div>
                    <div className="flex-1 text-center md:text-left">
                         <h2 className="text-2xl font-bold text-fuchsia-400">Модель «Джинджер»</h2>
                         <p className="mt-1 text-gray-400">
                           Джинджер — это самообучающаяся модель, которая анализирует историю AI-прогнозов, чтобы найти самые прибыльные и убыточные паттерны. Она помогает оценить каждый прогноз AI с точки зрения его глобальной эффективности.
                        </p>
                    </div>
                     <div className="flex flex-col items-center">
                        <Button onClick={handleRetrain} variant="secondary" disabled={isTraining}>
                            {isTraining ? 'Обучение...' : 'Переобучить модель'}
                        </Button>
                        {isTraining && (
                            <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
                                <div className="bg-fuchsia-500 h-2.5 rounded-full transition-all duration-200" style={{ width: `${progress}%` }}></div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <h3 className="text-lg font-semibold mb-4 text-green-400">💡 Топ прибыльных паттернов (AI)</h3>
                     <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="border-b border-gray-700">
                                <tr>
                                    <th className="py-2 text-left">Связка (Спорт + Рынок)</th>
                                    <th className="py-2 text-center">ROI</th>
                                    <th className="py-2 text-center">Прогнозов</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topPatterns.map(p => (
                                    <tr key={p.key} className="border-b border-gray-800">
                                        <td className="py-2">{p.market} <span className="text-gray-500">({p.sport})</span></td>
                                        <td className="py-2 text-center font-bold text-green-400">+{p.roi.toFixed(1)}%</td>
                                        <td className="py-2 text-center">{p.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>

                 <Card>
                    <h3 className="text-lg font-semibold mb-4 text-red-400">⚠️ Самые убыточные паттерны (AI)</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="border-b border-gray-700">
                                <tr>
                                    <th className="py-2 text-left">Связка (Спорт + Рынок)</th>
                                    <th className="py-2 text-center">ROI</th>
                                    <th className="py-2 text-center">Прогнозов</th>
                                </tr>
                            </thead>
                            <tbody>
                                {worstPatterns.map(p => (
                                    <tr key={p.key} className="border-b border-gray-800">
                                        <td className="py-2">{p.market} <span className="text-gray-500">({p.sport})</span></td>
                                        <td className="py-2 text-center font-bold text-red-400">{p.roi.toFixed(1)}%</td>
                                        <td className="py-2 text-center">{p.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default GingerMLPanel;
