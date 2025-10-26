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
    // Не сбрасываем ошибку сразу, чтобы показать ее во время перезагрузки
    // setError(null); 
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'getAllPredictions',
          payload: {} // Для этого эндпоинта payload не нужен
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Не удалось загрузить прогнозы с сервера.');
      }

      let predictions: SharedPrediction[] = await response.json();

      // --- РЕЗЕРВНАЯ ЛОГИКА ---
      const today = new Date();
      const todayDay = String(today.getUTCDate()).padStart(2, '0');
      const todayMonth = String(today.getUTCMonth() + 1).padStart(2, '0');
      const todayYear = today.getUTCFullYear();
      const todayStr = `${todayDay}.${todayMonth}.${todayYear}`;
      
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const tomorrowDay = String(tomorrow.getUTCDate()).padStart(2, '0');
      const tomorrowMonth = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
      const tomorrowYear = tomorrow.getUTCFullYear();
      const tomorrowStr = `${tomorrowDay}.${tomorrowMonth}.${tomorrowYear}`;


      const hasValidMatches = predictions.length > 0 && predictions.some(p => p.date === todayStr || p.date === tomorrowStr);

      if (!hasValidMatches) {
          console.warn("Fetched predictions are empty or outdated. Falling back to client-side mocks.");
          setError("Не удалось загрузить актуальные матчи. Отображаются демонстрационные данные на сегодня.");
          predictions = generateClientSideMocks();
      } else {
          setError(null); // Очищаем ошибку, если загрузка успешна
      }

      setAllPredictions(predictions);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка при загрузке прогнозов.';
      setError(errorMessage);
      console.error("Fetch error, falling back to client-side mocks.", err);
      setAllPredictions(generateClientSideMocks());
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