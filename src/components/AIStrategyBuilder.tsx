import React, { useState, useCallback } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useBetContext } from '../contexts/BetContext';
import { fetchAIStrategy, fetchAIPredictionAnalysis } from '../services/aiService';
import { AIPredictionStatus } from '../types';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
    </div>
);

const AIStrategyBuilder: React.FC = () => {
    const { analytics, aiPredictions } = useBetContext();
    const [strategy, setStrategy] = useState<string | null>(null);
    const [predictionAnalysis, setPredictionAnalysis] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetchStrategy = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setStrategy(null);
        setPredictionAnalysis(null);
        try {
            const result = await fetchAIStrategy(analytics);
            setStrategy(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка');
        } finally {
            setIsLoading(false);
        }
    }, [analytics]);

    const handleFetchPredictionAnalysis = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setStrategy(null);
        setPredictionAnalysis(null);

        try {
            const settled = aiPredictions.filter(p => p.status !== AIPredictionStatus.Pending);
            const correct = settled.filter(p => p.status === AIPredictionStatus.Correct).length;
            const total = settled.length;
            const accuracy = total > 0 ? (correct / total) * 100 : 0;

            const statsBySport = settled.reduce((acc, p) => {
                const sport = p.sport;
                if (!acc[sport]) acc[sport] = { correct: 0, total: 0 };
                acc[sport].total++;
                if (p.status === AIPredictionStatus.Correct) acc[sport].correct++;
                return acc;
            }, {} as Record<string, { correct: number, total: number }>);

            const analyticsText = `
Общая статистика:
- Всего оценено: ${total}
- Верно: ${correct}
- Точность: ${accuracy.toFixed(1)}%

Точность по видам спорта:
${Object.entries(statsBySport).map(([sport, data]) => 
`- ${sport}: ${(data.total > 0 ? (data.correct / data.total) * 100 : 0).toFixed(1)}% (${data.correct}/${data.total})`
).join('\n')}
`;
            
            const result = await fetchAIPredictionAnalysis(analyticsText);
            setPredictionAnalysis(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка');
        } finally {
            setIsLoading(false);
        }
    }, [aiPredictions]);


    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Card>
                <div className="text-center">
                    <h2 className="text-2xl font-bold">Персональный AI-Стратег</h2>
                    <p className="mt-2 text-gray-400">
                        Получите глубокий анализ вашей игровой статистики или производительности AI-прогнозов.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4 mt-6">
                        <Button onClick={handleFetchStrategy} disabled={isLoading} variant="primary">
                            {isLoading && !predictionAnalysis ? 'Анализ...' : 'Анализ моей стратегии'}
                        </Button>
                         <Button onClick={handleFetchPredictionAnalysis} disabled={isLoading} variant="secondary">
                            {isLoading && !strategy ? 'Анализ...' : 'Анализ прогнозов AI'}
                        </Button>
                    </div>
                </div>
            </Card>

            {isLoading && <LoadingSpinner />}
            {error && <Card><p className="text-center text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p></Card>}
            
            {strategy && (
                <Card>
                    <h3 className="text-xl font-semibold mb-4">Рекомендации по вашей стратегии</h3>
                    <div className="prose prose-invert prose-sm sm:prose-base max-w-none whitespace-pre-wrap leading-relaxed text-gray-300">
                        {strategy}
                    </div>
                </Card>
            )}

            {predictionAnalysis && (
                 <Card>
                    <h3 className="text-xl font-semibold mb-4">Анализ производительности прогнозов AI</h3>
                    <div className="prose prose-invert prose-sm sm:prose-base max-w-none whitespace-pre-wrap leading-relaxed text-gray-300">
                        {predictionAnalysis}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AIStrategyBuilder;