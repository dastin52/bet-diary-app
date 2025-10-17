// functions/data/chatStore.ts
// WARNING: This implementation uses localStorage and is intended for client-side or Node.js environments.
// It will NOT work as-is in a serverless environment like Cloudflare Workers that lacks localStorage.
// For production, this should be replaced with a KV store or database implementation.

import { Message, ChatMessage } from '../telegram/types';

export const loadChatHistory = <T extends Message | ChatMessage>(key: string): T[] => {
    // Mock implementation for serverless
    console.warn("loadChatHistory() is using a mock implementation and will not work in a production serverless environment.");
    return [];
};

export const saveChatHistory = <T extends Message | ChatMessage>(key: string, messages: T[]): void => {
    // Mock implementation for serverless
    console.warn("saveChatHistory() is using a mock implementation and will not work in a production serverless environment.");
};
