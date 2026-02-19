import express from 'express';
import { translateText } from '../services/translationService.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @desc    Translate text
 * @route   POST /api/translate
 * @access  Protected
 */
router.post('/', protect, async (req, res) => {
    const { text, targetLang } = req.body;

    if (!text) {
        return res.status(400).json({ message: 'Text is required' });
    }

    try {
        const result = await translateText(text, targetLang || 'en');
        res.json({
            originalText: text,
            translatedText: result.text,
            detectedLang: result.from
        });
    } catch (error) {
        res.status(500).json({ message: 'Translation failed', error: error.message });
    }
});

export default router;
