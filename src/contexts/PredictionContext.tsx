import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SharedPrediction } from '../types';

interface PredictionContextType {
  predictions: SharedPrediction[];
  isLoading: boolean;
  error: string | null;
  activeSport: string;
  setSport: (sport: string) => void;
}

const PredictionContext = createContext<PredictionContextType | undefined>(undefined);

export const PredictionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [predictions, setPredictions] = useState<SharedPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSport, setActiveSport] = useState('football');

  const fetchPredictions = useCallback(async (sport: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/matches-with-predictions?sport=${sport}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось загрузить матчи.');
      }
      const data: SharedPrediction[] = await response.json();
      setPredictions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions(activeSport);
  }, [activeSport, fetchPredictions]);

  const setSport = (sport: string) => {
    setActiveSport(sport);
  };

  const value = {
    predictions,
    isLoading,
    error,
    activeSport,
    setSport,
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
