import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { UpcomingMatch, GroundingSource } from '../types';
import { fetchMatchAnalysis } from '../services/aiService';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
    </div>
);

const MatchDetailsModal: React.FC<{ match: UpcomingMatch; onClose: () => void; }> = ({ match, onClose }) => {
    const [analysis, setAnalysis] = useState<{ text: string; sources?: GroundingSource[] } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const getAnalysis = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const result = await fetchMatchAnalysis(match);
                setAnalysis(result);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Произошла ошибка при загрузке анализа.');
            } finally {
                setIsLoading(false);
            }
        };
        getAnalysis();
    }, [match]);

    const renderContent = () => {
        if (isLoading) {
            return <LoadingSpinner />;
        }
        if (error) {
            return <p className="text-center text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p>;
        }
        if (!analysis) {
            return <p className="text-center text-gray-500">Анализ для этого матча недоступен.</p>;
        }
        return (
            <div>
                 <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{analysis.text}</p>
                 {analysis.sources && analysis.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-400">
                    <h4 className="font-semibold mb-1">Источники:</h4>
                    <ul className="space-y-1 list-disc list-inside">
                      {analysis.sources.map((source, i) => (
                        <li key={i} className="truncate">
                          <a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400 transition-colors">
                            {source.web.title || source.web.uri}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
        );
    };

    return (
        <Modal title={`Анализ: ${match.teams}`} onClose={onClose}>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="pb-2 border-b border-gray-700">
                    <p className="font-bold text-lg text-white">{match.teams}</p>
                    <p className="text-sm text-indigo-300">{match.sport} &middot; {match.eventName}</p>
                    <p className="text-xs text-gray-400">{match.date} &middot; {match.time}</p>
                </div>
                {renderContent()}
            </div>
        </Modal>
    );
};

export default MatchDetailsModal;
