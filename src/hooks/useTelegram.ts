import { useEffect, useState, useCallback, useRef } from 'react';

declare global {
  interface Window {
    Telegram: any;
    twaDebugLogs: any[];
    twaUpdateDebugUI: () => void;
    // @google/genai-fix: Augment Window interface to include logToBackend, fixing TS errors in index.tsx.
    logToBackend?: (level: string, message: string, details?: any) => void;
  }
}

export function useTelegram() {
  const [isReady, setIsReady] = useState(false);
  const telegram = window.Telegram?.WebApp;

  useEffect(() => {
    console.log("useTelegram Hook: Initializing...");
    
    if (telegram) {
      try {
        console.log("useTelegram Hook: Telegram script found. Version:", telegram.version);
        telegram.ready();
        
        // Log basic info
        console.log("useTelegram Hook: Ready signal sent.");
        console.log("Platform:", telegram.platform);
        console.log("Theme Params:", JSON.stringify(telegram.themeParams));
        
        if (telegram.initData) {
            console.log("useTelegram Hook: initData length:", telegram.initData.length);
        } else {
            console.warn("useTelegram Hook: initData is MISSING (Empty string). Are you running in a browser?");
        }

        setIsReady(true);
        telegram.expand();
      } catch (e: any) {
          console.error("useTelegram Hook Error during initialization:", e);
      }
    } else {
        console.error("useTelegram Hook: window.Telegram.WebApp is UNDEFINED.");
    }
  }, [telegram]);

  const onMainButtonClick = useCallback((cb: () => void) => {
      if (telegram?.MainButton) {
          telegram.MainButton.onClick(cb);
      }
      return () => telegram?.MainButton?.offClick(cb);
  }, [telegram]);

  const onBackButtonClick = useCallback((cb: () => void) => {
      if (telegram?.BackButton) {
          telegram.BackButton.onClick(cb);
      }
      return () => telegram?.BackButton?.offClick(cb);
  }, [telegram]);

  // We consider it a TWA session if initData exists and is not a local test string
  const isTwaSession = !!(telegram?.initData && telegram.initData.length > 20);

  return {
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    initData: telegram?.initData || '',
    isTwa: isTwaSession, 
    colorScheme: telegram?.colorScheme,
    MainButton: telegram?.MainButton,
    BackButton: telegram?.BackButton,
    // @google/genai-fix: Added missing event handler registration functions to return object.
    onMainButtonClick,
    onBackButtonClick,
    isReady
  };
}