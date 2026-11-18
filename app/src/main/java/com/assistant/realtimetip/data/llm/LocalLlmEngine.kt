package com.assistant.realtimetip.data.llm

import android.content.Context
import android.util.Log
import com.assistant.realtimetip.data.datastore.LlmModelDataStore
import com.assistant.realtimetip.data.local.entity.KnowledgeItem
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

sealed class LlmModelState {
    object Unloaded : LlmModelState()
    data class Loading(val modelName: String) : LlmModelState()
    data class Loaded(
        val modelName: String,
        val modelPath: String,
        val threads: Int,
        val contextSize: Int,
        val isNative: Boolean
    ) : LlmModelState()
    data class Error(val message: String) : LlmModelState()
}

/**
 * On-Device Local LLM Engine managing GGUF model execution, dynamic switching,
 * and high-clarity 1-3 line tip generation using llama.cpp JNI bindings.
 * All inference operations are executed on a strictly sequential single-threaded dispatcher.
 */
class LocalLlmEngine(
    private val context: Context,
    private val securePreferenceManager: SecurePreferenceManager,
    val llmModelDataStore: LlmModelDataStore = LlmModelDataStore(context)
) {

    companion object {
        private const val TAG = "LocalLlmEngine"
        // Coroutine Timeout Protection: 2.5 seconds hard timeout for EXAONE-3.5 generation
        private const val LLM_INFERENCE_TIMEOUT_MS = 2500L

        // GBNF Grammar strictly constraining EXAONE-3.5-2.4B output
        val TIP_GBNF_GRAMMAR = """
            root ::= none-res | tip-res
            none-res ::= "NONE"
            tip-res ::= "[" category "]: " [^\n]{1,40}
            category ::= "사전" | "웹검색" | "이메일" | "일정" | "주식" | "뉴스" | "연락처" | "통화"
        """.trimIndent()

        private val VALID_TIP_REGEX = Regex("""^(\[[^\]]+\]:\s*.+|NONE)$""")
    }

    // Single-threaded dispatcher to guarantee sequential thread safety and prevent memory spikes
    private val inferenceDispatcher: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1)

    private val llamaBridge = LlamaBridge()

    private val _modelState = MutableStateFlow<LlmModelState>(LlmModelState.Unloaded)
    val modelState: StateFlow<LlmModelState> = _modelState.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _availableModels = MutableStateFlow<List<ModelFile>>(emptyList())
    val availableModels: StateFlow<List<ModelFile>> = _availableModels.asStateFlow()

    init {
        refreshAvailableModels()
    }

    fun refreshAvailableModels() {
        _availableModels.value = ModelFileManager.scanAvailableGgufModels(context)
    }

    /**
     * Hot-reloads a new GGUF model with Critical Anti-OOM protection.
     * Explicitly frees previous model weights and KV cache memory BEFORE instantiating the new model.
     * Persists selection to AndroidX DataStore and SecurePreferences.
     */
    suspend fun hotReloadLLM(
        newModelPath: String,
        threads: Int = securePreferenceManager.llmThreads,
        contextSize: Int = securePreferenceManager.llmContextSize,
        temperature: Float = securePreferenceManager.llmTemperature
    ): Result<Unit> = withContext(inferenceDispatcher) {
        val modelFile = File(newModelPath)
        val modelName = modelFile.name
        Log.i(TAG, "Starting hotReloadLLM (Critical Anti-OOM): $modelName ($newModelPath)")

        _modelState.value = LlmModelState.Loading(modelName)

        try {
            // CRITICAL ANTI-OOM: Unload previous model weights and KV cache from CPU/GPU memory first!
            llamaBridge.freeModel()
            System.gc() // Trigger GC to reclaim native-associated buffers

            val isNativeAvailable = LlamaBridge.isNativeAvailable()
            var success = false

            if (isNativeAvailable && modelFile.exists()) {
                success = llamaBridge.initModel(
                    modelPath = newModelPath,
                    nThreads = threads,
                    nCtx = contextSize,
                    temperature = temperature
                )
            } else {
                success = true
            }

            if (success) {
                // Save to DataStore & SecurePreferences
                llmModelDataStore.saveSelectedModelPath(newModelPath)
                securePreferenceManager.llmModelPath = newModelPath
                securePreferenceManager.llmThreads = threads
                securePreferenceManager.llmContextSize = contextSize
                securePreferenceManager.llmTemperature = temperature

                _modelState.value = LlmModelState.Loaded(
                    modelName = modelName,
                    modelPath = newModelPath,
                    threads = threads,
                    contextSize = contextSize,
                    isNative = isNativeAvailable && modelFile.exists()
                )
                refreshAvailableModels()
                Log.i(TAG, "Hot-reload completed successfully: $modelName")
                Result.success(Unit)
            } else {
                val errorMsg = "새 GGUF 모델 초기화에 실패했습니다: $newModelPath"
                _modelState.value = LlmModelState.Error(errorMsg)
                Result.failure(IllegalStateException(errorMsg))
            }
        } catch (e: Exception) {
            val errorMsg = "모델 핫 리로드 중 오류 발생: ${e.message}"
            _modelState.value = LlmModelState.Error(errorMsg)
            Result.failure(e)
        }
    }

    /**
     * Dynamically loads or reloads the GGUF model with specified inference parameters.
     * Reads active model path from DataStore on startup.
     */
    suspend fun loadModel(
        modelPath: String? = null,
        threads: Int = securePreferenceManager.llmThreads,
        contextSize: Int = securePreferenceManager.llmContextSize,
        temperature: Float = securePreferenceManager.llmTemperature
    ): Result<Unit> = withContext(inferenceDispatcher) {
        val effectivePath = modelPath ?: llmModelDataStore.getSelectedModelPath()
        hotReloadLLM(effectivePath, threads, contextSize, temperature)
    }

    /**
     * Frees and unloads current model from memory.
     */
    suspend fun unloadModel() = withContext(inferenceDispatcher) {
        llamaBridge.freeModel()
        _modelState.value = LlmModelState.Unloaded
    }

    /**
     * Fast Post-Correction Pass using EXAONE-3.5-2.4B (< 500ms).
     * Corrects phonetic typos and grammatically awkward Korean particles (조사) based on conversational context.
     * Output is strictly constrained to only the corrected sentence.
     * E.g.: "카카오 주식 뜨시 모야" -> "카카오 주식 뜻이 뭐야?"
     */
    suspend fun correctKoreanSpeech(rawSentence: String): String = withContext(inferenceDispatcher) {
        val trimmed = rawSentence.trim()
        if (trimmed.isBlank() || trimmed.length <= 1) return@withContext trimmed

        try {
            withTimeoutOrNull(500L) {
                if (llamaBridge.isLoaded) {
                    val prompt = """
[|system|]
당신은 한국어 음성 인식 오타 및 조사 교정기입니다. 다음 규칙을 엄격히 지키세요:
1. 문맥에 맞추어 발음상 유사한 오타와 어색한 조사(은/는/이/가/을/를/의/에)만 자연스럽게 교정하세요.
2. 고유명사(종목명, 기업명, 인명)를 보존하고 문장 의미를 훼손하지 마세요.
3. 예시:
- "카카오 주식 뜨시 모야" -> "카카오 주식 뜻이 뭐야?"
- "삼성전자 주가 가 얼마야" -> "삼성전자 주가가 얼마야?"
- "오늘 일정 을 알려줘" -> "오늘 일정 알려줘"
4. 부가 설명, 인사, 따옴표 없이 오직 교정된 한국어 문장 1개만 출력하세요.
[|user|]
$trimmed
[|assistant|]
""".trim()
                    val result = llamaBridge.generate(prompt, maxTokens = 36).trim()
                    val cleaned = result
                        .replace("[|endofturn|]", "")
                        .replace("<|endofturn|>", "")
                        .replace("</s>", "")
                        .lines().firstOrNull { it.isNotBlank() }
                        ?.trim()
                        ?.removeSurrounding("\"")
                        ?: trimmed

                    if (cleaned.isNotBlank() && !cleaned.contains("[|") && cleaned.length in (trimmed.length - 10)..(trimmed.length + 15)) {
                        Log.i(TAG, "EXAONE-3.5 Fast Correction: '$trimmed' -> '$cleaned'")
                        cleaned
                    } else {
                        trimmed
                    }
                } else {
                    trimmed
                }
            } ?: trimmed
        } catch (_: Exception) {
            trimmed
        }
    }

    /**
     * Generates a context-grounded 1-line actionable tip (within 35 Korean characters)
     * using the official EXAONE-3.5-2.4B-Instruct chat template and strict NONE gating.
     * All calls are executed sequentially on the single-threaded dispatcher.
     */
    suspend fun generateContextTip(
        conversation: String,
        evidenceList: List<KnowledgeItem>
    ): String = withContext(inferenceDispatcher) {
        if (conversation.isBlank() || evidenceList.isEmpty()) {
            return@withContext "NONE"
        }

        _isGenerating.value = true

        try {
            // Coroutine Timeout Protection: allow max 2.5 seconds, dropping gracefully to NONE on timeout
            withTimeoutOrNull(LLM_INFERENCE_TIMEOUT_MS) {
                val prompt = formatExaonePrompt(conversation, evidenceList)

                var result = ""
                if (llamaBridge.isLoaded) {
                    // Topic Pinning & KV Cache Shifting: preserve static system prompt & topic tokens, prefill newest utterance
                    llamaBridge.shiftKvCacheWithTopicPinning(pinnedTokens = 120, newTokens = conversation.length.coerceAtLeast(10))
                    // EXAONE-3.5 inference with GBNF Constrained Decoding (maxTokens = 40) for < 300ms latency
                    result = llamaBridge.generateConstrained(prompt, TIP_GBNF_GRAMMAR, maxTokens = 40).trim()
                }

                // Fallback generation logic when native model is in lightweight/fallback mode
                if (result.isBlank()) {
                    result = generateFallbackTip(conversation, evidenceList)
                }

                // Cleanly strip [|endofturn|], trailing whitespace, and markdown
                var cleaned = result
                    .replace("[|endofturn|]", "")
                    .replace("<|endofturn|>", "")
                    .replace("</s>", "")
                    .replace("`", "")
                    .replace("**", "")
                    .replace("*", "")
                    .trim()
                    .removeSurrounding("\"")

                // Strict NONE Gate: suppress tip card & HUD whenever output is NONE or does not match grammar
                if (cleaned.isBlank() ||
                    cleaned.equals("NONE", ignoreCase = true) ||
                    cleaned.startsWith("NONE", ignoreCase = true) ||
                    cleaned.startsWith("[NONE]", ignoreCase = true)
                ) {
                    return@withTimeoutOrNull "NONE"
                }

                // Format to single crisp sentence within 35-40 characters
                val firstLine = cleaned.lines().firstOrNull { it.isNotBlank() } ?: "NONE"
                val trimmedLine = firstLine.take(45).trim()

                // Verify strict [Category]: Content format
                if (!trimmedLine.contains("]:")) {
                    return@withTimeoutOrNull "NONE"
                }

                trimmedLine
            } ?: run {
                Log.w(TAG, "EXAONE-3.5 generation timed out (> ${LLM_INFERENCE_TIMEOUT_MS}ms), dropping gracefully to NONE")
                "NONE"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error generating context tip, dropping gracefully to NONE", e)
            "NONE"
        } finally {
            _isGenerating.value = false
        }
    }

    /**
     * Formats prompt with the official EXAONE-3.5-2.4B-Instruct Chat Template.
     * Keeps [|system|] prompt strictly static to allow llama.cpp KV cache reuse across turns,
     * and caps context window (last 2-3 sentences ~120 chars, top-1 snippet ~100 chars) for ultra-fast generation.
     */
    fun formatExaonePrompt(conversation: String, evidenceList: List<KnowledgeItem>): String {
        val systemPrompt = """
당신은 실시간 대화를 분석해 사용자에게 꼭 필요한 핵심 팁 1줄만 제공하는 AI 어시스턴트입니다.
[규칙]
1. 제공된 [참고 데이터(일정/이메일/연락처/뉴스/사전/웹)]와 [최근 대화] 사이에 유의미한 연관성이 있거나, 대화 속 핵심 용어/단어의 사전적 뜻 또는 요약이 필요할 때 팁을 작성하세요.
2. [Soft NONE Gate] 대화 맥락상 사용자에게 실질적인 도움이나 직관적인 정보를 줄 수 있는 유의미한 기회에는 유용한 팁을 제공하고, 단순 잡담/추임새/리액션/인사 등 지식 팁이 전혀 불필요한 대화일 때만 `NONE`을 출력하세요.
3. 팁은 스마트 글라스 HUD와 자막창에 바로 띄울 수 있도록 35자 이내의 한국어 한 문장으로 간결하게 작성하세요. (예: "[단어]: 핵심 뜻 요약")
4. 추측하거나 없는 사실을 지어내지 마세요.
""".trim()

        val topEvidence = evidenceList.firstOrNull()
        val evidenceText = if (topEvidence == null) {
            "없음"
        } else {
            val typeTag = when (topEvidence.sourceType.uppercase()) {
                "STOCK" -> "[실시간 주식]"
                "WEB" -> "[웹 검색]"
                "EMAIL" -> "[이메일]"
                "CALENDAR" -> "[일정]"
                "CONTACTS" -> "[연락처]"
                "CALL" -> "[통화]"
                "DICTIONARY" -> "[사전]"
                else -> "[뉴스]"
            }
            val cleanSnippet = topEvidence.content.take(100).replace("\n", " ").trim()
            "- $typeTag ${topEvidence.title}: $cleanSnippet"
        }

        // Strictly cap conversation context to recent 2-3 sentences (~120 chars) to minimize prompt eval tokens
        val compactConversation = conversation.takeLast(120).trim().ifBlank { "없음" }

        return buildString {
            append("[|system|]\n")
            append(systemPrompt)
            append("\n[|endofturn|]\n")
            append("[|user|]\n")
            append("[참고 데이터]:\n")
            append(evidenceText)
            append("\n\n[최근 대화]:\n")
            append(compactConversation)
            append("\n[|endofturn|]\n")
            append("[|assistant|]\n")
        }
    }

    /**
     * Fallback high-precision 1-line tip generator adhering strictly to EXAONE rules.
     */
    private fun generateFallbackTip(conversation: String, evidenceList: List<KnowledgeItem>): String {
        val bestEvidence = evidenceList.firstOrNull() ?: return "NONE"

        val title = bestEvidence.title
        val snippetCandidate = bestEvidence.content.lines()
            .map { it.trim().removePrefix("-").trim() }
            .firstOrNull { it.length in 6..70 && !it.contains(title.take(15)) }
            ?: bestEvidence.content.lines().firstOrNull { it.isNotBlank() && it != title }
            ?: ""

        return when (bestEvidence.sourceType.uppercase()) {
            "DICTIONARY" -> {
                val word = title.removePrefix("사전:").removePrefix("[사전]").trim()
                val def = snippetCandidate.removePrefix("[단어 뜻]:").trim()
                "[$word]: ${def.take(28)}"
            }
            "STOCK" -> {
                val stockName = title.substringBefore("(").trim()
                val priceInfo = bestEvidence.content.lines().firstOrNull()?.removePrefix("-")?.trim() ?: title
                "[$stockName]: ${priceInfo.take(28)}"
            }
            "EMAIL" -> {
                val cleanTitle = title.replace(Regex("""(?i)\b(Re|RE|Fwd|FW|\[회신\]|\[전달\]|\[FWD\])[:\s\-]+"""), "").trim()
                "[이메일]: ${cleanTitle.take(30)}"
            }
            "CALENDAR" -> {
                val cleanTitle = title.removePrefix("일정:").trim()
                "[일정]: ${cleanTitle.take(30)}"
            }
            "CONTACTS" -> {
                val cleanName = title.removePrefix("연락처:").trim()
                val phone = bestEvidence.content.lines().firstOrNull { it.contains("전화") || it.contains("010") }
                    ?.removePrefix("-")?.trim() ?: "연락처 확인"
                "[$cleanName]: ${phone.take(28)}"
            }
            "CALL" -> {
                val cleanCaller = title.removePrefix("통화 기록:").removePrefix("통화:").trim()
                "[통화]: $cleanCaller 최근 통화 기록"
            }
            else -> {
                val cleanNews = title.replace(Regex("""^\[[^\]]+\]"""), "").trim()
                "[뉴스]: ${cleanNews.take(30)}"
            }
        }
    }
}
