
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
          try { telegram.expand(); } catch(e) {}
      }

      // Send debug log once per session
      if (!sentLog.current) {
          sentLog.current = true;
          // Use the global function defined in index.html for robustness
          // @ts-ignore
          if (window.logToBackend) {
              const debugData = {
                  version: telegram.version,
                  platform: telegram.platform,
                  // Explicitly log the type and value of initData to see if it's truly empty
                  initDataLength: telegram.initData ? telegram.initData.length : 0,
                  initData: telegram.initData || 'EMPTY_STRING', 
                  userId: telegram.initDataUnsafe?.user?.id,
                  colorScheme: telegram.colorScheme
              };
              // @ts-ignore
              window.logToBackend('info', 'TWA Initialized', debugData);
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

  // FIX: Robust check for TWA environment.
  // If initData is an empty string (common in desktop browsers testing direct URLs), 
  // we consider it NOT a valid TWA session for auth purposes, falling back to guest mode.
  const isTwaSession = !!(telegram?.initData && telegram.initData.length > 0);

  return {
    onClose,
    onMainButtonClick,
    onBackButtonClick,
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    queryId: telegram?.initDataUnsafe?.query_id,
    initData: telegram?.initData,
    isTwa: isTwaSession, 
    colorScheme: telegram?.colorScheme,
    themeParams: telegram?.themeParams,
    MainButton: telegram?.MainButton,
    BackButton: telegram?.BackButton,
    isReady
  };
}
