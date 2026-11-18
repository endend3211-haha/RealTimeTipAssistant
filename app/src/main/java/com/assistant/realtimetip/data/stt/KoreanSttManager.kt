package com.assistant.realtimetip.data.stt

import android.content.Context
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.assistant.realtimetip.data.repository.KnowledgeRepository
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.sync.ContactsCollector
import com.assistant.realtimetip.data.sync.StockQuoteManager
import com.assistant.realtimetip.data.util.ProcessedSttResult
import com.assistant.realtimetip.data.util.SttPostProcessor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class SttStatus {
    object Idle : SttStatus()
    object Initializing : SttStatus()
    object Listening : SttStatus()
    object SpeechDetected : SttStatus()
    data class Error(val code: Int, val message: String) : SttStatus()
}

/**
 * Continuous, low-latency Korean Speech Recognizer manager.
 * Uses Android on-device recognition when available to eliminate cloud roundtrip drops,
 * enforces non-intrusive dictation mode without stealing media focus from other apps,
 * and maintains continuous sentence collection across conversational pauses.
 */
class KoreanSttManager(
    private val context: Context,
    private val securePreferenceManager: SecurePreferenceManager,
    private val knowledgeRepository: KnowledgeRepository,
    private val sttPostProcessor: SttPostProcessor,
    private val stockQuoteManager: StockQuoteManager? = null,
    private val contactsCollector: ContactsCollector? = null
) {

    companion object {
        private const val TAG = "KoreanSttManager"
        // Max-Duration Force Cutoff: 4.5 seconds hard limit on continuous speech to prevent infinite waiting
        private const val MAX_CONTINUOUS_SPEECH_DURATION_MS = 4500L
        // Stability Delay: 250ms delay for volatile partials to eliminate optical waveguide HUD flickering
        private const val STABILITY_DELAY_MS = 250L

        // Predefined Tier 1 & Tier 2 Action Keywords for Korean STT
        val TIER_1_ACTION_KEYWORDS = listOf("주식", "일정", "뜻", "의미", "사전", "시세", "주가", "가격")
        val TIER_2_ACTION_KEYWORDS = listOf("전화", "통화", "이메일", "뉴스", "캘린더", "메모", "검색", "날씨", "차트", "실적", "누구", "약속")
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var speechRecognizer: SpeechRecognizer? = null

    // Max-Duration Force Trigger state variables
    private var isSpeechOngoing = false
    private var maxDurationCutoffJob: Job? = null

    // HUD Stability Delay & Frame Stabilization state
    private var partialStabilityJob: Job? = null
    private var lastStablePartialText = ""
    private var consecutiveFrameCount = 0

    private val _isListening = MutableStateFlow(false)
    val isListening: StateFlow<Boolean> = _isListening.asStateFlow()

    private val _partialCaption = MutableStateFlow("")
    val partialCaption: StateFlow<String> = _partialCaption.asStateFlow()

    // Isolated interim streaming partial words (for subtle unfinalized styling in UI)
    private val _interimPartial = MutableStateFlow("")
    val interimPartial: StateFlow<String> = _interimPartial.asStateFlow()

    private val _speechRms = MutableStateFlow(0f)
    val speechRms: StateFlow<Float> = _speechRms.asStateFlow()

    private val _sttStatus = MutableStateFlow<SttStatus>(SttStatus.Idle)
    val sttStatus: StateFlow<SttStatus> = _sttStatus.asStateFlow()

    // Continuous Background Audio Ring Buffer (16kHz 16-bit mono PCM)
    val continuousRingBuffer = ContinuousAudioRingBuffer(context, scope)

    // Silero Voice Activity Detector (512 samples / 32ms window @ 16kHz)
    val sileroVadEngine = SileroVadEngine(threshold = 0.45f)

    // Local Sherpa-ONNX High-Speed Streaming Speech Recognizer with Hotword Biasing
    val localSherpaSttEngine = LocalSherpaSttEngine(context)

    // Rolling Utterance Accumulator for full-sentence Korean speech recognition
    val rollingSentenceBuffer = RollingSentenceBuffer(scope)
    val sttResultFlow: SharedFlow<ProcessedSttResult> = rollingSentenceBuffer.finalizedSentenceFlow

    private var cachedBiasingKeywords: List<String> = emptyList()

    /**
     * Initializes continuous speech recognition.
     */
    fun startContinuousListening() {
        if (_isListening.value) return
        _isListening.value = true
        _sttStatus.value = SttStatus.Initializing

        // Start continuous circular audio capture with pre-roll buffering & Silero VAD state machine
        continuousRingBuffer.start { chunk ->
            val vadState = sileroVadEngine.evaluateChunk(chunk)
            when (vadState) {
                VadState.SPEECH_START -> {
                    // Front-end Protection: Prepend 400ms pre-roll circular buffer to eliminate initial syllable clipping
                    val preRoll = continuousRingBuffer.getLatestPreRollSamples(400)
                    localSherpaSttEngine.feedSpeechChunk(preRoll)
                    localSherpaSttEngine.feedSpeechChunk(chunk)
                    _sttStatus.value = SttStatus.SpeechDetected
                }
                VadState.SPEECH_ONGOING, VadState.HANGOVER -> {
                    // Back-end Protection: Keep delivering speech chunks through 700ms hangover window
                    localSherpaSttEngine.feedSpeechChunk(chunk)
                }
                VadState.SPEECH_END -> {
                    // Back-end Protection: Hangover silence exceeded -> Force flush remaining tail buffer
                    localSherpaSttEngine.flush { remainingTail ->
                        if (remainingTail.isNotBlank()) {
                            rollingSentenceBuffer.forceFlushPendingPartial(remainingTail)
                        }
                    }
                }
                VadState.SILENCE -> {
                    // Silent background
                }
            }
        }
        sileroVadEngine.reset()

        scope.launch(Dispatchers.IO) {
            // Aggressive Context Biasing: Assemble KOSPI/KOSDAQ tickers, contacts, Tier 1/2 keywords, and DB entities
            cachedBiasingKeywords = assembleAggressiveCustomVocabulary()
            localSherpaSttEngine.initialize(cachedBiasingKeywords)
            Log.i(TAG, "Aggressive Context Biasing: Loaded ${cachedBiasingKeywords.size} Korean proper nouns into decoder graph.")
            startListeningSession()
        }
    }

    /**
     * Smoothly rebinds the SpeechRecognizer session when audio routing changes (e.g. Bluetooth connect/disconnect).
     */
    fun rebindListeningSession() {
        if (!_isListening.value) return
        mainHandler.post {
            try {
                speechRecognizer?.stopListening()
                speechRecognizer?.cancel()
            } catch (_: Exception) {}
            scheduleRestart(80L)
        }
    }

    /**
     * Pauses or stops the continuous speech recognition loop.
     */
    fun stopContinuousListening() {
        _isListening.value = false
        _sttStatus.value = SttStatus.Idle
        _partialCaption.value = ""
        _speechRms.value = 0f
        cancelMaxDurationCutoffTimer()
        partialStabilityJob?.cancel()
        partialStabilityJob = null
        synchronized(this@KoreanSttManager) {
            consecutiveFrameCount = 0
            lastStablePartialText = ""
        }
        continuousRingBuffer.stop()
        rollingSentenceBuffer.reset()

        mainHandler.removeCallbacksAndMessages(null)
        try {
            speechRecognizer?.stopListening()
            speechRecognizer?.cancel()
        } catch (_: Exception) {}
    }

    /**
     * Completely destroys and cleans up the SpeechRecognizer instance.
     */
    fun destroy() {
        stopContinuousListening()
        cancelMaxDurationCutoffTimer()
        try {
            speechRecognizer?.destroy()
        } catch (_: Exception) {}
        speechRecognizer = null
        sileroVadEngine.reset()
        localSherpaSttEngine.release()
    }

    /**
     * Max-Duration Force Cutoff: Starts a 4.5-second timer when speech begins.
     * Prevents waiting infinitely for silence if the user speaks continuously.
     */
    private fun startMaxDurationCutoffTimer() {
        maxDurationCutoffJob?.cancel()
        isSpeechOngoing = true
        maxDurationCutoffJob = scope.launch {
            delay(MAX_CONTINUOUS_SPEECH_DURATION_MS)
            if (isSpeechOngoing && _isListening.value) {
                Log.i(TAG, "Max-duration limit (${MAX_CONTINUOUS_SPEECH_DURATION_MS}ms) reached during continuous speech! Force chunking audio and triggering intent router immediately.")
                triggerForceSpeechChunk()
            }
        }
    }

    private fun cancelMaxDurationCutoffTimer() {
        isSpeechOngoing = false
        maxDurationCutoffJob?.cancel()
        maxDurationCutoffJob = null
    }

    /**
     * Forcefully chunks audio on continuous speech cutoff, sends chunk to intent router & tip generator,
     * and seamlessly continues listening for remaining speech.
     */
    private fun triggerForceSpeechChunk() {
        mainHandler.post {
            if (!_isListening.value) return@post

            val pending = _interimPartial.value.trim()
            Log.i(TAG, "Executing forced speech chunk cutoff. Pending text: '$pending'")

            // 1. Force flush current speech chunk to RollingSentenceBuffer & IntentRouter immediately
            if (pending.isNotBlank()) {
                rollingSentenceBuffer.forceFlushPendingPartial(pending)
                _interimPartial.value = ""
            }

            // 2. Stop current listening session cleanly so recognizer finalizes audio buffer
            try {
                speechRecognizer?.stopListening()
            } catch (_: Exception) {}

            // 3. Reset speech state and restart listening session for next continuous speech chunk
            cancelMaxDurationCutoffTimer()
            scheduleRestart(50L)
        }
    }

    private fun startListeningSession() {
        if (!_isListening.value) return

        mainHandler.post {
            try {
                if (speechRecognizer == null) {
                    speechRecognizer = try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
                        ) {
                            SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                        } else {
                            SpeechRecognizer.createSpeechRecognizer(context)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "createOnDeviceSpeechRecognizer failed, falling back to standard SpeechRecognizer", e)
                        SpeechRecognizer.createSpeechRecognizer(context)
                    }
                    speechRecognizer?.setRecognitionListener(createListener())
                }

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ko-KR")
                    putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, "ko-KR")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    // Beam Search Decoding: increased beam size to 5 with modified_beam_search
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    putExtra("android.speech.extra.DECODING_MODE", "beam_search")
                    putExtra("android.speech.extra.BEAM_SIZE", 4)
                    putExtra("android.speech.extra.AUDIO_CHUNK_DURATION_MS", 300)

                    // Continuous dictation mode without interrupting media playback
                    putExtra("android.speech.extra.DICTATION_MODE", true)

                    // Conversational silence thresholds to avoid clipping sentence endings
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1000L)

                    // API 33+ Domain Biasing Strings to prioritize project terms and proper nouns
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        securePreferenceManager.isBiasingEnabled &&
                        cachedBiasingKeywords.isNotEmpty()
                    ) {
                        putStringArrayListExtra(
                            RecognizerIntent.EXTRA_BIASING_STRINGS,
                            ArrayList(cachedBiasingKeywords)
                        )
                    }
                }

                _sttStatus.value = SttStatus.Listening
                Log.d(TAG, "Starting SpeechRecognizer listening session...")
                speechRecognizer?.startListening(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start listening session", e)
                _sttStatus.value = SttStatus.Error(-1, e.message ?: "인식 세션 시작 실패")
                scheduleRestart(300L)
            }
        }
    }

    private fun scheduleRestart(delayMs: Long = 40L) {
        if (!_isListening.value) return
        mainHandler.removeCallbacksAndMessages(null)
        val safeDelay = delayMs.coerceAtLeast(30L)
        mainHandler.postDelayed({
            if (_isListening.value) {
                startListeningSession()
            }
        }, safeDelay)
    }

    /**
     * Aggressive Context Biasing: Assembles complete KOSPI/KOSDAQ tickers, user contacts,
     * Tier 1/2 action keywords, and Room DB domain entities for decoder graph biasing.
     */
    private suspend fun assembleAggressiveCustomVocabulary(): List<String> {
        val vocab = mutableSetOf<String>()

        // 1. Predefined Tier 1 & Tier 2 action keywords
        vocab.addAll(TIER_1_ACTION_KEYWORDS)
        vocab.addAll(TIER_2_ACTION_KEYWORDS)

        // 2. Complete KOSPI/KOSDAQ and major global ticker names
        vocab.addAll(StockQuoteManager.getAllKnownStockNames())

        // 3. User's Contact list names
        try {
            contactsCollector?.getAllContactNames(100)?.let {
                vocab.addAll(it)
            }
        } catch (_: Exception) {}

        // 4. Room DB Domain keywords
        try {
            val dbKeywords = knowledgeRepository.getRecentBiasingKeywords(100)
            vocab.addAll(dbKeywords)
        } catch (_: Exception) {}

        return vocab.filter { it.length >= 2 }.distinct()
    }

    /**
     * Refreshes biasing keywords and injects them directly into the Sherpa decoder graph.
     */
    fun refreshBiasingKeywords() {
        scope.launch(Dispatchers.IO) {
            try {
                cachedBiasingKeywords = assembleAggressiveCustomVocabulary()
                localSherpaSttEngine.updateHotwords(cachedBiasingKeywords)
                Log.i(TAG, "Refreshed ${cachedBiasingKeywords.size} custom vocabulary words into Sherpa decoder graph.")
            } catch (_: Exception) {}
        }
    }

    private fun createListener(): RecognitionListener {
        return object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                Log.d(TAG, "onReadyForSpeech")
                _sttStatus.value = SttStatus.Listening
            }

            override fun onBeginningOfSpeech() {
                Log.d(TAG, "onBeginningOfSpeech")
                _sttStatus.value = SttStatus.SpeechDetected
                startMaxDurationCutoffTimer()
            }

            override fun onRmsChanged(rmsdB: Float) {
                _speechRms.value = if (rmsdB > 0f) rmsdB else 0f
            }

            override fun onBufferReceived(buffer: ByteArray?) {
                if (buffer != null && buffer.isNotEmpty()) {
                    continuousRingBuffer.feedPcmData(buffer)
                }
            }

            override fun onEndOfSpeech() {
                Log.d(TAG, "onEndOfSpeech - triggering VAD force flush and rescuing trailing buffer")
                _speechRms.value = 0f
                cancelMaxDurationCutoffTimer()

                // Back-end Protection: Explicit Force Flush on onEndOfSpeech
                localSherpaSttEngine.flush { flushedTail ->
                    if (flushedTail.isNotBlank()) {
                        Log.i(TAG, "Flushed trailing text on onEndOfSpeech: $flushedTail")
                        rollingSentenceBuffer.forceFlushPendingPartial(flushedTail)
                    }
                }

                val pending = _interimPartial.value.trim()
                if (pending.isNotBlank()) {
                    Log.i(TAG, "Rescuing active interim partial on onEndOfSpeech: '$pending'")
                    rollingSentenceBuffer.forceFlushPendingPartial(pending)
                    _interimPartial.value = ""
                }
            }

            override fun onError(error: Int) {
                cancelMaxDurationCutoffTimer()
                partialStabilityJob?.cancel()
                val errorMsg = mapErrorCode(error)
                Log.w(TAG, "onError: code=$error ($errorMsg)")

                // Explicit Force Flush before handling session reset
                localSherpaSttEngine.flush { flushedTail ->
                    if (flushedTail.isNotBlank()) {
                        Log.i(TAG, "Rescuing flushed text on onError: $flushedTail")
                        rollingSentenceBuffer.forceFlushPendingPartial(flushedTail)
                    }
                }

                val pending = _interimPartial.value.trim()
                if (pending.isNotBlank()) {
                    Log.d(TAG, "Rescuing pending partial on onError: $pending")
                    rollingSentenceBuffer.forceFlushPendingPartial(pending)
                    _interimPartial.value = ""
                }

                when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                        _isListening.value = false
                        _sttStatus.value = SttStatus.Error(error, errorMsg)
                    }
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                        // Transient silence / pause: keep live caption visible and restart smoothly
                        scheduleRestart(40L)
                    }
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
                    SpeechRecognizer.ERROR_CLIENT -> {
                        try {
                            speechRecognizer?.cancel()
                            speechRecognizer?.destroy()
                        } catch (_: Exception) {}
                        speechRecognizer = null
                        scheduleRestart(150L)
                    }
                    SpeechRecognizer.ERROR_NETWORK,
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                    SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> {
                        scheduleRestart(80L)
                    }
                    else -> {
                        _sttStatus.value = SttStatus.Error(error, errorMsg)
                        scheduleRestart(100L)
                    }
                }
            }

            override fun onResults(results: Bundle?) {
                cancelMaxDurationCutoffTimer()
                partialStabilityJob?.cancel()
                synchronized(this@KoreanSttManager) {
                    consecutiveFrameCount = 0
                    lastStablePartialText = ""
                }
                val candidates = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
                val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

                val pending = _interimPartial.value.trim()
                _interimPartial.value = ""

                // Explicit Force Flush on Sherpa engine to extract any residual tail buffer
                var flushedTail = ""
                localSherpaSttEngine.flush { tail ->
                    if (tail.isNotBlank()) {
                        flushedTail = tail
                    }
                }

                Log.i(TAG, "onResults (Beam Search): candidates=${candidates.joinToString()} (confidences=${confidences?.joinToString()}), flushedTail='$flushedTail', pending='$pending'")

                if (candidates.isNotEmpty()) {
                    scope.launch(Dispatchers.Default) {
                        val processed = sttPostProcessor.process(
                            candidates = candidates,
                            confidenceScores = confidences,
                            domainKeywords = cachedBiasingKeywords
                        )
                        Log.i(TAG, "STT Result Processed: '${processed.correctedText}' (conf=${processed.confidence})")
                        // Ingest fragment into RollingSentenceBuffer with smart paragraph merge & deduplication
                        rollingSentenceBuffer.ingestFragment(processed)

                        if (flushedTail.isNotBlank()) {
                            val tailProcessed = sttPostProcessor.process(
                                candidates = listOf(flushedTail),
                                confidenceScores = null,
                                domainKeywords = cachedBiasingKeywords
                            )
                            rollingSentenceBuffer.ingestFragment(tailProcessed)
                        }

                        val fullCaption = rollingSentenceBuffer.getFullLiveCaption("")
                        if (fullCaption.isNotBlank()) {
                            _partialCaption.value = fullCaption
                        }
                    }
                } else {
                    val fallback = when {
                        pending.isNotBlank() && flushedTail.isNotBlank() -> "$pending $flushedTail"
                        pending.isNotBlank() -> pending
                        flushedTail.isNotBlank() -> flushedTail
                        else -> ""
                    }
                    if (fallback.isNotBlank()) {
                        Log.d(TAG, "Rescuing pending/flushed tail from empty candidates: $fallback")
                        rollingSentenceBuffer.forceFlushPendingPartial(fallback)
                    }
                }

                // Immediate smooth restart to eliminate gap between utterances
                scheduleRestart(40L)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                if (!isSpeechOngoing) {
                    startMaxDurationCutoffTimer()
                }
                val partials = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val rawPartial = partials?.firstOrNull() ?: ""
                if (rawPartial.isNotBlank()) {
                    scope.launch(Dispatchers.Default) {
                        // Instant partial correction through hotword-biased phonetic post-processor
                        val correctedPartial = sttPostProcessor.processPartial(rawPartial, cachedBiasingKeywords)
                        _interimPartial.value = correctedPartial

                        // Frame-level stability evaluation:
                        val isPrefixStable = synchronized(this@KoreanSttManager) {
                            if (correctedPartial == lastStablePartialText ||
                                (lastStablePartialText.isNotBlank() && correctedPartial.startsWith(lastStablePartialText))
                            ) {
                                consecutiveFrameCount++
                            } else {
                                consecutiveFrameCount = 1
                                lastStablePartialText = correctedPartial
                            }
                            consecutiveFrameCount >= 2
                        }

                        // Stability Delay for HUD: If phrase stabilized across >= 2 frames, update immediately;
                        // otherwise apply 250ms debounce delay so volatile intermediate syllables don't flicker on glasses.
                        partialStabilityJob?.cancel()
                        if (isPrefixStable) {
                            _partialCaption.value = rollingSentenceBuffer.getFullLiveCaption(correctedPartial)
                        } else {
                            partialStabilityJob = scope.launch {
                                delay(STABILITY_DELAY_MS)
                                _partialCaption.value = rollingSentenceBuffer.getFullLiveCaption(correctedPartial)
                            }
                        }
                    }
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        }
    }

    private fun mapErrorCode(error: Int): String {
        return when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "오디오 녹음 에러"
            SpeechRecognizer.ERROR_CLIENT -> "클라이언트 에러"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "마이크 권한 부족"
            SpeechRecognizer.ERROR_NETWORK -> "네트워크 에러"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "네트워크 타임아웃"
            SpeechRecognizer.ERROR_NO_MATCH -> "인식 결과 없음 (말소리 대기 중)"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "음성 인식기 사용 중"
            SpeechRecognizer.ERROR_SERVER -> "서버 에러"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "말소리 없음 (침묵 타임아웃)"
            else -> "기타 음성 인식 오류 ($error)"
        }
    }
}
