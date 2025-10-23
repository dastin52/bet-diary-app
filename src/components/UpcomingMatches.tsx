import React, { useState } from 'react';
import Card from './ui/Card';
import { SharedPrediction } from '../types';
import { usePredictionContext } from '../contexts/PredictionContext';

const TABS = [
    { key: 'football', label: '⚽️ Футбол' },
    { key: 'hockey', label: '🏒 Хоккей' },
    { key: 'basketball', label: '🏀 Баскетбол' },
    { key: 'nba', label: '🏀 NBA' },
];

const LoadingSkeleton: React.FC = () => (
    <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse">
                <div className="w-3/4 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
                </div>
                <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-full"></div>
            </div>
        ))}
    </div>
);

const UpcomingMatches: React.FC = () => {
    const { predictions, isLoading, error, activeSport, setSport } = usePredictionContext();
    const [isExpanded, setIsExpanded] = useState(true);
    
    const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 text-gray-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />;
        }
        if (error) {
            return <p className="text-center text-red-400 py-4">{error}</p>;
        }
        if (predictions.length === 0) {
            return <p className="text-center text-gray-500 py-4">На сегодня матчей не найдено.</p>;
        }
        return (
            <div className="space-y-2">
                {predictions.map((match, index) => (
                    <div key={index} className="p-3 rounded-lg flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                        <div>
                             <p className="text-xs text-gray-500 dark:text-gray-400">{match.eventName}</p>
                            <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                {match.teams}
                                {match.score && <span className="ml-2 font-mono bg-gray-200 dark:bg-gray-600 px-2 py-0.5 rounded text-sm">{match.score}</span>}
                            </p>
                            <p className="text-sm text-indigo-500 dark:text-indigo-400">{match.time} <span className="text-xs text-gray-400">(МСК)</span></p>
                        </div>
                        <div className="text-2xl" title={match.status.long}>
                           {match.status.emoji}
                        </div>
                    </div>
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
             <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="flex space-x-1 sm:space-x-2 border-b border-gray-200 dark:border-gray-700 my-4 overflow-x-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setSport(tab.key)}
                            className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                                activeSport === tab.key
                                    ? 'border-b-2 border-indigo-500 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="max-h-[300px] overflow-y-auto pr-2">
                    {renderContent()}
                </div>
            </div>
        </Card>
    );
};

export default UpcomingMatches;