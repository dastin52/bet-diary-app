import React from 'react';
import { Bet } from '../types';
import Card from './ui/Card';
import KpiCard from './ui/KpiCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { OddsPerformanceTooltip } from './charts/ChartTooltip';
import Button from './ui/Button';

interface MLModelPanelProps {
    allBets: Bet[];
    performanceByOdds: { range: string; wins: number; losses: number; winRate: number; roi: number; }[];
}

const keyFactors = [
    "Ставки на явных фаворитов (коэф. < 1.5) имеют высокий % прохода, но низкий ROI.",
    "Экспрессы с 4+ событиями показывают отрицательный ROI на дистанции.",
    "Ставки на 'Тотал Больше' в футболе более прибыльны, чем 'Тотал Меньше'.",
    "Наивысший ROI наблюдается на ставках с коэффициентом в диапазоне 2.0 - 2.5.",
    "Пользователи чаще проигрывают ставки, сделанные на киберспорт в ночное время."
];

const MLModelPanel: React.FC<MLModelPanelProps> = ({ allBets, performanceByOdds }) => {
    return (
        <div className="space-y-6">
            <h2 className="text-xl font-semibold">Панель управления ML Моделью</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Точность модели" value="72.3%" subtext="На основе последних 1000 прогнозов" colorClass="text-indigo-400" />
                <KpiCard title="Обработано ставок" value={String(allBets.length)} subtext="Всего ставок в датасете" />
                <Card className="flex flex-col justify-center items-center">
                    <Button disabled>Переобучить модель</Button>
                    <p className="text-xs text-gray-500 mt-2 text-center">Следующее переобучение через 24ч</p>
                </Card>
            </div>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Ключевые факторы, влияющие на результат</h3>
                <ul className="space-y-2 list-disc list-inside text-gray-300">
                    {keyFactors.map((factor, index) => (
                        <li key={index}>{factor}</li>
                    ))}
                </ul>
            </Card>

            <Card>
                <h3 className="text-lg font-semibold mb-4">Глобальная производительность по коэффициентам</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart
                            data={performanceByOdds}
                            margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                            <XAxis dataKey="range" stroke="#A0AEC0" tick={{ fontSize: 12 }} />
                            <YAxis yAxisId="left" orientation="left" stroke="#8884d8" tick={{ fontSize: 12 }} />
                            <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" tick={{ fontSize: 12 }} />
                            <Tooltip cursor={{ fill: 'rgba(136, 132, 216, 0.1)' }} content={<OddsPerformanceTooltip />} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="wins" stackId="a" name="Выигрыши" fill="#48BB78" />
                            <Bar yAxisId="left" dataKey="losses" stackId="a" name="Проигрыши" fill="#F56565" />
                            <Bar yAxisId="right" dataKey="roi" name="ROI (%)" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        </div>
    );
};

export default MLModelPanel;