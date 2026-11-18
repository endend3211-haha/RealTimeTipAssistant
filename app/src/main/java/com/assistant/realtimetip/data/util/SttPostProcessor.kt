package com.assistant.realtimetip.data.util

import com.assistant.realtimetip.data.security.SecurePreferenceManager
import org.json.JSONObject

data class WordCorrection(
    val originalWord: String,
    val correctedWord: String,
    val reason: String,
    val similarity: Float
)

data class ProcessedSttResult(
    val rawText: String,
    val correctedText: String,
    val corrections: List<WordCorrection> = emptyList(),
    val confidence: Float = 1.0f
)

/**
 * Post-processes speech recognition candidates using exact user dictionary replacement
 * and Hangul Jamo phonetic similarity matching against indexed domain keywords.
 */
class SttPostProcessor(
    private val securePreferenceManager: SecurePreferenceManager
) {

    /**
     * Parses user dictionary pairs from secure preferences.
     * Stored as a simple JSON object: {"misrecognizedWord": "correctedWord"}
     */
    fun getCustomDictionary(): Map<String, String> {
        val raw = securePreferenceManager.customDictionaryRaw
        if (raw.isBlank()) return emptyMap()

        return try {
            val json = JSONObject(raw)
            val map = mutableMapOf<String, String>()
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val value = json.optString(key, "")
                if (key.isNotBlank() && value.isNotBlank()) {
                    map[key.trim()] = value.trim()
                }
            }
            map
        } catch (e: Exception) {
            emptyMap()
        }
    }

    /**
     * Saves user dictionary pairs to secure preferences.
     */
    fun saveCustomDictionary(dict: Map<String, String>) {
        val json = JSONObject()
        for ((k, v) in dict) {
            if (k.isNotBlank() && v.isNotBlank()) {
                json.put(k.trim(), v.trim())
            }
        }
        securePreferenceManager.customDictionaryRaw = json.toString()
    }

    fun addCustomDictionaryEntry(wrongWord: String, correctWord: String) {
        val current = getCustomDictionary().toMutableMap()
        current[wrongWord.trim()] = correctWord.trim()
        saveCustomDictionary(current)
    }

    fun removeCustomDictionaryEntry(wrongWord: String) {
        val current = getCustomDictionary().toMutableMap()
        current.remove(wrongWord.trim())
        saveCustomDictionary(current)
    }

    /**
     * Fast-path partial speech correction for live word-by-word streaming caption display.
     */
    fun processPartial(partialText: String, domainKeywords: List<String> = emptyList()): String {
        if (partialText.isBlank()) return ""
        return process(listOf(partialText), null, domainKeywords).correctedText
    }

    /**
     * Evaluates N-Best recognition candidates and applies two-stage error correction.
     *
     * @param candidates Recognition candidates from SpeechRecognizer (RESULTS_RECOGNITION)
     * @param confidenceScores Recognition confidence scores (CONFIDENCE_SCORES)
     * @param domainKeywords Domain keywords from KnowledgeDao
     */
    fun process(
        candidates: List<String>,
        confidenceScores: FloatArray? = null,
        domainKeywords: List<String> = emptyList()
    ): ProcessedSttResult {
        if (candidates.isEmpty()) {
            return ProcessedSttResult(rawText = "", correctedText = "")
        }

        val rawText = candidates.first().trim()
        val confidence = confidenceScores?.firstOrNull()?.coerceIn(0.0f, 1.0f) ?: 1.0f
        val customDict = getCustomDictionary()
        val jamoThreshold = securePreferenceManager.jamoSimilarityThreshold

        // Build target vocabulary: custom dictionary target words + indexed domain keywords
        val targetVocabulary = mutableSetOf<String>()
        targetVocabulary.addAll(customDict.values)
        targetVocabulary.addAll(domainKeywords)

        val words = rawText.split(Regex("\\s+"))
        val corrections = mutableListOf<WordCorrection>()
        val correctedWords = mutableListOf<String>()

        for (word in words) {
            val punctuationRegex = Regex("[.,?!~]+$")
            val trailingPunctuation = punctuationRegex.find(word)?.value ?: ""
            val cleanWord = word.replace(punctuationRegex, "").trim()

            if (cleanWord.isBlank()) {
                correctedWords.add(word)
                continue
            }

            // Stage 1: Exact user dictionary replacement rule
            var matchedReplacement: String? = null
            for ((wrong, target) in customDict) {
                if (cleanWord.equals(wrong, ignoreCase = true)) {
                    matchedReplacement = target
                    corrections.add(
                        WordCorrection(
                            originalWord = cleanWord,
                            correctedWord = target,
                            reason = "EXACT_RULE",
                            similarity = 1.0f
                        )
                    )
                    break
                }
            }

            // Stage 2: Heavy Hotword Biased Jamo Phonetic & Substring Correction
            if (matchedReplacement == null && cleanWord.length >= 2) {
                var bestSimilarity = 0.0f
                var bestCandidate: String? = null

                // Dynamic Hotword Effective Threshold: lowered from 0.75f to 0.62f for domain jargon
                val hotwordBiasedThreshold = (jamoThreshold * 0.82f).coerceAtLeast(0.60f)

                for (target in targetVocabulary) {
                    if (target.isBlank() || target.equals(cleanWord, ignoreCase = true)) continue

                    // 2.1 Substring containment bonus for compound jargon (e.g., "에코프로" -> "에코프로비엠")
                    if (cleanWord.length >= 3 && target.contains(cleanWord, ignoreCase = true)) {
                        bestSimilarity = 0.95f
                        bestCandidate = target
                        break
                    }

                    // 2.2 Phonetic similarity with heavy hotword weight boost (+20% score)
                    val rawSim = HangulJamoUtil.computeJamoSimilarity(cleanWord, target)
                    val weightedSim = (rawSim * 1.20f).coerceAtMost(1.0f)

                    if (weightedSim >= hotwordBiasedThreshold && weightedSim > bestSimilarity) {
                        bestSimilarity = weightedSim
                        bestCandidate = target
                    }
                }

                if (bestCandidate != null) {
                    matchedReplacement = bestCandidate
                    corrections.add(
                        WordCorrection(
                            originalWord = cleanWord,
                            correctedWord = bestCandidate,
                            reason = "HOTWORD_BIASED_JAMO (${(bestSimilarity * 100).toInt()}%)",
                            similarity = bestSimilarity
                        )
                    )
                }
            }

            val finalWord = (matchedReplacement ?: cleanWord) + trailingPunctuation
            correctedWords.add(finalWord)
        }

        val correctedText = correctedWords.joinToString(" ")

        return ProcessedSttResult(
            rawText = rawText,
            correctedText = correctedText,
            corrections = corrections,
            confidence = confidence
        )
    }
}
