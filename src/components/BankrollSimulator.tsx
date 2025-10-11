import React, { useState, useMemo } from 'react';
import Card from './ui/Card';
import Input from './ui/Input';
import Label from './ui/Label';
import Button from './ui/Button';
import KpiCard from './ui/KpiCard';
import { useBetContext } from '../contexts/BetContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface SimulationParams {
    startBankroll: number;
    numBets: number;
    stakePercentage: number;
    avgOdds: number;
    winRate: number;
    numSimulations: number;
}

interface SimulationResult {
    paths: number[][];
    endBankrolls: number[];
    ruinCount: number;
}

const runSimulation = (params: SimulationParams): SimulationResult => {
    const paths: number[][] = [];
    const endBankrolls: number[] = [];
    let ruinCount = 0;

    for (let i = 0; i < params.numSimulations; i++) {
        let currentBankroll = params.startBankroll;
        const path = [currentBankroll];
        let isRuined = false;

        for (let j = 0; j < params.numBets; j++) {
            if (isRuined || currentBankroll <= 0) {
                path.push(0);
                continue;
            }

            const stake = currentBankroll * (params.stakePercentage / 100);
            if (currentBankroll - stake < 0) {
                isRuined = true;
                ruinCount++;
                path.push(0);
                continue;
            }

            if (Math.random() < params.winRate / 100) {
                currentBankroll += stake * (params.avgOdds - 1);
            } else {
                currentBankroll -= stake;
            }
            path.push(currentBankroll);
        }
        paths.push(path);
        endBankrolls.push(currentBankroll);
    }
    return { paths, endBankrolls, ruinCount };
};

const BankrollSimulator: React.FC = () => {
    const { bankroll, analytics } = useBetContext();
    const [params, setParams] = useState<SimulationParams>({
        startBankroll: Math.round(bankroll),
        numBets: 100,
        stakePercentage: 2,
        avgOdds: analytics.betCount > 0 ? analytics.totalStaked / analytics.betCount > 0 ? (analytics.totalStaked / analytics.betCount) * analytics.winRate / 100 + 1 : 2.0 : 2.0,
        winRate: analytics.winRate > 0 ? analytics.winRate : 50,
        numSimulations: 20,
    });
    const [results, setResults] = useState<SimulationResult | null>(null);

    const handleParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setParams({ ...params, [e.target.name]: parseFloat(e.target.value) });
    };

    const handleRun = () => {
        setResults(runSimulation(params));
    };

    const chartData = useMemo(() => {
        if (!results) return [];
        const data = [];
        for (let i = 0; i <= params.numBets; i++) {
            const point: { [key: string]: number } = { name: i };
            for (let j = 0; j < results.paths.length; j++) {
                point[`sim${j}`] = results.paths[j][i];
            }
            data.push(point);
        }
        return data;
    }, [results, params.numBets]);

    const stats = useMemo(() => {
        if (!results) return null;
        const avgEnd = results.endBankrolls.reduce((a, b) => a + b, 0) / results.endBankrolls.length;
        const maxEnd = Math.max(...results.endBankrolls);
        const minEnd = Math.min(...results.endBankrolls);
        const ruinProb = (results.ruinCount / params.numSimulations) * 100;
        return { avgEnd, maxEnd, minEnd, ruinProb };
    }, [results, params.numSimulations]);

    return (
        <div className="space-y-6">
            <Card>
                <h2 className="text-xl font-semibold">Симулятор Банка (Метод Монте-Карло)</h2>
                <p className="text-sm text-gray-400 mt-1">Протестируйте свою стратегию, чтобы увидеть возможные долгосрочные результаты.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-4">
                    <div><Label>Начальный банк</Label><Input type="number" name="startBankroll" value={params.startBankroll} onChange={handleParamChange}/></div>
                    <div><Label>Кол-во ставок</Label><Input type="number" name="numBets" value={params.numBets} onChange={handleParamChange}/></div>
                    <div><Label>Ставка (% от банка)</Label><Input type="number" name="stakePercentage" value={params.stakePercentage} onChange={handleParamChange}/></div>
                    <div><Label>Средний коэф.</Label><Input type="number" name="avgOdds" step="0.1" value={params.avgOdds} onChange={handleParamChange}/></div>
                    <div><Label>Проходимость (%)</Label><Input type="number" name="winRate" value={params.winRate} onChange={handleParamChange}/></div>
                    <div><Label>Кол-во симуляций</Label><Input type="number" name="numSimulations" max="50" value={params.numSimulations} onChange={handleParamChange}/></div>
                </div>
                <div className="text-center mt-4">
                    <Button onClick={handleRun}>Запустить симуляцию</Button>
                </div>
            </Card>

            {results && stats && (
                 <Card>
                    <h3 className="text-lg font-semibold mb-4">Результаты симуляции</h3>
                     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-center">
                        <KpiCard title="Средний итог" value={`${stats.avgEnd.toFixed(2)} ₽`} colorClass={stats.avgEnd > params.startBankroll ? 'text-green-400' : 'text-red-400'} />
                        <KpiCard title="Лучший итог" value={`${stats.maxEnd.toFixed(2)} ₽`} colorClass="text-green-400" />
                        <KpiCard title="Худший итог" value={`${stats.minEnd.toFixed(2)} ₽`} colorClass="text-red-400" />
                        <KpiCard title="Вероятность разорения" value={`${stats.ruinProb.toFixed(1)}%`} colorClass={stats.ruinProb > 20 ? 'text-red-400' : 'text-yellow-400'} />
                    </div>
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                                <XAxis dataKey="name" stroke="#A0AEC0" label={{ value: 'Количество ставок', position: 'insideBottom', offset: -5 }} />
                                <YAxis stroke="#A0AEC0" />
                                <Tooltip wrapperClassName="!bg-gray-800 border-gray-700" />
                                <ReferenceLine y={params.startBankroll} label="Старт" stroke="#FBBF24" strokeDasharray="3 3" />
                                {results.paths.map((_, i) => (
                                    <Line key={i} type="monotone" dataKey={`sim${i}`} stroke="#60A5FA" opacity={0.3} dot={false} />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default BankrollSimulator;