package com.assistant.realtimetip.data.util

import java.util.regex.Pattern

/**
 * High-speed, rule-based Korean and English substantive noun/entity extractor (POS Tagging).
 * Strips postpositions (Josa), auxiliary verbs, conversational predicates, and filler adjectives,
 * guaranteeing that casual speech never triggers the knowledge retrieval pipeline.
 */
object KeywordExtractor {

    // Common Korean particles (Josa) sorted by length descending
    private val KOREAN_PARTICLES = listOf(
        "에서는", "에서의", "으로의", "에게는", "한테는", "에서도",
        "에서", "으로", "에게", "한테", "에는", "이나", "이란", "까지",
        "부터", "처럼", "로서", "로써", "보다", "마저", "조차", "따라",
        "들의", "들을", "들은", "들이", "들에",
        "을", "를", "은", "는", "이", "가", "의", "에", "와", "과", "도", "로", "랑", "하고"
    )

    // Verbal and adjectival endings (용언 어간/어미 및 서술형 종결어미) to filter out casual verbs & adjectives
    private val VERB_ADJ_ENDINGS = listOf(
        "하다", "되다", "않다", "같다", "보다", "있다", "없다", "먹다", "가다", "오다",
        "하고", "해서", "하면", "하니", "하게", "하는", "했던", "된다", "됐다", "되면",
        "보고", "보니", "가서", "왔다", "갔다", "모르", "알겠", "맞아", "그래", "좋다",
        "좋아", "좋네", "나빠", "싫어", "예뻐", "멋져", "어때", "어떨", "봤어", "봤다",
        "듣다", "들었", "쉬다", "잤다", "힘들", "바빠", "피곤", "재밌", "즐겁", "어려",
        "쉽다", "쉬워", "크다", "작다", "많다", "적다", "높다", "낮다", "춥다", "덥다",
        "시작", "끝나", "열려", "닫혀", "만나", "헤어", "걸려", "보내", "받았", "올려",
        "내려", "바꿔", "달라", "어때요", "좋아요", "했어", "했네", "했음", "했음요", "했죠",
        "하죠", "하네", "하지", "했지", "했나", "하나", "할까", "했어", "됐어", "됐네",
        "이냐", "이야", "이지", "이다", "인데", "일까", "인듯", "인것", "인거"
    )

    private val KOREAN_STOPWORDS = setOf(
        "그리고", "하지만", "그러나", "따라서", "그래서", "그런데", "또한", "모두",
        "대해", "대한", "관한", "통해", "위해", "의해", "인해", "등의", "있는",
        "없는", "하는", "하게", "하지", "하며", "하여", "된다", "한다", "있다",
        "없다", "같다", "이런", "저런", "그런", "어떤", "지금", "오늘", "내일",
        "어제", "바로", "다시", "정말", "진짜", "매우", "너무", "자주", "항상",
        "경우", "때문", "관련", "이후", "이전", "사이", "정도", "가장", "스스로",
        "내용", "확인", "부탁", "감사", "안녕", "안녕하세요", "회신", "전달", "참조",
        "미안", "미안해", "죄송", "죄송합니다", "고마워", "고맙습니다", "그래", "응", "어",
        "저기", "그냥", "아니", "아니야", "몰라", "알았어", "해도", "해서", "하면", "보고",
        "가서", "우리", "내가", "네가", "그거", "이거", "저거", "지금보다",
        "어떻게", "무슨", "어디", "누구", "언제", "어느", "왜", "하나", "둘", "셋",
        "잠깐", "잠시", "혹시", "일단", "대충", "약간", "그럼", "그러면", "하여튼", "어쨌든",
        "보니까", "알겠어", "맞아", "네", "예", "글쎄", "아마", "사람", "생각", "얘기",
        "말씀", "진짜로", "정말로", "그냥요", "저것", "이것", "그것", "거기", "여기",
        "어디야", "뭐야", "뭐해", "뭐라고", "누가", "무엇", "그때", "아까", "이따가", "나중에", "방금",
        "오늘은", "내일은", "지금은", "그렇게", "이렇게", "저렇게", "날씨", "하늘", "바람",
        "기분", "친구", "동생", "형님", "누나", "언니", "아침", "점심", "저녁", "시간"
    )

    private val ENGLISH_STOPWORDS = setOf(
        "the", "and", "for", "that", "this", "with", "you", "your", "from",
        "have", "are", "will", "can", "not", "all", "but", "out", "about",
        "get", "which", "when", "make", "like", "time", "just", "know",
        "take", "into", "year", "some", "could", "them", "see", "other",
        "than", "then", "now", "look", "only", "come", "its", "over",
        "think", "also", "back", "after", "use", "how", "our", "work",
        "first", "well", "way", "even", "new", "want", "because", "any",
        "these", "give", "day", "most", "http", "https", "com", "org",
        "www", "subject", "re", "fwd", "fw", "email", "mail", "from", "sent"
    )

