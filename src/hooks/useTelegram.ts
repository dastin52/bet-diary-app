
import { useEffect, useState, useCallback, useRef } from 'react';

declare global {
  interface Window {
    Telegram: any;
  }
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  const sentLog = useRef(false);
  
  const telegram = window.Telegram?.WebApp;

  useEffect(() => {
    if (telegram) {
      telegram.ready();
      setIsReady(true);
      
      if (!telegram.isExpanded) {
          telegram.expand();
      }

      // Send debug log once per session
      if (!sentLog.current) {
          sentLog.current = true;
          // Use the global function defined in index.html for robustness
          // @ts-ignore
          if (window.logToBackend) {
              // @ts-ignore
              window.logToBackend('info', 'TWA Initialized', {
                  version: telegram.version,
                  platform: telegram.platform,
                  initData: telegram.initData,
                  userId: telegram.initDataUnsafe?.user?.id
              });
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

  return {
    onClose,
    onMainButtonClick,
    onBackButtonClick,
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    queryId: telegram?.initDataUnsafe?.query_id,
    initData: telegram?.initData,
    isTwa: !!telegram?.initData,
    colorScheme: telegram?.colorScheme,
    themeParams: telegram?.themeParams,
    MainButton: telegram?.MainButton,
    BackButton: telegram?.BackButton,
    isReady
  };
}
