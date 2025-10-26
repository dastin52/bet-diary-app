import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SharedPrediction } from '../types';

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
    setError(null); // Clear previous errors on a new fetch attempt
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'getAllPredictions',
          payload: {}
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка ответа сервера.');
      }

      const predictions: SharedPrediction[] = await response.json();

      // The frontend now trusts the backend completely.
      // If the backend returns an empty array, it means there are no matches, which is a valid state.
      // The UI component (UpcomingMatches) will be responsible for displaying "No matches found."
      setAllPredictions(predictions);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная сетевая ошибка.';
      // Set an error message to be displayed in the UI.
      setError(`Не удалось загрузить данные о матчах. Пожалуйста, попробуйте обновить страницу позже. Ошибка: ${errorMessage}`);
      console.error("Failed to fetch predictions from the server:", err);
      // Set predictions to an empty array to ensure the UI shows an empty state, not stale data.
      setAllPredictions([]);
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
