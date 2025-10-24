import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import { UpcomingMatch } from '../types';
import { fetchUpcomingMatches } from '../services/aiService';

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
    onMatchClick: (match: UpcomingMatch) => void;
}

const UpcomingMatches: React.FC<UpcomingMatchesProps> = ({ onMatchClick }) => {
    const [matches, setMatches] = useState<UpcomingMatch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    useEffect(() => {
        const loadMatches = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const fetchedMatches = await fetchUpcomingMatches();
                 const sortedMatches = fetchedMatches.sort((a, b) => (b.isHotMatch ? 1 : -1) - (a.isHotMatch ? -1 : 1));
                setMatches(sortedMatches);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка.');
            } finally {
                setIsLoading(false);
            }
        };
        loadMatches();
    }, []);

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSkeleton />;
        }
        if (error) {
            return <p className="text-center text-red-400">{error}</p>;
        }
        if (matches.length === 0) {
            return <p className="text-center text-gray-500">Не удалось найти предстоящих матчей.</p>;
        }
        return (
            <div className="space-y-2">
                {matches.map((match, index) => (
                    <button 
                        key={index}
                        onClick={() => onMatchClick(match)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors duration-200 flex justify-between items-center"
                    >
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{match.sport} &middot; {match.eventName}</p>
                            <p className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                {match.isHotMatch && <FireIcon />}
                                {match.teams}
                            </p>
                            <p className="text-sm text-indigo-500 dark:text-indigo-400">{match.date} &middot; {match.time}</p>
                        </div>
                        <div className="text-sm text-gray-400 hover:text-white">
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
                {renderContent()}
            </div>
        </Card>
    );
};

export default UpcomingMatches;