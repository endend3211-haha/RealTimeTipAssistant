package com.assistant.realtimetip.data.pipeline

import android.content.Context
import android.util.Log
import com.assistant.realtimetip.data.audio.ActiveMicInfo
import com.assistant.realtimetip.data.audio.BluetoothMicRouter
import com.assistant.realtimetip.data.hud.MemoMindHudDispatcher
import com.assistant.realtimetip.data.llm.LlmModelState
import com.assistant.realtimetip.data.llm.LocalLlmEngine
import com.assistant.realtimetip.data.local.entity.ConversationLog
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.local.entity.TipHistory
import com.assistant.realtimetip.data.repository.ConversationRepository
import com.assistant.realtimetip.data.repository.KnowledgeRepository
import com.assistant.realtimetip.data.repository.TipHistoryRepository
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.stt.KoreanSttManager
import com.assistant.realtimetip.data.stt.SttStatus
import com.assistant.realtimetip.data.sync.CalendarCollector
import com.assistant.realtimetip.data.sync.CallSummaryCollector
import com.assistant.realtimetip.data.sync.ContactsCollector
import com.assistant.realtimetip.data.sync.EmailSyncManager
import com.assistant.realtimetip.data.sync.FreeDictionaryLookupService
import com.assistant.realtimetip.data.sync.NewsSyncManager
import com.assistant.realtimetip.data.sync.StockQuoteManager
import com.assistant.realtimetip.data.sync.SyncWorker
import com.assistant.realtimetip.data.sync.WebSearchManager
import com.assistant.realtimetip.data.util.KeywordExtractor
import com.assistant.realtimetip.data.util.ProcessedSttResult
import com.assistant.realtimetip.data.util.SemanticReranker
import com.assistant.realtimetip.service.ListeningForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.util.ArrayDeque

/**
 * Represents a single rolled-up line inside the MemoMind One HUD teleprompter feed.
 */
data class HudFeedLine(
    val id: String = java.util.UUID.randomUUID().toString(),
    val text: String,
    val isActive: Boolean, // true = current active tip (#00FF66), false = pushed-up previous tip (#007A33, alpha 0.45)
    val tipId: Long = 0L
)

/**
 * Central orchestrator connecting the Real-Time RAG Pipeline:
 * Continuous STT Speech -> Phonetic Error Correction -> Conversation Log persistence
 * -> Keyword Extraction -> FTS Knowledge Matching -> Local LLM Tip Generation -> Tip History UI.
 */
// Scored evidence item for Parallel Fetch & Confidence-Based Selection
private data class ScoredEvidence(
    val item: KnowledgeItem,
    val confidenceScore: Float,
    val source: String
)

