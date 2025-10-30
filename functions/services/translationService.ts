// functions/services/translationService.ts
import { Env } from '../telegram/types';
import { GoogleGenAI } from "@google/genai";

/**
 * Translates a list of team names to Russian using the Gemini API, with a caching layer.
 * This function is designed to be extremely robust and fall back gracefully.
 * @param teamNames - An array of unique team names.
 * @param env - The environment object with API keys and KV store.
 * @returns A promise that resolves to a record mapping original names to translated names.
 */
export async function translateTeamNames(teamNames: string[], env: Env): Promise<Record<string, string>> {
    if (!teamNames || teamNames.length === 0) {
        return {};
    }

    // AI Translation is temporarily disabled per user request to debug data pipeline.
    // This will cause the system to use the original team names from the sports API.
    console.log('[Translation Service] AI translation is currently disabled. Returning original team names.');
    return {};
}
