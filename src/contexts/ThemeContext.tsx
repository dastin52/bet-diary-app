import React, { createContext, useContext, useEffect, ReactNode, useCallback } from 'react';
import { useSettingsContext } from './SettingsContext';
import { useTelegram } from '../hooks/useTelegram';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  setTheme: (theme: Theme) => void;
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, updateSettings, isLoading } = useSettingsContext();
  const { colorScheme, isTwa } = useTelegram();
  const theme = settings.theme;

  const setTheme = useCallback((newTheme: Theme) => {
    updateSettings({ theme: newTheme });
  }, [updateSettings]);

  // Sync with Telegram Theme if in TWA
  useEffect(() => {
      if (isTwa && colorScheme) {
          // If Telegram says dark, use dark. If light, use light.
          // We map 'system' to the Telegram preference initially.
          const tgTheme = colorScheme === 'dark' ? 'dark' : 'light';
          if (settings.theme !== tgTheme && settings.theme === 'system') {
              // Only override if user hasn't explicitly set a preference in app, 
              // or if we want to enforce native feel.
              // For now, let's respect system setting as "Telegram setting"
          }
      }
  }, [isTwa, colorScheme, settings.theme]);

  useEffect(() => {
    if (isLoading) return;

    const root = window.document.documentElement;
    let isDark = false;

    if (isTwa && colorScheme) {
        // In TWA, prioritize Telegram's scheme if 'system' is selected
        if (theme === 'system') {
            isDark = colorScheme === 'dark';
        } else {
            isDark = theme === 'dark';
        }
    } else {
        // Standard Browser behavior
        isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    root.classList.toggle('dark', isDark);
  }, [theme, isLoading, isTwa, colorScheme]);

  useEffect(() => {
    if (isLoading || theme !== 'system' || isTwa) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.toggle('dark', mediaQuery.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, isLoading, isTwa]);

  const value = { theme, setTheme };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};