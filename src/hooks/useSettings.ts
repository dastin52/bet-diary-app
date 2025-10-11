import { useState, useEffect, useCallback } from 'react';
import { UserSettings } from '../types';
import { loadSettings, saveSettings, defaultSettings } from '../data/settingsStore';

export interface UseSettingsReturn {
  settings: UserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  isLoading: boolean;
}

export const useSettings = (userKey: string): UseSettingsReturn => {
  const isDemoMode = userKey === 'demo_user';
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setSettings(loadSettings(userKey));
    setIsLoading(false);
  }, [userKey]);

  useEffect(() => {
    if (isDemoMode || isLoading) return;
    saveSettings(userKey, settings);
  }, [settings, userKey, isDemoMode, isLoading]);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    if (isDemoMode) return;
    setSettings(prevSettings => {
        const updated = {
            ...prevSettings,
            ...newSettings,
        };
        if (newSettings.notifications) {
            updated.notifications = {
                ...prevSettings.notifications,
                ...newSettings.notifications
            }
        }
        return updated;
    });
  }, [isDemoMode]);

  return { settings, updateSettings, isLoading };
};
