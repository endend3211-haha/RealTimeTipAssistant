package com.assistant.realtimetip.data.util

import kotlin.math.max

/**
 * High-performance Hangul Syllable Decomposer and Jamo Phonetic Similarity Calculator.
 * Splits Korean syllables into Choseong (initial consonant), Jungseong (vowel),
 * and Jongseong (final consonant), and computes normalized Levenshtein distance on Jamo sequences.
 */
object HangulJamoUtil {

    private const val HANGUL_BASE = 0xAC00 // '가'
    private const val HANGUL_END = 0xD7A3  // '힣'

    // 19 Choseong (Initial consonants)
    private val CHOSEONG = charArrayOf(
        'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
        'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    )

    // 21 Jungseong (Medial vowels)
    private val JUNGSEONG = charArrayOf(
        'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
        'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
    )

    // 28 Jongseong (Final consonants, index 0 is empty)
    private val JONGSEONG = charArrayOf(
        ' ', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
        'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
        'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    )

    /**
     * Decomposes a Hangul string into its constituent Jamo characters.
     * Preserves non-Hangul characters (lowercased for case-insensitive matching).
     *
     * Example: "쿠버네티스" -> "ㅋㅜㅂㅓㄴㅔㅌㅣㅅㅡ"
     */
    fun decompose(input: String): String {
        val sb = StringBuilder()
        for (ch in input) {
            val code = ch.code
            if (code in HANGUL_BASE..HANGUL_END) {
                val syllableIndex = code - HANGUL_BASE
                val choseongIdx = syllableIndex / (21 * 28)
                val jungseongIdx = (syllableIndex % (21 * 28)) / 28
                val jongseongIdx = syllableIndex % 28

                sb.append(CHOSEONG[choseongIdx])
                sb.append(JUNGSEONG[jungseongIdx])
                if (jongseongIdx > 0) {
                    sb.append(JONGSEONG[jongseongIdx])
                }
            } else if (!ch.isWhitespace()) {
                sb.append(ch.lowercaseChar())
            }
        }
        return sb.toString()
    }

    /**
     * Calculates the Levenshtein edit distance between two strings.
     */
    fun levenshteinDistance(s1: String, s2: String): Int {
        val len1 = s1.length
        val len2 = s2.length

        if (len1 == 0) return len2
        if (len2 == 0) return len1

        var prev = IntArray(len2 + 1) { it }
        var curr = IntArray(len2 + 1)

        for (i in 1..len1) {
            curr[0] = i
            val c1 = s1[i - 1]
            for (j in 1..len2) {
                val c2 = s2[j - 1]
                val cost = if (c1 == c2) 0 else 1
                curr[j] = minOf(
                    curr[j - 1] + 1,       // Insertion
                    prev[j] + 1,           // Deletion
                    prev[j - 1] + cost     // Substitution
                )
            }
            val temp = prev
            prev = curr
            curr = temp
        }

        return prev[len2]
    }

    /**
     * Computes the normalized phonetic similarity [0.0..1.0] between two strings
     * after decomposing both into Jamo sequences.
     *
     * Returns 1.0 for an exact phonetic match, 0.0 for completely disjoint strings.
     */
    fun computeJamoSimilarity(s1: String, s2: String): Float {
        val jamo1 = decompose(s1)
        val jamo2 = decompose(s2)

        if (jamo1 == jamo2) return 1.0f
        val maxLen = max(jamo1.length, jamo2.length)
        if (maxLen == 0) return 1.0f

        val distance = levenshteinDistance(jamo1, jamo2)
        val similarity = 1.0f - (distance.toFloat() / maxLen.toFloat())
        return similarity.coerceIn(0.0f, 1.0f)
    }
}
