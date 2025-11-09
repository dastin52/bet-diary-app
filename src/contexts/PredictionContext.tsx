import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { SharedPrediction } from '../types';
import { generateClientSideMocks } from '../utils/mockMatches';

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
      if (force) {
        console.log('[PredictionContext] Forcing a manual update...');
        const updateResponse = await fetch('/api/tasks/run-update', { method: 'POST' });
        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          throw new Error(errorData.error || 'Не удалось запустить фоновое обновление.');
        }
      }

      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'getAllPredictions',
          payload: {}
        }),
      });
      
      if (!response.ok) {
        throw new Error('Ошибка ответа сервера при получении прогнозов.');
      }

      const predictions: SharedPrediction[] = await response.json();

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const startOfTodayTimestamp = Math.floor(today.getTime() / 1000);

      const isDataStale = predictions.length === 0 || predictions.every(p => p.timestamp < startOfTodayTimestamp);
      
      if (isDataStale) {
          if (force) {
              setError("Обновление не вернуло актуальных данных. Возможно, сейчас нет предстоящих матчей или произошла ошибка на сервере. Попробуйте позже или проверьте панель диагностики.");
              setAllPredictions([]);
          } else {
              console.warn("Server data is stale or empty. Falling back to client-side mocks for demonstration.");
              setError("Не удалось загрузить актуальные матчи. Отображаются демонстрационные данные на сегодня.");
              setAllPredictions(generateClientSideMocks());
          }
      } else {
          setAllPredictions(predictions);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка.';
      console.error("Failed to fetch predictions:", err);
      if (force) {
        setError(`Ошибка принудительного обновления: ${errorMessage}`);
      } else {
        setError(`Не удалось загрузить актуальные матчи. Отображаются демонстрационные данные на сегодня. Ошибка: ${errorMessage}`);
      }
      
      if (!force) {
        setAllPredictions(generateClientSideMocks());
      } else {
        setAllPredictions([]);
      }
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