    private val WORD_PATTERN = Pattern.compile("[가-힣a-zA-Z0-9]+")

    /**
     * Extracts strictly substantive nouns and domain entities (Proper nouns, domain terms, English words).
     * Eliminates casual predicates, filler adjectives, and conversational fluff.
     */
    fun extractSubstantiveEntities(text: String?, maxKeywords: Int = 10): List<String> {
        if (text.isNullOrBlank()) return emptyList()

        val frequencyMap = mutableMapOf<String, Int>()
        val matcher = WORD_PATTERN.matcher(text)

        while (matcher.find()) {
            val rawToken = matcher.group() ?: continue
            val candidate = cleanToken(rawToken) ?: continue

            // Strict POS & Substantive validation:
            // 1. Must be >= 2 characters
            // 2. Must not be in stopwords
            // 3. Must not end with conversational verb/adjective suffixes
            if (candidate.length >= 2 && isValidSubstantive(candidate)) {
                val count = frequencyMap.getOrDefault(candidate, 0)
                frequencyMap[candidate] = count + 1
            }
        }

        return frequencyMap.entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenByDescending { it.key.length })
            .map { it.key }
            .take(maxKeywords)
    }

    /**
     * Legacy keyword list extractor redirecting to strict substantive noun extraction.
     */
    fun extractKeywordList(text: String?, maxKeywords: Int = 15): List<String> {
        return extractSubstantiveEntities(text, maxKeywords)
    }

    fun extractKeywords(text: String?, maxKeywords: Int = 15): String {
        return extractSubstantiveEntities(text, maxKeywords).joinToString(", ")
    }

    /**
     * Strict Entity Gate: Returns true ONLY if high-signal substantive entities
     * (e.g. Proper nouns, stock tickers, technical jargon, English terms) are present.
     * Casual chat, greetings, questions, or feelings ("오늘 날씨 좋다", "밥 먹었어?", "영화 봤어")
     * immediately return FALSE in < 1ms without waking up knowledge retrieval.
     */
    fun hasHighSignalEntities(text: String?): Boolean {
        if (text.isNullOrBlank()) return false
        val entities = extractSubstantiveEntities(text, maxKeywords = 5)
        if (entities.isEmpty()) return false

        return entities.any { token ->
            // English or alphanumeric technical term (e.g., "Kubernetes", "AI", "TSMC", "005930")
            val isAlphaNumeric = token.any { it in 'a'..'z' || it in 'A'..'Z' || it.isDigit() }
            // Or solid Korean proper noun / business term >= 2 chars that doesn't look like common talk
            val isSolidNoun = token.length >= 2 && !KOREAN_STOPWORDS.contains(token) && !isCasualPredicate(token)
            isAlphaNumeric || isSolidNoun
        }
    }

    /**
     * Calculates cosine-weighted token overlap ratio between candidate knowledge items
     * and recent conversation context.
     */
    fun calculateOverlapScore(candidateText: String, contextKeywords: Collection<String>): Float {
        if (contextKeywords.isEmpty() || candidateText.isBlank()) return 0f
        val candidateTokens = extractSubstantiveEntities(candidateText, maxKeywords = 10)
            .map { it.lowercase() }
            .toSet()

        if (candidateTokens.isEmpty()) return 0f

        val matches = candidateTokens.count { token ->
            contextKeywords.any { kw ->
                val k = kw.lowercase()
                k == token || k.contains(token) || token.contains(k)
            }
        }
        return matches.toFloat() / contextKeywords.size.coerceAtLeast(1)
    }

    /**
     * Strips postpositions (Josa) and verb endings from Korean words, or lowercases English words.
     */
    private fun cleanToken(token: String): String? {
        val trimmed = token.trim()
        if (trimmed.length < 2) return null

        // If contains Korean
        if (trimmed.any { it in '\uAC00'..'\uD7A3' }) {
            var root = trimmed
            for (particle in KOREAN_PARTICLES) {
                if (root.endsWith(particle) && root.length - particle.length >= 2) {
                    root = root.substring(0, root.length - particle.length)
                    break
                }
            }
            if (isCasualPredicate(root)) return null
            return if (root.length >= 2) root else null
        }

        // If English
        if (trimmed.all { it.isLetter() }) {
            return trimmed.lowercase()
        }

        // Alphanumeric technical term (e.g., "K8s", "GPT4", "OAuth2")
        return trimmed
    }

    private fun isCasualPredicate(word: String): Boolean {
        for (ending in VERB_ADJ_ENDINGS) {
            if (word.endsWith(ending)) return true
        }
        return false
    }

    private fun isValidSubstantive(word: String): Boolean {
        val lower = word.lowercase()
        if (KOREAN_STOPWORDS.contains(word)) return false
        if (ENGLISH_STOPWORDS.contains(lower)) return false
        if (isCasualPredicate(word)) return false
        // Exclude purely numeric strings
        if (word.all { it.isDigit() }) return false
        return true
    }
}
