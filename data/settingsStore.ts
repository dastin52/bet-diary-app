import { UserSettings } from '../types';

export const defaultSettings: UserSettings = {
  notifications: {
    betReminders: true,
    competitionUpdates: true,
    aiAnalysisAlerts: false,
  },
  theme: 'system',
};

const getSettingsKey = (userKey: string) => `betDiarySettings_${userKey}`;

export const loadSettings = (userKey: string): UserSettings => {
  if (userKey === 'demo_user') {
    return { ...defaultSettings };
  }
  try {
    const stored = localStorage.getItem(getSettingsKey(userKey));
    const parsed = stored ? JSON.parse(stored) : {};
    // Merge with defaults to ensure all keys exist
    return {
      ...defaultSettings,
      ...parsed,
      notifications: {
        ...defaultSettings.notifications,
        ...(parsed.notifications || {}),
      },
    };
  } catch (error) {
    console.error(`Error loading settings from localStorage for user: ${userKey}`, error);
    return { ...defaultSettings };
  }
};

export const saveSettings = (userKey: string, settings: UserSettings): void => {
  if (userKey === 'demo_user') return;
  try {
    localStorage.setItem(getSettingsKey(userKey), JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving settings to localStorage', error);
  }
};