import React, { useState, useMemo } from 'react';
import Card from './ui/Card';
import { SharedPrediction } from '../types';
import { usePredictionContext } from '../contexts/PredictionContext';

const FireIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM10 4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm0 2a10 10 0 100-20 10 10 0 000 20z" />
    </svg>
);

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);


const LoadingSkeleton: React.FC = () => (
    <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse">
                <div className="w-3/4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                </div>
                <div className="h-8 w-20 bg-gray-200 dark:bg-gray-600 rounded-md"></div>
            </div>
        ))}
    </div>
);


interface UpcomingMatchesProps {
    onMatchClick: (match: SharedPrediction) => void;
}

const sportTabs = [
    { key: 'all', label: 'Все' },
    { key: 'football', label: 'Футбол' },
    { key: 'hockey', label: 'Хоккей' },
    { key: 'basketball', label: 'Баскетбол' },
    { key: 'nba', label: 'NBA' },
];

const getStatusPriority = (statusShort: string): number => {
    const live = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INTR'];
    const scheduled = ['NS', 'TBD'];
    const finished = ['FT', 'AET', 'PEN', 'Finished', 'POST', 'CANC', 'ABD', 'AWD', 'WO'];
    
    if (live.includes(statusShort)) return 1;
    if (scheduled.includes(statusShort)) return 2;
    if (finished.includes(statusShort)) return 3;
    return 4; // Others
};


const UpcomingMatches: React.FC<UpcomingMatchesProps> = ({ onMatchClick }) => {
    const { allPredictions, isLoading, error } = usePredictionContext();
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeSport, setActiveSport] = useState('all');

    const filteredAndSortedMatches = useMemo(() => {
        return allPredictions
            .filter(p => {
                if (activeSport === 'all') {
                    return true;
                }
                // Check against both the key and the mapped value
                return p.sport === activeSport || SPORT_MAP[p.sport] === SPORT_MAP[activeSport];
            })
            .sort((a, b) => {
                const priorityA = getStatusPriority(a.status.short);
                const priorityB = getStatusPriority(b.status.short);
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }
                return a.timestamp - b.timestamp;
            });
    }, [allPredictions, activeSport]);

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />;
        }
        if (error) {
            return <p className="text-center text-red-400">{error}</p>;
        }
        if (filteredAndSortedMatches.length === 0) {
            return <p className="text-center text-gray-500 py-4">Нет матчей для выбранного фильтра.</p>;
        }
        return (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {filteredAndSortedMatches.map((match, index) => (
                    <button
                        key={index}
                        onClick={() => onMatchClick(match)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors duration-200 flex justify-between items-center"
                    >
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{SPORT_MAP[match.sport] || match.sport} &middot; {match.eventName}</p>
                            <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                {match.status.emoji}
                                {match.teams}
                                {match.score && <span className="font-bold ml-2 text-indigo-400">{match.score}</span>}
                            </p>
                            <p className="text-sm text-indigo-500 dark:text-indigo-400">{match.date} &middot; {match.time}</p>
                        </div>
                        <div className="text-sm text-gray-400 hover:text-white flex-shrink-0 ml-2">
                           Анализ &rarr;
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <h3 className="text-lg font-semibold">Ближайшие Матчи</h3>
                <ChevronIcon isOpen={isExpanded} />
            </div>
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                 <div className="flex space-x-1 sm:space-x-2 border-b border-gray-200 dark:border-gray-700 mb-4 pb-2 overflow-x-auto">
                    {sportTabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveSport(tab.key)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                                activeSport === tab.key
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {renderContent()}
            </div>
        </Card>
    );
};

const SPORT_MAP: Record<string, string> = {
    football: 'Футбол',
    basketball: 'Баскетбол',
    hockey: 'Хоккей',
    nba: 'NBA',
    'Футбол': 'Футбол',
    'Баскетбол': 'Баскетбол',
    'Хоккей': 'Хоккей',
};

export default UpcomingMatches;