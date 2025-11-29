
import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    Telegram: any;
  }
}

const telegram = window.Telegram?.WebApp;

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (telegram) {
      telegram.ready();
      setIsReady(true);
      
      // Expand to full height
      if (!telegram.isExpanded) {
          telegram.expand();
      }
    }
  }, []);

  const onClose = () => {
    telegram?.close();
  };

  const onMainButtonClick = useCallback((cb: () => void) => {
      if (telegram?.MainButton) {
          telegram.MainButton.onClick(cb);
      }
      return () => {
          telegram?.MainButton?.offClick(cb);
      }
  }, []);

  const onBackButtonClick = useCallback((cb: () => void) => {
      if (telegram?.BackButton) {
          telegram.BackButton.onClick(cb);
      }
      return () => {
          telegram?.BackButton?.offClick(cb);
      }
  }, []);

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
  };
}
