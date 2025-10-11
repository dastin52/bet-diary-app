import { Message, ChatMessage } from '../types';

export const loadChatHistory = <T extends Message | ChatMessage>(key: string): T[] => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error(`Failed to load chat history for key ${key}`, error);
        return [];
    }
};

export const saveChatHistory = <T extends Message | ChatMessage>(key: string, messages: T[]): void => {
    try {
        localStorage.setItem(key, JSON.stringify(messages));
    } catch (error) {
        console.error(`Failed to save chat history for key ${key}`, error);
    }
};