class AssistantPipelineController(
    private val context: Context,
    private val koreanSttManager: KoreanSttManager,
    private val conversationRepository: ConversationRepository,
    private val knowledgeRepository: KnowledgeRepository,
    private val localLlmEngine: LocalLlmEngine,
    private val tipHistoryRepository: TipHistoryRepository,
    private val emailSyncManager: EmailSyncManager,
    private val newsSyncManager: NewsSyncManager,
    private val freeDictionaryLookupService: FreeDictionaryLookupService,
    private val webSearchManager: WebSearchManager,
    private val stockQuoteManager: StockQuoteManager,
    private val calendarCollector: CalendarCollector,
    private val contactsCollector: ContactsCollector,
    private val callSummaryCollector: CallSummaryCollector,
    private val memoMindHudDispatcher: MemoMindHudDispatcher,
    private val securePreferenceManager: SecurePreferenceManager,
    private val bluetoothMicRouter: BluetoothMicRouter
) {
    companion object {
        private const val TAG = "AssistantPipelineController"
    }

    private val pipelineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // STT & Listening states
    val isListening: StateFlow<Boolean> = koreanSttManager.isListening
    val sttStatus: StateFlow<SttStatus> = koreanSttManager.sttStatus
    val partialCaption: StateFlow<String> = koreanSttManager.partialCaption
    val speechRms: StateFlow<Float> = koreanSttManager.speechRms

    // Bluetooth / Glasses Mic Routing State
    private val _isPreferBluetoothMicEnabled = MutableStateFlow(securePreferenceManager.isPreferBluetoothMicEnabled)
    val isPreferBluetoothMicEnabled: StateFlow<Boolean> = _isPreferBluetoothMicEnabled.asStateFlow()
    val activeMicInfo: StateFlow<ActiveMicInfo> = bluetoothMicRouter.activeMicInfo

    fun setPreferBluetoothMicEnabled(enabled: Boolean) {
        _isPreferBluetoothMicEnabled.value = enabled
        bluetoothMicRouter.setPreferBluetoothMic(enabled)
    }

    // Seven Independent Knowledge Source Switches
    private val _isStockEnabled = MutableStateFlow(securePreferenceManager.isStockEnabled)
    val isStockEnabled: StateFlow<Boolean> = _isStockEnabled.asStateFlow()

    private val _isWebSearchEnabled = MutableStateFlow(securePreferenceManager.isWebSearchEnabled)
    val isWebSearchEnabled: StateFlow<Boolean> = _isWebSearchEnabled.asStateFlow()

    private val _isEmailEnabled = MutableStateFlow(securePreferenceManager.isEmailEnabled)
    val isEmailEnabled: StateFlow<Boolean> = _isEmailEnabled.asStateFlow()

    private val _isNewsEnabled = MutableStateFlow(securePreferenceManager.isNewsEnabled)
    val isNewsEnabled: StateFlow<Boolean> = _isNewsEnabled.asStateFlow()

    private val _isCalendarEnabled = MutableStateFlow(securePreferenceManager.isCalendarEnabled)
    val isCalendarEnabled: StateFlow<Boolean> = _isCalendarEnabled.asStateFlow()

    private val _isContactsEnabled = MutableStateFlow(securePreferenceManager.isContactsEnabled)
    val isContactsEnabled: StateFlow<Boolean> = _isContactsEnabled.asStateFlow()

    private val _isCallEnabled = MutableStateFlow(securePreferenceManager.isCallEnabled)
    val isCallEnabled: StateFlow<Boolean> = _isCallEnabled.asStateFlow()

    private val _isDictionaryEnabled = MutableStateFlow(securePreferenceManager.isDictionaryEnabled)
    val isDictionaryEnabled: StateFlow<Boolean> = _isDictionaryEnabled.asStateFlow()

    fun setStockEnabled(enabled: Boolean) {
        _isStockEnabled.value = enabled
        securePreferenceManager.isStockEnabled = enabled
    }

    fun setWebSearchEnabled(enabled: Boolean) {
        _isWebSearchEnabled.value = enabled
        securePreferenceManager.isWebSearchEnabled = enabled
    }

    fun setEmailEnabled(enabled: Boolean) {
        _isEmailEnabled.value = enabled
        securePreferenceManager.isEmailEnabled = enabled
    }

    fun setNewsEnabled(enabled: Boolean) {
        _isNewsEnabled.value = enabled
        securePreferenceManager.isNewsEnabled = enabled
    }

    fun setCalendarEnabled(enabled: Boolean) {
        _isCalendarEnabled.value = enabled
        securePreferenceManager.isCalendarEnabled = enabled
    }

    fun setContactsEnabled(enabled: Boolean) {
        _isContactsEnabled.value = enabled
        securePreferenceManager.isContactsEnabled = enabled
    }

    fun setCallEnabled(enabled: Boolean) {
        _isCallEnabled.value = enabled
        securePreferenceManager.isCallEnabled = enabled
    }

    fun setDictionaryEnabled(enabled: Boolean) {
        _isDictionaryEnabled.value = enabled
        securePreferenceManager.isDictionaryEnabled = enabled
    }

    // Live Conversation Log (persisted)
    val latestLog: StateFlow<ConversationLog?> = conversationRepository.latestLogFlow
        .stateIn(pipelineScope, SharingStarted.WhileSubscribed(5000), null)

    val recentLogs: StateFlow<List<ConversationLog>> = conversationRepository.getRecentLogsFlow(15)
        .stateIn(pipelineScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Latest Generated Actionable Tip (from Room DB)
    val latestTip: StateFlow<TipHistory?> = tipHistoryRepository.latestTipFlow
        .stateIn(pipelineScope, SharingStarted.WhileSubscribed(5000), null)

    // FIFO Tip Display Queue: Sequential display & MemoMind HUD countdown
    private val tipQueueChannel = Channel<TipHistory>(Channel.UNLIMITED)
    private val _currentDisplayedTip = MutableStateFlow<TipHistory?>(null)
    val currentDisplayedTip: StateFlow<TipHistory?> = _currentDisplayedTip.asStateFlow()

    // Strictly decoupled Conflated Channel for RAG/LLM tip generation on Dispatchers.IO
    // Buffered channel (capacity 64) ensuring no spoken sentences are dropped while LLM is generating
    private val speechProcessingChannel = Channel<ProcessedSttResult>(64)
    private val contextMutex = Mutex()
    private val recentContextWindow = ArrayDeque<String>()

    // 5-Minute Entity LRU Cache (suppresses duplicate tip generation for repeated keywords)
    private data class CachedEntityRecord(val keyword: String, val timestamp: Long)
    private val entityCacheMutex = Mutex()
    private val entityLruCache = object : LinkedHashMap<String, Long>(50, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?): Boolean {
            return size > 50
        }
    }

    // Stacked Tip History for HUD (Up to 2 tips: [previous, newest])
    private val _hudTipStack = MutableStateFlow<List<TipHistory>>(emptyList())
    val hudTipStack: StateFlow<List<TipHistory>> = _hudTipStack.asStateFlow()

    // Continuous Line-by-Line Teleprompter Feed for 640x350 HUD
    private val _hudFeedLines = MutableStateFlow<List<HudFeedLine>>(emptyList())
    val hudFeedLines: StateFlow<List<HudFeedLine>> = _hudFeedLines.asStateFlow()

    private val _queuedTipCount = MutableStateFlow(0)
    val queuedTipCount: StateFlow<Int> = _queuedTipCount.asStateFlow()

    // HUD countdown progress (1.0f down to 0.0f over 1 second per line)
    private val _hudProgress = MutableStateFlow(0f)
    val hudProgress: StateFlow<Float> = _hudProgress.asStateFlow()

    // LLM state
    val modelState: StateFlow<LlmModelState> = localLlmEngine.modelState
    val isGeneratingTip: StateFlow<Boolean> = localLlmEngine.isGenerating

    // Sync state
    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _syncStatusMessage = MutableStateFlow<String?>(null)
    val syncStatusMessage: StateFlow<String?> = _syncStatusMessage.asStateFlow()

    init {
        // Initialize current displayed tip and initial feed lines with latest existing tip if available
        pipelineScope.launch {
            tipHistoryRepository.latestTipFlow.firstOrNull()?.let { initialTip ->
                if (_currentDisplayedTip.value == null) {
                    _currentDisplayedTip.value = initialTip
                    _hudTipStack.value = listOf(initialTip)
                    val initialLines = memoMindHudDispatcher.formatFullHudLines(initialTip)
                    _hudFeedLines.value = initialLines.map {
                        HudFeedLine(text = it, isActive = true, tipId = initialTip.id)
                    }
                }
            }
        }

        // Sequential Line-by-Line Teleprompter consumer loop (1-second pacing per line)
        pipelineScope.launch {
            for (tip in tipQueueChannel) {
                _currentDisplayedTip.value = tip
                _queuedTipCount.value = (_queuedTipCount.value - 1).coerceAtLeast(0)

                val updatedStack = (_hudTipStack.value + tip).takeLast(2)
                _hudTipStack.value = updatedStack

                val latestCaption = if (partialCaption.value.isNotBlank()) partialCaption.value else (latestLog.value?.correctedText ?: "")
                memoMindHudDispatcher.dispatchTip(tip, latestCaption)

                val tipLines = memoMindHudDispatcher.formatFullHudLines(tip)

                // Push lines into feed
                for (lineIndex in tipLines.indices) {
                    val lineText = tipLines[lineIndex]

                    val currentFeed = _hudFeedLines.value.map { feedLine ->
                        if (feedLine.tipId != tip.id) feedLine.copy(isActive = false) else feedLine
                    }

                    val newLine = HudFeedLine(
                        text = lineText,
                        isActive = true,
                        tipId = tip.id
                    )

                    // Keep up to 4 lines in feed for active tip (perfectly balanced with live caption zone)
                    _hudFeedLines.value = (currentFeed + newLine).takeLast(4)

                    // Smooth sequential pacing (200ms per line so multi-line tips roll up briskly)
                    val lineStartTime = System.currentTimeMillis()
                    val lineDuration = 200L
                    while (System.currentTimeMillis() - lineStartTime < lineDuration) {
                        val elapsed = System.currentTimeMillis() - lineStartTime
                        _hudProgress.value = (1f - (elapsed.toFloat() / lineDuration)).coerceIn(0f, 1f)
                        delay(20L)
                    }
                    _hudProgress.value = 0f
                }

                // Ensure all lines of this active tip remain visible and bright (#00FF66)
                // so the user can comfortably read the entire tip across full viewport!
                _hudFeedLines.value = tipLines.map {
                    HudFeedLine(text = it, isActive = true, tipId = tip.id)
                }
            }
        }

        // 1. Immediately ingest from STT flow into conflated queue with zero backpressure
        pipelineScope.launch {
            koreanSttManager.sttResultFlow.collect { processedResult ->
                speechProcessingChannel.trySend(processedResult)
            }
        }

        // 2. Background consumer strictly isolated on Dispatchers.IO to never block STT
        pipelineScope.launch(Dispatchers.IO) {
            for (processedResult in speechProcessingChannel) {
                handleFinalSpeechResult(processedResult)
            }
        }
    }

    /**
     * Toggles the continuous listening state and updates the Foreground Service.
     */
    fun toggleListening() {
        if (isListening.value) {
            ListeningForegroundService.stop(context)
            koreanSttManager.stopContinuousListening()
        } else {
            ListeningForegroundService.start(context)
            koreanSttManager.startContinuousListening()
        }
    }

    /**
     * Triggers an immediate one-time manual sync of emails and news.
     */
    fun triggerManualSync() {
        if (_isSyncing.value) return

        pipelineScope.launch {
            _isSyncing.value = true
            _syncStatusMessage.value = "이메일 및 뉴스 동기화 중..."

            try {
                // 1. Enqueue WorkManager immediate job
                SyncWorker.enqueueImmediateSync(context)

                // 2. Also run in-process for immediate UI feedback
                val emailCount = emailSyncManager.syncEmails().getOrDefault(0)
                val newsCount = newsSyncManager.syncNews().getOrDefault(0)

                _syncStatusMessage.value = "동기화 완료: 이메일 $emailCount 건, 뉴스 $newsCount 건 추가됨"
            } catch (e: Exception) {
                _syncStatusMessage.value = "동기화 오류: ${e.localizedMessage ?: e.message}"
            } finally {
                _isSyncing.value = false
            }
        }
    }

    fun clearSyncMessage() {
        _syncStatusMessage.value = null
    }

    /**
     * Core Real-Time RAG Pipeline Execution Flow (v1.5.0):
     * 1. Substantive Entity Gate (POS Tagged) -> Casual chat discarded in < 1ms
     * 2. 5-Minute LRU Entity Cache -> Suppresses duplicate tip generation
     * 3. Concurrent Retrieval with Strict Priority Short-Circuit (Dict -> Web -> Stock -> Personal)
     * 4. Semantic Vector Reranker & Cosine Context Filtering
     * 5. Two-Tier Fast Path (< 10ms for Structured Sources, Selective GBNF LLM for Web/Complex)
     */
    private suspend fun handleFinalSpeechResult(sttResult: ProcessedSttResult) {
        val rawText = sttResult.rawText.trim()
        val sttPreprocessed = sttResult.correctedText.trim()

        if (sttPreprocessed.isBlank()) return

        // --- STEP 0: EXAONE-3.5 Fast Post-Correction Pass (500ms Timeout) ---
        // Context-aware phonetic typo & Korean particle (조사) correction before Intent Routing
        val correctedText = try {
            withTimeoutOrNull(500L) {
                localLlmEngine.correctKoreanSpeech(sttPreprocessed)
            } ?: sttPreprocessed
        } catch (_: Exception) {
            sttPreprocessed
        }

        Log.i(TAG, "STT Pipeline: raw='$rawText' -> STT='$sttPreprocessed' -> EXAONE-3.5='$correctedText'")

        // 1. Save Conversation Log
        conversationRepository.saveLog(rawText, correctedText)

        // Rolling multi-sentence conversation context (preserves last 4 utterances)
        val multiSentenceContext = contextMutex.withLock {
            recentContextWindow.addLast(correctedText)
            if (recentContextWindow.size > 4) {
                recentContextWindow.removeFirst()
            }
            recentContextWindow.joinToString(" ")
        }

        val stockEnabled = isStockEnabled.value
        val webEnabled = isWebSearchEnabled.value
        val emailEnabled = isEmailEnabled.value
        val newsEnabled = isNewsEnabled.value
        val calendarEnabled = isCalendarEnabled.value
        val contactsEnabled = isContactsEnabled.value
        val callEnabled = isCallEnabled.value
        val dictionaryEnabled = isDictionaryEnabled.value

        // If all eight switches are OFF: skip all retrieval completely
        if (!stockEnabled && !webEnabled && !emailEnabled && !newsEnabled &&
            !calendarEnabled && !contactsEnabled && !callEnabled && !dictionaryEnabled) {
            return
        }

        // --- STEP 1: Strict POS Entity Gate ---
        // Filters casual verbs, filler adjectives, and common chit-chat ("오늘 날씨 좋다", "영화 봤어")
        if (!KeywordExtractor.hasHighSignalEntities(correctedText)) {
            return
        }

        // --- STEP 2: Extract Substantive Nouns & 5-Minute LRU Cache Gate ---
        val currentEntities = KeywordExtractor.extractSubstantiveEntities(correctedText, maxKeywords = 5)
        val contextEntities = KeywordExtractor.extractSubstantiveEntities(multiSentenceContext, maxKeywords = 8)
        val entities = (currentEntities + contextEntities).distinct().take(8)

        if (entities.isEmpty()) return

        val primaryEntity = currentEntities.firstOrNull() ?: entities.first()
        val now = System.currentTimeMillis()

        // 5-Minute (300,000ms) Entity Cache Check
        val isCached = entityCacheMutex.withLock {
            val lastSeen = entityLruCache[primaryEntity.lowercase()]
            if (lastSeen != null && now - lastSeen < 300_000L) {
                true
            } else {
                entityLruCache[primaryEntity.lowercase()] = now
                false
            }
        }
        if (isCached) return

        val searchQuery = entities.joinToString(" ")

        // --- STEP 3: Context-Aware Zero-LLM Intent Classification (< 15ms) ---
        // Dynamically reorders the short-circuit evaluation queue based on conversational intent,
        // eliminating routing conflicts (e.g., Dictionary catching company names before Stock).
        val intentResult = ContextAwareIntentRouter.classifyIntent(
            utterance = correctedText,
            entities = entities,
            multiSentenceContext = multiSentenceContext
        )
        val dynamicPriorityOrder = ContextAwareIntentRouter.getDynamicPriorityOrder(intentResult.intent)
        Log.i(TAG, "Dynamic Intent: ${intentResult.intent} (conf: ${intentResult.confidence}, match: ${intentResult.matchedPattern}), Queue: $dynamicPriorityOrder")

        // --- STEP 4: Parallel Fetch & Confidence-Based Selection (Scatter-Gather) ---
        var winningEvidence: KnowledgeItem? = null
        var winningTipText: String? = null

        coroutineScope {
            // Deferred 1: Free Dictionary Lookup (Penalized base score 0.45; boosted to 0.92 ONLY if intent == DICTIONARY)
            val dictDeferred = async(Dispatchers.IO) {
                if (!dictionaryEnabled) return@async null
                val candidateWords = entities.filter { kw -> kw.length >= 2 }.take(3)
                for (term in candidateWords) {
                    try {
                        val def = freeDictionaryLookupService.lookupDefinition(term)
                        if (!def.isNullOrBlank() && !def.contains("동음이의") && !def.contains("위키미디어")) {
                            val item = KnowledgeItem(
                                title = term,
                                content = def,
                                senderOrSource = "사전",
                                sourceType = "DICTIONARY",
                                keywords = term
                            )
                            val score = if (intentResult.intent == RetrievalIntent.DICTIONARY) 0.92f else 0.45f
                            return@async ScoredEvidence(item, score, "DICTIONARY")
                        }
                    } catch (_: Exception) {}
                }
                null
            }

            // Deferred 2: Real-Time Web Search (Score: 0.82 ~ 0.88)
            val webDeferred = async(Dispatchers.IO) {
                if (!webEnabled) return@async null
                try {
                    val results = webSearchManager.search(searchQuery, limit = 2)
                    val first = results.firstOrNull() ?: return@async null
                    val rerank = SemanticReranker.computeSemanticRelevanceScore(multiSentenceContext, entities, first)
                    if (rerank >= 0.40f) {
                        val score = if (intentResult.intent == RetrievalIntent.WEB) 0.88f else 0.82f
                        ScoredEvidence(first, score, "WEB")
                    } else null
                } catch (_: Exception) {
                    null
                }
            }

            // Deferred 3: Real-Time Stock Quote (Score: 0.92 ~ 0.98)
            val stockDeferred = async(Dispatchers.IO) {
                if (!stockEnabled) return@async null
                try {
                    val quotes = stockQuoteManager.fetchQuotes(correctedText, entities)
                    val quote = quotes.firstOrNull() ?: return@async null
                    val score = if (intentResult.intent == RetrievalIntent.STOCK) 0.98f else 0.92f
                    ScoredEvidence(quote, score, "STOCK")
                } catch (_: Exception) {
                    null
                }
            }

            // Deferred 4: Personal Data (Contacts, Call Log, Calendar, Email/News) (Score: 0.90 ~ 0.96)
            val personalDeferred = async(Dispatchers.IO) {
                // 4.1 Contacts
                if (contactsEnabled) {
                    try {
                        val contacts = contactsCollector.collectMatchingContacts(correctedText, entities, limit = 1)
                        if (contacts.isNotEmpty()) {
                            val score = if (intentResult.intent == RetrievalIntent.PERSONAL) 0.96f else 0.93f
                            return@async ScoredEvidence(contacts.first(), score, "CONTACTS")
                        }
                    } catch (_: Exception) {}
                }
                // 4.2 Call Summary
                if (callEnabled) {
                    try {
                        val calls = callSummaryCollector.collectMatchingCalls(correctedText, entities, limit = 1)
                        if (calls.isNotEmpty()) {
                            val score = if (intentResult.intent == RetrievalIntent.PERSONAL) 0.95f else 0.92f
                            return@async ScoredEvidence(calls.first(), score, "CALL")
                        }
                    } catch (_: Exception) {}
                }
                // 4.3 Calendar
                if (calendarEnabled) {
                    try {
                        val events = calendarCollector.collectMatchingEvents(correctedText, entities, limit = 1)
                        if (events.isNotEmpty()) {
                            val score = if (intentResult.intent == RetrievalIntent.PERSONAL) 0.95f else 0.92f
                            return@async ScoredEvidence(events.first(), score, "CALENDAR")
                        }
                    } catch (_: Exception) {}
                }
                // 4.4 Email / News from Room DB
                val allowedSources = mutableListOf<String>()
                if (emailEnabled) allowedSources.add("EMAIL")
                if (newsEnabled) allowedSources.add("NEWS")
                if (allowedSources.isNotEmpty()) {
                    try {
                        val dbItems = knowledgeRepository.findTopMatchingByKeywordsFiltered(entities, allowedSources, limit = 1)
                        val dbItem = dbItems.firstOrNull()
                        if (dbItem != null) {
                            val rerank = SemanticReranker.computeSemanticRelevanceScore(multiSentenceContext, entities, dbItem)
                            if (rerank >= 0.40f) {
                                val score = if (intentResult.intent == RetrievalIntent.PERSONAL) 0.94f else 0.90f
                                return@async ScoredEvidence(dbItem, score, dbItem.sourceType)
                            }
                        }
                    } catch (_: Exception) {}
                }
                null
            }

            val allDeferreds = listOf(stockDeferred, personalDeferred, webDeferred, dictDeferred)

            // --- 2-Stage Graceful SLA Timeout Mechanism ---
            // Stage 1: Fast SLA Timeout (400ms)
            val fastSlaDeadline = 400L
            val checkInterval = 25L
            var elapsed = 0L

            while (elapsed < fastSlaDeadline) {
                if (allDeferreds.all { it.isCompleted }) break
                delay(checkInterval)
                elapsed += checkInterval
            }

            var completedResults = allDeferreds
                .filter { it.isCompleted }
                .mapNotNull { def ->
                    try { def.await() } catch (_: Exception) { null }
                }

            Log.i(TAG, "Scatter-Gather Fast SLA (${elapsed}ms): ${completedResults.size}/${allDeferreds.size} completed: ${completedResults.map { "${it.source}(${it.confidenceScore})" }}")

            // Stage 2: Hard Fallback Timeout (up to 1500ms total) if 0 results returned
            if (completedResults.isEmpty()) {
                Log.w(TAG, "Scatter-Gather SLA reached ${elapsed}ms with 0 successful results. Entering Hard Fallback Timeout (up to 1500ms)...")
                val hardDeadline = 1500L
                while (elapsed < hardDeadline) {
                    delay(checkInterval)
                    elapsed += checkInterval
                    val valid = allDeferreds
                        .filter { it.isCompleted }
                        .mapNotNull { def ->
                            try { def.await() } catch (_: Exception) { null }
                        }
                    if (valid.isNotEmpty()) {
                        completedResults = valid
                        break
                    }
                    if (allDeferreds.all { it.isCompleted }) break
                }
            }

            // Winner-Takes-All Selection
            val winner = completedResults.maxByOrNull { it.confidenceScore }
            if (winner != null) {
                Log.i(TAG, "Scatter-Gather Winner: ${winner.source} (conf: ${winner.confidenceScore}, title: ${winner.item.title})")
                winningEvidence = winner.item
            }

            // Cancel any remaining in-flight deferreds to immediately free up CPU/network resources
            allDeferreds.forEach { def ->
                if (!def.isCompleted) {
                    def.cancel()
                }
            }
        }

        val primaryEvidence = winningEvidence ?: return

        // --- STEP 4: Two-Tier Fast Path vs Selective LLM ---
        when (primaryEvidence.sourceType.uppercase()) {
            "STOCK" -> {
                // Zero-LLM Fast Path (< 1ms): direct HUD formatting without LLM overhead
                val stockName = primaryEvidence.title.substringBefore("(").trim()
                val priceInfo = primaryEvidence.content.lines().firstOrNull()?.removePrefix("-")?.trim() ?: primaryEvidence.title
                winningTipText = "[$stockName]: ${priceInfo.take(30)}"
            }
            "CONTACTS" -> {
                // Zero-LLM Fast Path (< 1ms)
                val cleanName = primaryEvidence.title.removePrefix("연락처:").trim()
                val phone = primaryEvidence.content.lines().firstOrNull { it.contains("010") || it.contains("전화") }
                    ?.removePrefix("-")?.trim() ?: "연락처 확인"
                winningTipText = "[$cleanName]: ${phone.take(30)}"
            }
            "CALL" -> {
                // Zero-LLM Fast Path (< 1ms)
                val cleanCaller = primaryEvidence.title.removePrefix("통화 기록:").removePrefix("통화:").trim()
                winningTipText = "[통화]: $cleanCaller 최근 통화 내용"
            }
            "CALENDAR" -> {
                // Zero-LLM Fast Path (< 1ms)
                val cleanTitle = primaryEvidence.title.removePrefix("일정:").trim()
                winningTipText = "[일정]: ${cleanTitle.take(30)}"
            }
            "DICTIONARY" -> {
                val def = primaryEvidence.content.lines().firstOrNull()?.trim() ?: ""
                val word = primaryEvidence.title.removePrefix("사전:").trim()
                if (def.isNotBlank()) {
                    winningTipText = "[$word]: ${def.take(30)}"
                }
            }
        }

        // If not formatted via Fast Path: invoke EXAONE-3.5 with GBNF Constrained Decoding and 2.5s Timeout Protection
        val finalTip = winningTipText ?: try {
            withTimeoutOrNull(2500L) {
                localLlmEngine.generateContextTip(
                    conversation = multiSentenceContext,
                    evidenceList = listOf(primaryEvidence)
                )
            } ?: "NONE"
        } catch (e: Exception) {
            Log.w(TAG, "EXAONE-3.5 generation timed out or failed, dropping gracefully to NONE", e)
            "NONE"
        }

        val cleanTip = finalTip.trim().removeSuffix("[|endofturn|]").trim()

        // Strict NONE Gate: Suppress tip card/HUD whenever response is NONE
        if (cleanTip.isNotBlank() && !cleanTip.equals("NONE", ignoreCase = true) && !cleanTip.startsWith("NONE", ignoreCase = true)) {
            val formattedRefTitle = if (primaryEvidence.senderOrSource.isNotBlank()) {
                "${primaryEvidence.senderOrSource} | ${primaryEvidence.title}"
            } else {
                primaryEvidence.title
            }

            val tipId = tipHistoryRepository.saveTip(
                triggerText = correctedText,
                generatedTip = cleanTip,
                referenceTitle = formattedRefTitle,
                referenceContent = primaryEvidence.content,
                sourceType = primaryEvidence.sourceType
            )

            val newTip = TipHistory(
                id = tipId,
                triggerText = correctedText,
                generatedTip = cleanTip,
                referenceTitle = formattedRefTitle,
                referenceContent = primaryEvidence.content,
                sourceType = primaryEvidence.sourceType,
                timestamp = System.currentTimeMillis()
            )

            // Enqueue to sequential display queue
            _queuedTipCount.value += 1
            tipQueueChannel.send(newTip)
        }
    }
}
