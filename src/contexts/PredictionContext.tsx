import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SharedPrediction } from '../types';

const SPORTS_TO_FETCH = ['football', 'hockey', 'basketball', 'nba'];

interface PredictionContextType {
  allPredictions: SharedPrediction[];
  isLoading: boolean;
  error: string | null;
  fetchAllPredictions: (force?: boolean) => void;
}

const PredictionContext = createContext<PredictionContextType | undefined>(undefined);

export const PredictionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [allPredictions, setAllPredictions] = useState<SharedPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllPredictions = useCallback(async (force: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const sportPromises = SPORTS_TO_FETCH.map(sport => 
        fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: 'getMatchesWithPredictions',
                payload: { sport }
            }),
        }).then(async (res) => {
          if (!res.ok) {
            console.error(`Не удалось загрузить прогнозы для спорта: ${sport}`);
            // Не прерываем выполнение, просто возвращаем пустой массив для этого вида спорта
            return [];
          }
          return res.json();
        })
      );
      
      const results = await Promise.all(sportPromises);
      const combinedPredictions: SharedPrediction[] = results.flat();
      
      setAllPredictions(combinedPredictions);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка при загрузке прогнозов.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllPredictions();
  }, [fetchAllPredictions]);

  const value = {
    allPredictions,
    isLoading,
    error,
    fetchAllPredictions,
  };

  return <PredictionContext.Provider value={value}>{children}</PredictionContext.Provider>;
};

export const usePredictionContext = (): PredictionContextType => {
  const context = useContext(PredictionContext);
  if (context === undefined) {
    throw new Error('usePredictionContext must be used within a PredictionProvider');
  }
  return context;
};
