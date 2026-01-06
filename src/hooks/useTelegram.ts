import { useEffect, useState, useCallback, useRef } from 'react';

declare global {
  interface Window {
    Telegram: any;
    logToBackend?: (level: string, message: string, details?: any) => void;
  }
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  const sentLog = useRef(false);
  
  const telegram = window.Telegram?.WebApp;

  useEffect(() => {
    if (telegram) {
      try {
        telegram.ready();
        setIsReady(true);
        
        if (!telegram.isExpanded) {
            telegram.expand();
        }

        if (!sentLog.current) {
            sentLog.current = true;
            if (window.logToBackend) {
                window.logToBackend('info', 'TWA Hook Initialized', {
                    platform: telegram.platform,
                    initDataExist: !!telegram.initData,
                    version: telegram.version,
                    colorScheme: telegram.colorScheme
                });
            }
        }
      } catch (e: any) {
          console.error("TWA Hook Error:", e);
          if (window.logToBackend) {
              window.logToBackend('error', 'TWA Hook Init Failed', e.message);
          }
      }
    }
  }, [telegram]);

  const onClose = useCallback(() => {
    telegram?.close();
  }, [telegram]);

  const onMainButtonClick = useCallback((cb: () => void) => {
      if (telegram?.MainButton) {
          telegram.MainButton.onClick(cb);
      }
      return () => {
          telegram?.MainButton?.offClick(cb);
      }
  }, [telegram]);

  const onBackButtonClick = useCallback((cb: () => void) => {
      if (telegram?.BackButton) {
          telegram.BackButton.onClick(cb);
      }
      return () => {
          telegram?.BackButton?.offClick(cb);
      }
  }, [telegram]);

  // Проверка на среду Telegram
  const isTwaSession = !!(telegram?.initData && telegram.initData.length > 0);

  return {
    onClose,
    onMainButtonClick,
    onBackButtonClick,
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    queryId: telegram?.initDataUnsafe?.query_id,
    initData: telegram?.initData || '',
    isTwa: isTwaSession, 
    colorScheme: telegram?.colorScheme,
    themeParams: telegram?.themeParams,
    MainButton: telegram?.MainButton,
    BackButton: telegram?.BackButton,
    isReady
  };
}