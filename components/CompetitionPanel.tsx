import React, { useState, useMemo } from 'react';
import Card from './ui/Card';
import { useCompetitionData, TimePeriod, CompetitionParticipant } from '../hooks/useCompetitionData';
import { useAuthContext } from '../contexts/AuthContext';
import GlobalChat from './GlobalChat';
import Tooltip from './ui/Tooltip';
import { WEEKLY_CHALLENGES } from '../constants';
import { Challenge } from '../types';

type LeaderboardType = 'roi' | 'top_winners' | 'unluckiest' | 'most_active';

const leaderboardConfig: Record<LeaderboardType, { title: string; columns: { key: string; label: string; format: (p: CompetitionParticipant) => React.ReactNode }[] }> = {
    roi: {
        title: 'Короли ROI',
        columns: [
            { key: 'roi', label: 'ROI', format: p => <span className={`font-bold ${p.stats.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.stats.roi.toFixed(2)}%</span> },
            { key: 'profit', label: 'Прибыль', format: p => <span className={p.stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{p.stats.totalProfit.toFixed(2)} ₽</span> },
            { key: 'bets', label: 'Ставок', format: p => p.stats.totalBets },
        ]
    },
    top_winners: {
        title: 'Топ выигрыши',
        columns: [
            { key: 'win', label: 'Крупнейший выигрыш', format: p => <span className="font-bold text-green-500">{p.stats.biggestWin.toFixed(2)} ₽</span> },
            { key: 'profit', label: 'Общая прибыль', format: p => <span className={p.stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{p.stats.totalProfit.toFixed(2)} ₽</span> },
            { key: 'bets', label: 'Ставок', format: p => p.stats.totalBets },
        ]
    },
    unluckiest: {
        title: 'Клуб "Неповезло"',
        columns: [
            { key: 'loss', label: 'Крупнейший проигрыш', format: p => <span className="font-bold text-red-500">{p.stats.biggestLoss.toFixed(2)} ₽</span> },
            { key: 'profit', label: 'Общая прибыль', format: p => <span className={p.stats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'}>{p.stats.totalProfit.toFixed(2)} ₽</span> },
            { key: 'bets', label: 'Ставок', format: p => p.stats.totalBets },
        ]
    },
    most_active: {
        title: 'Самые активные',
        columns: [
            { key: 'bets', label: 'Всего ставок', format: p => <span className="font-bold">{p.stats.totalBets}</span> },
            { key: 'staked', label: 'Сумма ставок', format: p => `${p.stats.totalStaked.toFixed(2)} ₽` },
            { key: 'roi', label: 'ROI', format: p => <span className={`font-bold ${p.stats.roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>{p.stats.roi.toFixed(2)}%</span> },
        ]
    },
};

const periodOptions: { key: TimePeriod; label: string }[] = [
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'year', label: 'Год' },
    { key: 'all_time', label: 'Все время' },
];
const leaderboardOptions: { key: LeaderboardType; label: string }[] = [
    { key: 'roi', label: 'ROI' },
    { key: 'top_winners', label: 'Топ выигрыши' },
    { key: 'unluckiest', label: 'Топ проигрыши' },
    { key: 'most_active', label: 'Активность' },
];

const TabButton: React.FC<{ onClick: () => void, isActive: boolean, children: React.ReactNode }> = ({ onClick, isActive, children }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
    >
        {children}
    </button>
);


const ChallengeCard: React.FC<{ challenge: Challenge, participants: CompetitionParticipant[] }> = ({ challenge, participants }) => {
    
    const leaders = useMemo(() => {
        let sorted: CompetitionParticipant[] = [];
        switch(challenge.metric) {
            case 'biggest_win':
                sorted = [...participants].sort((a,b) => b.stats.biggestWin - a.stats.biggestWin);
                break;
            case 'highest_roi':
                 sorted = [...participants].filter(p => p.stats.totalBets >= 10).sort((a,b) => b.stats.roi - a.stats.roi);
                break;
            case 'highest_parlay_odds':
                // This metric is not directly available, so we'll leave it empty for now
                // In a real scenario, this would be pre-calculated
                break;
            default:
                sorted = [];
        }
        return sorted.slice(0, 3);
    }, [challenge, participants]);

    const getMetricDisplay = (participant: CompetitionParticipant) => {
        switch(challenge.metric) {
            case 'biggest_win': return `${participant.stats.biggestWin.toFixed(2)} ₽`;
            case 'highest_roi': return `${participant.stats.roi.toFixed(2)}%`;
            default: return '';
        }
    };
    
    return (
        <div className="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-lg">
            <h4 className="font-bold text-indigo-600 dark:text-indigo-400">{challenge.title}</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{challenge.description}</p>
            <ul className="space-y-1 text-sm">
                {leaders.map((leader, index) => (
                    <li key={leader.user.email} className="flex justify-between">
                        <span>{index + 1}. {leader.user.nickname}</span>
                        <span className="font-mono font-semibold">{getMetricDisplay(leader)}</span>
                    </li>
                ))}
                 {leaders.length === 0 && <li className="text-center text-xs text-gray-500">Пока нет лидеров.</li>}
            </ul>
        </div>
    )
}


const CompetitionPanel: React.FC = () => {
    const { leaderboards, isLoading, setPeriod, currentPeriod } = useCompetitionData();
    const [currentLeaderboard, setCurrentLeaderboard] = useState<LeaderboardType>('roi');
    const [isFading, setIsFading] = useState(false);
    const { currentUser } = useAuthContext();
    
    const activeLeaderboardData = leaderboards[currentLeaderboard];
    const weeklyParticipants = useMemo(() => leaderboards.roi.filter(p => {
        const weeklyBoard = new Set(leaderboards.roi.map(u => u.user.email)); // Assuming weekly data is based on one of the boards for simplicity
        return weeklyBoard.has(p.user.email);
    }), [leaderboards.roi]);

    const config = leaderboardConfig[currentLeaderboard];

    const handleFilterChange = (setter: Function, newValue: any, currentValue: any) => {
        if (newValue === currentValue) return;
        setIsFading(true);
        setTimeout(() => {
            setter(newValue);
            setIsFading(false);
        }, 200);
    };

    const getRowClass = (email: string) => {
        if (email === currentUser?.email) return 'bg-indigo-100/50 dark:bg-indigo-900/50';
        return 'hover:bg-gray-50 dark:hover:bg-gray-800/50';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                 <Card>
                     <h2 className="text-xl font-semibold mb-4">Еженедельные Челленджи</h2>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {WEEKLY_CHALLENGES.map(challenge => (
                            <ChallengeCard key={challenge.id} challenge={challenge} participants={weeklyParticipants} />
                        ))}
                     </div>
                 </Card>
                 <Card>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                        <h2 className="text-xl font-semibold">{config.title}</h2>
                        <div className="flex flex-wrap gap-2">
                             {periodOptions.map(opt => <TabButton key={opt.key} isActive={currentPeriod === opt.key} onClick={() => handleFilterChange(setPeriod, opt.key, currentPeriod)}>{opt.label}</TabButton>)}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
                        {leaderboardOptions.map(opt => <TabButton key={opt.key} isActive={currentLeaderboard === opt.key} onClick={() => handleFilterChange(setCurrentLeaderboard, opt.key, currentLeaderboard)}>{opt.label}</TabButton>)}
                    </div>

                     <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ранг</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Никнейм</th>
                                {config.columns.map(col => (
                                    <th key={col.key} scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{col.label}</th>
                                ))}
                            </tr>
                            </thead>
                            <tbody className={`bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700 transition-opacity duration-200 ${isFading ? 'opacity-0' : 'opacity-100'}`}>
                            {isLoading ? (
                                <tr><td colSpan={3 + config.columns.length} className="text-center py-10 text-gray-500">Загрузка таблицы лидеров...</td></tr>
                            ) : activeLeaderboardData.length > 0 ? (
                                activeLeaderboardData.map(p => (
                                <tr key={p.user.email} className={getRowClass(p.user.email)}>
                                    <td className="px-4 py-3 text-sm text-center font-bold">{p.stats.rank}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-2">
                                            <span>{p.user.nickname}</span>
                                            {p.stats.achievements.map(ach => (
                                                <Tooltip key={ach.id} content={`${ach.name}: ${ach.description}`}>
                                                    <span className="text-lg cursor-default">{ach.icon}</span>
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </td>
                                    {config.columns.map(col => (
                                        <td key={col.key} className="px-4 py-3 text-sm text-center">{col.format(p)}</td>
                                    ))}
                                </tr>
                                ))
                            ) : (
                                <tr><td colSpan={3 + config.columns.length} className="text-center py-10 text-gray-500">Нет участников для отображения в этом периоде.</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            <div className="lg:col-span-1">
                 <GlobalChat />
            </div>
        </div>
    )
};

export default CompetitionPanel;
