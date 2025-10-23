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

    const finalTranslations: Record<string, string> = {};
    const namesToTranslate: string[] = [];
    const translationCacheKeys: Record<string, string> = {};

    // 1. Check cache for existing translations
    await Promise.all(teamNames.map(async (name) => {
        // Create a consistent, safe key
        const key = `translation:en-ru:${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        translationCacheKeys[name] = key;
        const cachedTranslation = await env.BOT_STATE.get(key);
        if (cachedTranslation) {
            finalTranslations[name] = cachedTranslation;
        } else {
            namesToTranslate.push(name);
        }
    }));

    // 2. If all names were cached, we are done
    if (namesToTranslate.length === 0) {
        console.log(`[Cache HIT] All ${teamNames.length} team names found in cache.`);
        return finalTranslations;
    }

    console.log(`[Cache MISS] Need to translate ${namesToTranslate.length} new names.`);

    // 3. Translate the remaining uncached names
    try {
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

        const prompt = `Translate the following team names into Russian. Return ONLY a valid JSON object mapping the original name to the translated name. Example: {"New York Rangers": "Нью-Йорк Рейнджерс"}.
Team names: ${namesToTranslate.join(', ')}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        if (!response || typeof response.text !== 'string' || response.text.trim() === '') {
            console.warn("AI translation response is invalid or empty. Returning only cached translations.");
            return finalTranslations;
        }

        const text = response.text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch || !jsonMatch[0]) {
            console.warn("No JSON object found in AI translation response. Text was:", text);
            return finalTranslations;
        }
        
        let newTranslations: Record<string, string> = {};
        try {
            newTranslations = JSON.parse(jsonMatch[0]);
            if (typeof newTranslations !== 'object' || newTranslations === null || Array.isArray(newTranslations)) {
                console.warn("Parsed translation is not a valid object. Parsed value:", newTranslations);
                return finalTranslations;
            }
        } catch (parseError) {
            console.error("Failed to parse JSON from AI translation response. Matched JSON string was:", jsonMatch[0], "Error:", parseError);
            return finalTranslations;
        }

        // 4. Update the final translations object and write new translations to cache
        const cachePromises: Promise<void>[] = [];
        for (const originalName in newTranslations) {
            // Ensure we only process names we asked for
            if (Object.prototype.hasOwnProperty.call(newTranslations, originalName) && namesToTranslate.includes(originalName)) {
                const translatedName = newTranslations[originalName];
                finalTranslations[originalName] = translatedName;
                
                const key = translationCacheKeys[originalName];
                if (key) {
                    // Cache the new translation with no expiration
                    cachePromises.push(env.BOT_STATE.put(key, translatedName));
                }
            }
        }
        
        // Await cache writes to ensure they complete in the serverless environment
        await Promise.all(cachePromises);
        console.log(`[Cache WRITE] Stored ${cachePromises.length} new translations.`);

    } catch (apiError) {
        console.error("Gemini API call for translation failed:", apiError);
        // Fallback on any API error: return only the cached translations
    }

    // Return all translations (cached + newly fetched)
    return finalTranslations;
}
