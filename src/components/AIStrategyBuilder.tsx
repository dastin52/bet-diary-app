import React, { useState, useCallback } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useBetContext } from '../contexts/BetContext';
import { fetchAIStrategy } from '../services/aiService';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
    </div>
);

const AIStrategyBuilder: React.FC = () => {
    const { analytics } = useBetContext();
    const [strategy, setStrategy] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFetchStrategy = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setStrategy(null);
        try {
            const result = await fetchAIStrategy(analytics);
            setStrategy(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка');
        } finally {
            setIsLoading(false);
        }
    }, [analytics]);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <Card>
                <div className="text-center">
                    <h2 className="text-2xl font-bold">Персональный AI-Стратег</h2>
                    <p className="mt-2 text-gray-400">
                        Получите глубокий анализ вашей игровой статистики и действенные советы по улучшению стратегии,
                        сгенерированные искусственным интеллектом на основе ваших данных.
                    </p>
                    <Button onClick={handleFetchStrategy} disabled={isLoading} className="mt-6">
                        {isLoading ? 'Анализирую данные...' : 'Получить рекомендации'}
                    </Button>
                </div>
            </Card>

            {isLoading && <LoadingSpinner />}
            {error && <Card><p className="text-center text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p></Card>}
            {strategy && (
                <Card>
                    <h3 className="text-xl font-semibold mb-4">Ваша персональная стратегия</h3>
                    <div className="prose prose-invert prose-sm sm:prose-base max-w-none whitespace-pre-wrap leading-relaxed text-gray-300">
                        {strategy}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AIStrategyBuilder;