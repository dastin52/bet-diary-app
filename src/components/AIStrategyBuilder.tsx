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

const matchAnalysisTemplate = `Проанализируй матч: [Матч] - [Турнир].
Вид спорта: [Вид спорта].
ДАТА МАТЧА: [ДД.ММ.ГГГГ].
ДАТА АНАЛИЗА: Используй текущую системную дату.
Команда 1: [Название 1]. Последние 5:
[Результаты]. Травмы/Новости: [Данные].
Команда 2: [Название 2]. Последние 5:
[Результаты]. Травмы/Новости: [Данные].
Очные встречи (5 последних) :
[Результаты]. Стиль игры: [Команда 1] vs [Команда 2].
Факторы: [Погода, Судья, Усталость].
На основе текущей даты и всех предоставленных данных, создай комплексный анализ, включающий тактический прогноз, три вероятных сценария и итоговую рекомендацию на матч. Учти любые изменения в составах или новостной фон, произошедшие после последних матчей команд.`;

interface AIStrategyBuilderProps {
    onOpenAIChat: () => void;
}

const AIStrategyBuilder: React.FC<AIStrategyBuilderProps> = ({ onOpenAIChat }) => {
    const { analytics } = useBetContext();
    const [strategy, setStrategy] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copyText, setCopyText] = useState('Скопировать шаблон');

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

    const handleCopyTemplate = () => {
        navigator.clipboard.writeText(matchAnalysisTemplate);
        setCopyText('Скопировано!');
        setTimeout(() => setCopyText('Скопировать шаблон'), 2000);
    };

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

            <Card>
                <h3 className="text-xl font-semibold mb-4">Шаблон для анализа матча</h3>
                <p className="text-sm text-gray-400 mb-4">
                    Скопируйте этот шаблон, замените плейсхолдеры `[...]` вашими данными и вставьте в чат с AI-Аналитиком для получения детального разбора.
                </p>
                <textarea
                    readOnly
                    rows={10}
                    className="block w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md shadow-sm sm:text-sm text-gray-300 font-mono"
                    value={matchAnalysisTemplate}
                />
                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <Button onClick={handleCopyTemplate} variant="secondary">
                        {copyText}
                    </Button>
                    <Button onClick={onOpenAIChat}>
                        Открыть чат с AI
                    </Button>
                </div>
            </Card>
        </div>
    );
};

export default AIStrategyBuilder;