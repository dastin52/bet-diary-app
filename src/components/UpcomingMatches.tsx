import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import { UpcomingMatch, AIPrediction } from '../types';
import { useBetContext } from '../contexts/BetContext';

const FireIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 S`a`t` -1.898-.632l4-12a1 1 0 011.265-.633zM10 4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm0 2a10 10 0 100-20 10 10 0 000 20z" />
    </svg>
);

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
    const { addMultipleAIPredictions, resolveAIPredictions } = useBetContext();
    const [matches, setMatches] = useState<UpcomingMatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeSport, setActiveSport] = useState('football');

    useEffect(() => {
        const loadMatches = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch(`/api/matches-with-predictions?sport=${activeSport}`);
                if (!response.ok) {
                     const errorData = await response.json();
                    throw new Error(errorData.error || 'Не удалось загрузить матчи.');
                }
                const data: { matches: UpcomingMatch[], newPredictions: Omit<AIPrediction, 'id' | 'createdAt' | 'status'>[] } = await response.json();
                
                if (data.newPredictions && data.newPredictions.length > 0) {
                    addMultipleAIPredictions(data.newPredictions);
                }
                
                const finishedMatches = (data.matches || []).filter(m => typeof m.winner !== 'undefined');
                if (finishedMatches.length > 0) {
                    resolveAIPredictions(finishedMatches);
                }

                const sortedMatches = (data.matches || []).sort((a, b) => (b.isHotMatch ? 1 : -1) - (a.isHotMatch ? -1 : 1));
                setMatches(sortedMatches);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка.');
            } finally {
                setIsLoading(false);
            }
        };
        loadMatches();
    }, [activeSport, addMultipleAIPredictions, resolveAIPredictions]);

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />;
        }
        if (error) {
            return <p className="text-center text-red-400 py-4">{error}</p>;
        }
        if (matches.length === 0) {
            return <p className="text-center text-gray-500 py-4">На сегодня матчей не найдено.</p>;
        }
        return (
            <div className="space-y-2">
                {matches.map((match, index) => (
                    <div key={index} className="p-3 rounded-lg flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                        <div>
                             <p className="text-xs text-gray-500 dark:text-gray-400">{match.eventName}</p>
                            <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                {match.isHotMatch && <FireIcon />}
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
            <h3 className="text-lg font-semibold mb-4">Ближайшие Матчи</h3>
             <div className="flex space-x-1 sm:space-x-2 border-b border-gray-200 dark:border-gray-700 mb-4 overflow-x-auto">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveSport(tab.key)}
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
        </Card>
    );
};

export default UpcomingMatches;