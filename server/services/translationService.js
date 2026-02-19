import { translate } from 'google-translate-api-x';

/**
 * Translates text to the target language.
 * Default target: 'en'
 * 
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (e.g., 'en', 'es', 'fr')
 * @returns {Promise<{text: string, from: string}>}
 */
export const translateText = async (text, targetLang = 'en') => {
    try {
        const res = await translate(text, { to: targetLang });
        return {
            text: res.text,
            from: res.from.language.iso
        };
    } catch (error) {
        console.error('Translation Service Error:', error);
        throw new Error('Translation failed');
    }
};
