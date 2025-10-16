// functions/telegram/ui.ts

/**
 * Helper function to create an inline keyboard for Telegram.
 * @param options A 2D array of button options.
 * @returns A reply_markup object for the Telegram API.
 */
export const makeKeyboard = (options: { text: string, callback_data: string }[][]) => {
    return { inline_keyboard: options };
};
