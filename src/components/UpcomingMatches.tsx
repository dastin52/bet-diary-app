import React, { useState, useMemo } from 'react';
import Card from './ui/Card';
import { SharedPrediction } from '../types';
import { usePredictionContext } from '../contexts/PredictionContext';

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

const LoadingSkeleton: React.FC = () => (
    <div className="space-y-3 p-2">
        {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse">
                <div className="w-3/4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                </div>
                <div className="h-5 w-20 bg-gray-200 dark:bg-gray-600 rounded-md"></div>
            </div>
        ))}
    </div>
);

const sportTabs = [
    { key: 'all', label: 'Все' },
    { key: 'football', label: 'Футбол' },
    { key: 'hockey', label: 'Хоккей' },
    { key: 'basketball', label: 'Баскетбол' },
    { key: 'nba', label: 'NBA' },
];

const SPORT_MAP: Record<string, string> = {
    football: 'Футбол',
    basketball: 'Баскетбол',
    hockey: 'Хоккей',
    nba: 'NBA',
    Футбол: 'Футбол',
    Баскетбол: 'Баскетбол',
    Хоккей: 'Хоккей',
};

const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'Finished'];

interface UpcomingMatchesProps {
    onMatchClick: (match: SharedPrediction) => void;
}

const UpcomingMatches: React.FC<UpcomingMatchesProps> = ({ onMatchClick }) => {
    const { allPredictions, isLoading, error } = usePredictionContext();
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeSport, setActiveSport] = useState('all');

    const filteredMatches = useMemo(() => {
        return allPredictions
            .filter(p => !FINISHED_STATUSES.includes(p.status.short))
            .filter(p => {
                const sportLower = p.sport.toLowerCase();
                if (activeSport === 'all') return true;
                if (activeSport === 'nba') {
                    return sportLower === 'nba' || (sportLower === 'basketball' && p.eventName.toUpperCase() === 'NBA');
                }
                if (activeSport === 'basketball') {
                    return sportLower === 'basketball' && p.eventName.toUpperCase() !== 'NBA';
                }
                return sportLower === activeSport || (SPORT_MAP[sportLower] && SPORT_MAP[sportLower].toLowerCase() === activeSport);
            })
            .sort((a, b) => a.timestamp - b.timestamp);
    }, [allPredictions, activeSport]);

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />;
        }
        if (filteredMatches.length === 0 && !error) {
            return <p className="text-center text-gray-500 py-4">Нет матчей для выбранного фильтра.</p>;
        }
        return (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2 mt-4">
                {filteredMatches.map((match) => (
                    <button
                        key={match.id}
                        onClick={() => onMatchClick(match)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors duration-200 flex justify-between items-center"
                    >
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{SPORT_MAP[match.sport.toLowerCase()] || match.sport} &middot; {match.eventName}</p>
                            <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                               {match.status.emoji} {match.teams}
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
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                {error && (
                    <div className="bg-amber-900/50 border border-amber-800 text-amber-300 text-sm rounded-lg p-3 my-4">
                       {error}
                    </div>
                )}
                <div className="flex space-x-1 sm:space-x-2 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
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

export default UpcomingMatches;