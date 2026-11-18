package com.assistant.realtimetip

import android.app.Application
import com.assistant.realtimetip.data.audio.BluetoothMicRouter
import com.assistant.realtimetip.data.hud.MemoMindHudDispatcher
import com.assistant.realtimetip.service.MemoMindLocalServer
import com.assistant.realtimetip.data.local.AppDatabase
import com.assistant.realtimetip.data.repository.ConversationRepository
import com.assistant.realtimetip.data.repository.KnowledgeRepository
import com.assistant.realtimetip.data.repository.TipHistoryRepository
import com.assistant.realtimetip.data.llm.LocalLlmEngine
import com.assistant.realtimetip.data.pipeline.AssistantPipelineController
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.stt.KoreanSttManager
import com.assistant.realtimetip.data.sync.CalendarCollector
import com.assistant.realtimetip.data.sync.CallSummaryCollector
import com.assistant.realtimetip.data.sync.ContactsCollector
import com.assistant.realtimetip.data.sync.EmailSyncManager
import com.assistant.realtimetip.data.sync.FreeDictionaryLookupService
import com.assistant.realtimetip.data.sync.NewsSyncManager
import com.assistant.realtimetip.data.sync.StockQuoteManager
import com.assistant.realtimetip.data.sync.SyncWorker
import com.assistant.realtimetip.data.sync.WebSearchManager
import com.assistant.realtimetip.data.util.SttPostProcessor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class TipAssistantApplication : Application() {

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    lateinit var database: AppDatabase
        private set

    lateinit var securePreferenceManager: SecurePreferenceManager
        private set

    lateinit var knowledgeRepository: KnowledgeRepository
        private set

    lateinit var conversationRepository: ConversationRepository
        private set

    lateinit var tipHistoryRepository: TipHistoryRepository
        private set

    lateinit var emailSyncManager: EmailSyncManager
        private set

    lateinit var newsSyncManager: NewsSyncManager
        private set

    lateinit var freeDictionaryLookupService: FreeDictionaryLookupService
        private set

    lateinit var webSearchManager: WebSearchManager
        private set

    lateinit var stockQuoteManager: StockQuoteManager
        private set

    lateinit var calendarCollector: CalendarCollector
        private set

    lateinit var contactsCollector: ContactsCollector
        private set

    lateinit var callSummaryCollector: CallSummaryCollector
        private set

    lateinit var bluetoothMicRouter: BluetoothMicRouter
        private set

    lateinit var memoMindHudDispatcher: MemoMindHudDispatcher
        private set

    lateinit var sttPostProcessor: SttPostProcessor
        private set

    lateinit var koreanSttManager: KoreanSttManager
        private set

    lateinit var localLlmEngine: LocalLlmEngine
        private set

    lateinit var pipelineController: AssistantPipelineController
        private set

    lateinit var memoMindLocalServer: MemoMindLocalServer
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // 1. Local Database & Security
        database = AppDatabase.getInstance(this)
        securePreferenceManager = SecurePreferenceManager(this)

        // 2. Repositories
        knowledgeRepository = KnowledgeRepository(database.knowledgeDao())
        conversationRepository = ConversationRepository(database.conversationLogDao())
        tipHistoryRepository = TipHistoryRepository(database.tipHistoryDao())

        // 3. Sync Managers, Web Search, Stock & Device Collectors
        emailSyncManager = EmailSyncManager(securePreferenceManager, knowledgeRepository)
        newsSyncManager = NewsSyncManager(securePreferenceManager, knowledgeRepository)
        freeDictionaryLookupService = FreeDictionaryLookupService(database.dictionaryDao())
        webSearchManager = WebSearchManager(securePreferenceManager)
        stockQuoteManager = StockQuoteManager()
        calendarCollector = CalendarCollector(this)
        callSummaryCollector = CallSummaryCollector(this, database.knowledgeDao())
        contactsCollector = ContactsCollector(this, callSummaryCollector)
        memoMindHudDispatcher = MemoMindHudDispatcher(this)

        // 4. Speech Recognition & Post Processor
        sttPostProcessor = SttPostProcessor(securePreferenceManager)
        koreanSttManager = KoreanSttManager(
            context = this,
            securePreferenceManager = securePreferenceManager,
            knowledgeRepository = knowledgeRepository,
            sttPostProcessor = sttPostProcessor,
            stockQuoteManager = stockQuoteManager,
            contactsCollector = contactsCollector
        )

        // 5. Bluetooth / Smart Glasses Audio Mic Router
        bluetoothMicRouter = BluetoothMicRouter(this, securePreferenceManager).apply {
            onRouteChanged = {
                if (::koreanSttManager.isInitialized) {
                    koreanSttManager.rebindListeningSession()
                }
            }
            startRouting()
        }

        // 5. On-Device Local LLM Engine
        localLlmEngine = LocalLlmEngine(
            context = this,
            securePreferenceManager = securePreferenceManager
        )

        applicationScope.launch {
            localLlmEngine.loadModel()
        }

        // 6. Central Pipeline Controller
        pipelineController = AssistantPipelineController(
            context = this,
            koreanSttManager = koreanSttManager,
            conversationRepository = conversationRepository,
            knowledgeRepository = knowledgeRepository,
            localLlmEngine = localLlmEngine,
            tipHistoryRepository = tipHistoryRepository,
            emailSyncManager = emailSyncManager,
            newsSyncManager = newsSyncManager,
            freeDictionaryLookupService = freeDictionaryLookupService,
            webSearchManager = webSearchManager,
            stockQuoteManager = stockQuoteManager,
            calendarCollector = calendarCollector,
            contactsCollector = contactsCollector,
            callSummaryCollector = callSummaryCollector,
            memoMindHudDispatcher = memoMindHudDispatcher,
            securePreferenceManager = securePreferenceManager,
            bluetoothMicRouter = bluetoothMicRouter
        )

        // 7. Local HTTP Bridge Server for MemoMind Glasses Web Plugin
        memoMindLocalServer = MemoMindLocalServer(this, applicationScope).apply {
            start()
        }

        // 8. Background Sync Scheduling
        val syncInterval = securePreferenceManager.syncIntervalMinutes
        if (syncInterval > 0) {
            SyncWorker.schedulePeriodicSync(this, syncInterval.toLong())
        }
    }

    companion object {
        lateinit var instance: TipAssistantApplication
            private set
    }
}
