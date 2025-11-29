
import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    Telegram: any;
  }
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  
  // Access directly in the hook to avoid stale closure issues if loaded lazily
  const telegram = window.Telegram?.WebApp;

  useEffect(() => {
    if (telegram) {
      // ready() is likely called in index.tsx, but calling it again is safe (idempotent)
      telegram.ready();
      setIsReady(true);
      
      if (!telegram.isExpanded) {
          telegram.expand();
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

  return {
    onClose,
    onMainButtonClick,
    onBackButtonClick,
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    queryId: telegram?.initDataUnsafe?.query_id,
    initData: telegram?.initData,
    isTwa: !!telegram?.initData, // True if running inside Telegram
    colorScheme: telegram?.colorScheme,
    themeParams: telegram?.themeParams,
    MainButton: telegram?.MainButton,
    BackButton: telegram?.BackButton,
    isReady
  };
}
