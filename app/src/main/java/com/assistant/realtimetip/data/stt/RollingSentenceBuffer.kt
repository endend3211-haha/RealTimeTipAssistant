package com.assistant.realtimetip.data.stt

import com.assistant.realtimetip.data.util.ProcessedSttResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Smart Rolling Utterance Accumulator with Overlap Deduplication.
 * - Merges consecutive STT callbacks into one coherent paragraph if spoken within < 1.8s.
 * - Strips duplicate overlapping words caused by SpeechRecognizer session restarts.
 * - Emits finalized complete paragraphs to RAG / Local LLM pipeline upon natural pauses.
 */
class RollingSentenceBuffer(
    private val scope: CoroutineScope
) {
    companion object {
        const val CLAUSE_MERGE_WINDOW_MS = 1800L  // Merge consecutive fragments if pause < 1.8s
        const val PUNCTUATION_PAUSE_MS = 800L     // Finalize faster if sentence ends with ., ?, !
        const val MIN_CHARS_FOR_SENTENCE = 2
        const val MIN_WORDS_FOR_SENTENCE = 1
    }

    private val mutex = Mutex()
    private val bufferedResults = mutableListOf<ProcessedSttResult>()
    private var accumulatedText = ""
    private var lastFragmentTime = 0L
    private var finalizeJob: Job? = null

    // Live accumulated sentence/paragraph text currently being formed
    private val _liveAccumulatedText = MutableStateFlow("")
    val liveAccumulatedText: StateFlow<String> = _liveAccumulatedText.asStateFlow()

    // Real-time flowing caption combining accumulated finalized text + interim partials
    private val _activeStreamingText = MutableStateFlow("")
    val activeStreamingText: StateFlow<String> = _activeStreamingText.asStateFlow()

    // Finalized complete sentences/paragraphs emitted to RAG & DB
    private val _finalizedSentenceFlow = MutableSharedFlow<ProcessedSttResult>(extraBufferCapacity = 64)
    val finalizedSentenceFlow: SharedFlow<ProcessedSttResult> = _finalizedSentenceFlow.asSharedFlow()

    /**
     * Ingests a finalized fragment from SpeechRecognizer onResults.
     */
    fun ingestFragment(result: ProcessedSttResult) {
        val incoming = result.correctedText.trim()
        if (incoming.isBlank()) return

        scope.launch {
            mutex.withLock {
                val now = System.currentTimeMillis()

                // If previous clauses exist but exceeded merge window (>1.8s), flush previous first
                if (bufferedResults.isNotEmpty() && (now - lastFragmentTime > CLAUSE_MERGE_WINDOW_MS)) {
                    flushLocked()
                }

                // Deduplicate overlapping words from session restarts
                accumulatedText = if (accumulatedText.isBlank()) {
                    incoming
                } else {
                    stripOverlap(accumulatedText, incoming)
                }

                bufferedResults.add(result)
                lastFragmentTime = now
                _liveAccumulatedText.value = accumulatedText
                _activeStreamingText.value = accumulatedText

                // Cancel pending pause timer
                finalizeJob?.cancel()

                val endsWithPunctuation = incoming.endsWith(".") || incoming.endsWith("?") || incoming.endsWith("!")
                val delayMs = if (endsWithPunctuation) PUNCTUATION_PAUSE_MS else CLAUSE_MERGE_WINDOW_MS

                finalizeJob = scope.launch {
                    delay(delayMs)
                    mutex.withLock {
                        flushLocked()
                    }
                }
            }
        }
    }

    /**
     * Updates active streaming text when interim partial results arrive.
     */
    fun updatePartial(partialText: String): String {
        val base = _liveAccumulatedText.value.trim()
        val partial = partialText.trim()
        val combined = when {
            base.isNotBlank() && partial.isNotBlank() -> {
                // If partial overlaps with tail of base, deduplicate
                stripOverlap(base, partial)
            }
            base.isNotBlank() -> base
            else -> partial
        }
        _activeStreamingText.value = combined
        return combined
    }

    fun getFullLiveCaption(partialText: String): String {
        return updatePartial(partialText)
    }

    /**
     * Strips overlapping word sequences between the tail of existing text and head of incoming text.
     * E.g.: "회의 일정" + "일정 확인해줘" -> "회의 일정 확인해줘"
     */
    private fun stripOverlap(existing: String, incoming: String): String {
        val existingWords = existing.trim().split(Regex("""\s+""")).filter { it.isNotBlank() }
        val incomingWords = incoming.trim().split(Regex("""\s+""")).filter { it.isNotBlank() }

        if (existingWords.isEmpty()) return incoming.trim()
        if (incomingWords.isEmpty()) return existing.trim()

        val maxOverlap = minOf(existingWords.size, incomingWords.size, 6)
        for (k in maxOverlap downTo 1) {
            val existingTail = existingWords.takeLast(k)
            val incomingHead = incomingWords.take(k)

            val match = existingTail.indices.all { i ->
                normalizeWord(existingTail[i]) == normalizeWord(incomingHead[i])
            }
            if (match) {
                // Overlap found: skip first k words of incoming
                val remainingWords = incomingWords.drop(k)
                return if (remainingWords.isNotEmpty()) {
                    "${existing.trim()} ${remainingWords.joinToString(" ")}"
                } else {
                    existing.trim()
                }
            }
        }

        return "${existing.trim()} ${incoming.trim()}"
    }

    private fun normalizeWord(w: String): String =
        w.trim().replace(Regex("""[^a-zA-Z0-9가-힣]"""), "").lowercase()

    /**
     * Rescues orphaned partial text when speech ends or session resets before onResults arrives.
     * Guarantees that trailing words captured as partial hypothesis are NEVER lost.
     */
    fun forceFlushPendingPartial(orphanedPartial: String) {
        val trimmed = orphanedPartial.trim()
        if (trimmed.isBlank()) return

        scope.launch {
            mutex.withLock {
                accumulatedText = if (accumulatedText.isBlank()) {
                    trimmed
                } else {
                    stripOverlap(accumulatedText, trimmed)
                }
                _liveAccumulatedText.value = accumulatedText
                _activeStreamingText.value = accumulatedText
                flushLocked()
            }
        }
    }

    /**
     * Flushes and emits the accumulated paragraph as one complete ProcessedSttResult.
     */
    private suspend fun flushLocked() {
        if (accumulatedText.isBlank()) return

        val textToEmit = accumulatedText.trim()
        val allCorrections = bufferedResults.flatMap { it.corrections }
        val avgConfidence = if (bufferedResults.isNotEmpty()) {
            bufferedResults.map { it.confidence }.average().toFloat()
        } else 0.95f

        bufferedResults.clear()
        accumulatedText = ""
        _liveAccumulatedText.value = ""
        _activeStreamingText.value = ""

        val wordCount = textToEmit.split(Regex("""\s+""")).filter { it.isNotBlank() }.size
        val charCount = textToEmit.replace(" ", "").length

        if (charCount >= MIN_CHARS_FOR_SENTENCE || wordCount >= MIN_WORDS_FOR_SENTENCE) {
            _finalizedSentenceFlow.emit(
                ProcessedSttResult(
                    rawText = textToEmit,
                    correctedText = textToEmit,
                    corrections = allCorrections,
                    confidence = avgConfidence
                )
            )
        }
    }

    fun reset() {
        scope.launch {
            mutex.withLock {
                finalizeJob?.cancel()
                finalizeJob = null
                bufferedResults.clear()
                accumulatedText = ""
                _liveAccumulatedText.value = ""
                _activeStreamingText.value = ""
            }
        }
    }
}
