import { useEffect, useState } from 'react';

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

  return {
    onClose,
    tg: telegram,
    user: telegram?.initDataUnsafe?.user,
    queryId: telegram?.initDataUnsafe?.query_id,
    initData: telegram?.initData,
    isTwa: !!telegram?.initData, // True if running inside Telegram
    colorScheme: telegram?.colorScheme,
    themeParams: telegram?.themeParams,
  };
}