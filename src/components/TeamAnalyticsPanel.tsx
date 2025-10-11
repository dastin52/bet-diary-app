import React, { useState, useMemo } from 'react';
import { TeamStats } from '../types';
import Card from './ui/Card';
import Input from './ui/Input';
import Select from './ui/Select';
import { SPORTS } from '../constants';

type SortKey = keyof TeamStats | 'ml_insight';
type SortDirection = 'asc' | 'desc';

const getMLInsight = (team: TeamStats): { text: string; icon: string; color: string } => {
    if (team.roi > 15 && team.betCount >= 3) {
        return { text: "Недооценена", icon: "💎", color: "text-cyan-400" };
    }
    if (team.roi < -20 && team.betCount >= 3) {
        return { text: "Переоценена", icon: "📉", color: "text-red-400" };
    }
    if (team.winRate > 65 && team.betCount >= 5) {
        return { text: "Надежный фаворит", icon: "✅", color: "text-green-400" };
    }
    if (team.winRate < 40 && team.betCount >= 5) {
        return { text: "Рискованные ставки", icon: "⚠️", color: "text-yellow-400" };
    }
    if (team.avgOdds > 3.5 && team.roi > 5) {
        return { text: "Прибыльный андердог", icon: "🚀", color: "text-purple-400" };
    }
    return { text: "Стандартные показатели", icon: "📊", color: "text-gray-400" };
};

const SortableHeader: React.FC<{
    label: string;
    sortKey: SortKey;
    sortConfig: { key: SortKey; direction: SortDirection } | null;
    onSort: (key: SortKey) => void;
    className?: string;
}> = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
    const isSorting = sortConfig?.key === sortKey;
    const direction = isSorting ? sortConfig.direction : null;
    
    return (
        <th scope="col" className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer ${className}`} onClick={() => onSort(sortKey)}>
            <div className="flex items-center justify-center">
                {label}
                <span className="ml-2 w-4">
                    {isSorting && (direction === 'asc' ? '🔼' : '🔽')}
                </span>
            </div>
        </th>
    );
};


const TeamAnalyticsPanel: React.FC<{ teamStats: TeamStats[] }> = ({ teamStats }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSport, setSelectedSport] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>({ key: 'totalProfit', direction: 'desc' });

    const sortedAndFilteredData = useMemo(() => {
        let data = [...teamStats];

        if (selectedSport !== 'all') {
            data = data.filter(t => t.sport === selectedSport);
        }

        if (searchTerm) {
            data = data.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        if (sortConfig !== null) {
            data.sort((a, b) => {
                const aValue = a[sortConfig.key as keyof TeamStats];
                const bValue = b[sortConfig.key as keyof TeamStats];
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return data;
    }, [teamStats, searchTerm, selectedSport, sortConfig]);

    const handleSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    return (
        <Card>
            <h2 className="text-xl font-semibold mb-4">Аналитика команд на основе ставок</h2>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <Input
                    type="text"
                    placeholder="Поиск по названию команды..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-grow"
                />
                <Select
                    value={selectedSport}
                    onChange={e => setSelectedSport(e.target.value)}
                    className="md:max-w-xs"
                >
                    <option value="all">Все виды спорта</option>
                    {SPORTS.map(sport => <option key={sport} value={sport}>{sport}</option>)}
                </Select>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead className="bg-gray-800">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Команда</th>
                            <SortableHeader label="Ставок" sortKey="betCount" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                            <SortableHeader label="Win Rate" sortKey="winRate" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                            <SortableHeader label="Прибыль" sortKey="totalProfit" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                            <SortableHeader label="ROI" sortKey="roi" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                            <SortableHeader label="Ср. Коэф." sortKey="avgOdds" sortConfig={sortConfig} onSort={handleSort} className="text-center" />
                            <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">ML Инсайт</th>
                        </tr>
                    </thead>
                     <tbody className="bg-gray-900 divide-y divide-gray-700">
                        {sortedAndFilteredData.length > 0 ? (
                            sortedAndFilteredData.map(team => {
                                const insight = getMLInsight(team);
                                return (
                                    <tr key={team.name} className="hover:bg-gray-800/50">
                                        <td className="px-4 py-3 text-sm font-medium text-white">
                                            {team.name}
                                            <p className="text-xs text-gray-500">{team.sport}</p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-center text-gray-300">{team.betCount}</td>
                                        <td className="px-4 py-3 text-sm text-center text-gray-300 font-medium">{team.winRate.toFixed(1)}%</td>
                                        <td className={`px-4 py-3 text-sm text-center font-bold ${team.totalProfit > 0 ? 'text-green-400' : team.totalProfit < 0 ? 'text-red-400' : 'text-gray-300'}`}>{team.totalProfit.toFixed(2)} ₽</td>
                                        <td className={`px-4 py-3 text-sm text-center font-bold ${team.roi > 0 ? 'text-green-400' : team.roi < 0 ? 'text-red-400' : 'text-gray-300'}`}>{team.roi.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-sm text-center text-gray-300">{team.avgOdds.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-sm text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="text-lg">{insight.icon}</span>
                                                <span className={insight.color}>{insight.text}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                             <tr>
                                <td colSpan={7} className="text-center py-10 text-gray-500">
                                    Нет данных по вашему запросу.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default TeamAnalyticsPanel;