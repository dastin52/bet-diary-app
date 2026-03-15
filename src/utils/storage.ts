// src/utils/storage.ts

export const safeStorage = {
    getItem: (key: string): string | null => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('Storage access denied, falling back to session memory', e);
            return sessionStorage.getItem(key);
        }
    },
    setItem: (key: string, value: string): void => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn('Storage access denied, falling back to session memory', e);
            sessionStorage.setItem(key, value);
        }
    },
    removeItem: (key: string): void => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.warn('Storage access denied, falling back to session memory', e);
            sessionStorage.removeItem(key);
        }
    }
};
