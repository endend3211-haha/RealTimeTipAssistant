package com.assistant.realtimetip.ui.screens

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.RssFeed
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import com.assistant.realtimetip.data.llm.LlmModelState
import com.assistant.realtimetip.data.llm.LocalLlmEngine
import com.assistant.realtimetip.data.llm.ModelFileManager
import com.assistant.realtimetip.data.pipeline.AssistantPipelineController
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import com.assistant.realtimetip.data.sync.EmailSyncManager
import com.assistant.realtimetip.data.sync.StockQuoteManager
import com.assistant.realtimetip.data.sync.SyncWorker
import com.assistant.realtimetip.data.sync.WebSearchManager
import com.assistant.realtimetip.data.util.SttPostProcessor
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    securePreferenceManager: SecurePreferenceManager,
    localLlmEngine: LocalLlmEngine,
    sttPostProcessor: SttPostProcessor,
    emailSyncManager: EmailSyncManager,
    webSearchManager: WebSearchManager,
    stockQuoteManager: StockQuoteManager,
    pipelineController: AssistantPipelineController,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    // --- 1. LLM Settings State ---
    val availableModels by localLlmEngine.availableModels.collectAsState()
    val modelState by localLlmEngine.modelState.collectAsState()
    var selectedModelPath by remember { mutableStateOf(securePreferenceManager.llmModelPath) }
    var threads by remember { mutableIntStateOf(securePreferenceManager.llmThreads) }
    var contextSize by remember { mutableIntStateOf(securePreferenceManager.llmContextSize) }
    var isModelMenuExpanded by remember { mutableStateOf(false) }
    var isReloadingModel by remember { mutableStateOf(false) }

    // Live RAM readout
    var memoryUsage by remember { mutableStateOf(ModelFileManager.getAppMemoryUsage()) }
    LaunchedEffect(Unit) {
        while (true) {
            memoryUsage = ModelFileManager.getAppMemoryUsage()
            delay(3000)
        }
    }

    // System file picker fallback for GGUF model
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        if (uri != null) {
            selectedModelPath = uri.path ?: selectedModelPath
        }
    }

    // --- 2. STT Settings State ---
    val isPreferBluetoothMicEnabled by pipelineController.isPreferBluetoothMicEnabled.collectAsState()
    val activeMicInfo by pipelineController.activeMicInfo.collectAsState()
    var continuousListening by remember { mutableStateOf(securePreferenceManager.isContinuousListeningEnabled) }
    var biasingEnabled by remember { mutableStateOf(securePreferenceManager.isBiasingEnabled) }
    var jamoThreshold by remember { mutableFloatStateOf(securePreferenceManager.jamoSimilarityThreshold) }

    var customDictionary by remember { mutableStateOf(sttPostProcessor.getCustomDictionary()) }
    var newWrongWord by remember { mutableStateOf("") }
    var newCorrectWord by remember { mutableStateOf("") }

    // --- 3. Knowledge Sources State (Synchronized with pipelineController) ---
    val isStockEnabled by pipelineController.isStockEnabled.collectAsState()
    val isWebSearchEnabled by pipelineController.isWebSearchEnabled.collectAsState()
    val isEmailEnabled by pipelineController.isEmailEnabled.collectAsState()
    val isNewsEnabled by pipelineController.isNewsEnabled.collectAsState()
    val isCalendarEnabled by pipelineController.isCalendarEnabled.collectAsState()
    val isContactsEnabled by pipelineController.isContactsEnabled.collectAsState()
    val isCallEnabled by pipelineController.isCallEnabled.collectAsState()
    val isDictionaryEnabled by pipelineController.isDictionaryEnabled.collectAsState()

    var hasCalendarPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED)
    }
    var hasContactsPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED)
    }
    var hasCallLogPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        hasCalendarPermission = perms[Manifest.permission.READ_CALENDAR] ?: (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED)
        hasContactsPermission = perms[Manifest.permission.READ_CONTACTS] ?: (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED)
        hasCallLogPermission = perms[Manifest.permission.READ_CALL_LOG] ?: (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED)
    }

    var stockTestQuery by remember { mutableStateOf("삼성전자") }
    var isTestingStock by remember { mutableStateOf(false) }
    var stockTestResult by remember { mutableStateOf<String?>(null) }

    var webSearchProvider by remember { mutableStateOf(securePreferenceManager.webSearchProvider) }
    var naverClientId by remember { mutableStateOf(securePreferenceManager.naverClientId) }
    var naverClientSecret by remember { mutableStateOf(securePreferenceManager.naverClientSecret) }
    var isNaverSecretVisible by remember { mutableStateOf(false) }
    var isTestingWebSearch by remember { mutableStateOf(false) }
    var webSearchTestResult by remember { mutableStateOf<String?>(null) }

    // Email IMAP & News RSS Settings State
    var selectedPreset by remember { mutableStateOf(securePreferenceManager.imapPreset) }
    var imapHost by remember { mutableStateOf(securePreferenceManager.imapHost) }
    var imapPort by remember { mutableIntStateOf(securePreferenceManager.imapPort) }
    var emailAddress by remember { mutableStateOf(securePreferenceManager.imapEmail) }
    var appPassword by remember { mutableStateOf(securePreferenceManager.imapPassword) }
    var isPasswordVisible by remember { mutableStateOf(false) }
    var isTestingConnection by remember { mutableStateOf(false) }
    var connectionTestResult by remember { mutableStateOf<String?>(null) }

    var syncInterval by remember { mutableIntStateOf(securePreferenceManager.syncIntervalMinutes) }

    var customRssUrls by remember { mutableStateOf(securePreferenceManager.customRssUrls) }
    var newRssUrl by remember { mutableStateOf("") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp)
    ) {
        // =========================================================================
        // SECTION 1: Local LLM Engine Configuration (AI Engine Settings)
        // =========================================================================
        SettingSectionHeader(title = "AI 엔진 설정 (LLM Model Selector)", icon = Icons.Default.Memory)

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Active Model Status Banner
                val activeModelName = when (val state = modelState) {
                    is LlmModelState.Loaded -> state.modelName
                    is LlmModelState.Loading -> "로드 중: ${state.modelName}"
                    is LlmModelState.Error -> "오류: ${state.message}"
                    LlmModelState.Unloaded -> "로드 대기 중"
                }

                Surface(
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "현재 활성 모델",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = activeModelName,
                                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Header with Refresh Button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "GGUF 모델 파일 (`ai` 폴더)",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Text(
                            text = "탐색 경로: /Download/ai 및 앱 내부 ai 폴더",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(
                        onClick = {
                            localLlmEngine.refreshAvailableModels()
                            Toast.makeText(context, "모델 목록을 새로고침했습니다.", Toast.LENGTH_SHORT).show()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "새로고침",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // ExposedDropdownMenuBox for discovered .gguf files
                ExposedDropdownMenuBox(
                    expanded = isModelMenuExpanded,
                    onExpandedChange = { isModelMenuExpanded = it }
                ) {
                    OutlinedTextField(
                        value = availableModels.firstOrNull { it.path == selectedModelPath }?.name
                            ?: selectedModelPath.substringAfterLast("/"),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("선택된 GGUF 모델") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = isModelMenuExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(),
                        shape = RoundedCornerShape(10.dp)
                    )
                    ExposedDropdownMenu(
                        expanded = isModelMenuExpanded,
                        onDismissRequest = { isModelMenuExpanded = false }
                    ) {
                        if (availableModels.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text("발견된 .gguf 모델이 없습니다.") },
                                onClick = { isModelMenuExpanded = false }
                            )
                        } else {
                            availableModels.forEach { model ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween
                                            ) {
                                                Text(
                                                    text = model.name,
                                                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold)
                                                )
                                                if (model.path == selectedModelPath) {
                                                    Text(
                                                        text = "선택됨",
                                                        style = MaterialTheme.typography.labelSmall,
                                                        color = MaterialTheme.colorScheme.primary
                                                    )
                                                }
                                            }
                                            Text(
                                                text = "${model.sizeFormatted} • ${model.path}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    },
                                    onClick = {
                                        selectedModelPath = model.path
                                        isModelMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(imageVector = Icons.Default.FolderOpen, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("외부 파일 탐색기에서 GGUF 선택")
                }

                Spacer(modifier = Modifier.height(14.dp))

                // CPU Threads Slider (2-8)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "CPU 연산 스레드 수", style = MaterialTheme.typography.bodyMedium)
                    Text(text = "$threads 스레드", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Slider(
                    value = threads.toFloat(),
                    onValueChange = { threads = it.toInt() },
                    valueRange = 2f..8f,
                    steps = 5
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Context Window Size Segmented Buttons
                Text(text = "컨텍스트 윈도우 크기", style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(6.dp))
                val contextOptions = listOf(1024, 2048, 4096)
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    contextOptions.forEachIndexed { index, size ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = contextOptions.size),
                            onClick = { contextSize = size },
                            selected = contextSize == size
                        ) {
                            Text("$size 토큰")
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // RAM Readout Box
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("앱 힙 점유량", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${memoryUsage.usedRamMb} MB", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                        Column {
                            Text("가용 힙 여유", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${memoryUsage.freeRamMb} MB", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                        Column {
                            Text("최대 허용 힙", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${memoryUsage.maxHeapMb} MB", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Hot Reload Model Button (Anti-OOM)
                Button(
                    onClick = {
                        coroutineScope.launch {
                            isReloadingModel = true
                            val result = localLlmEngine.hotReloadLLM(
                                newModelPath = selectedModelPath,
                                threads = threads,
                                contextSize = contextSize
                            )
                            isReloadingModel = false
                            if (result.isSuccess) {
                                Toast.makeText(context, "새 모델이 안전하게 로드되었습니다 (DataStore 저장 완료).", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "모델 로드 실패: ${result.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    enabled = !isReloadingModel,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("새 모델 핫 리로드 (Anti-OOM 안전 교체)")
                }
            }
        }

        // Safe Hot-Reloading Modal Dialog Overlay with CircularProgressIndicator
        if (isReloadingModel) {
            Dialog(onDismissRequest = {}) {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .padding(28.dp)
                            .fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(52.dp),
                            strokeWidth = 4.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(20.dp))
                        Text(
                            text = "AI 모델 로딩 중...",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "메모리 부족(OOM) 방지를 위해 기존 모델 가중치와 KV 캐시를 완전히 해제한 후 새 모델을 적재하고 있습니다.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // =========================================================================
        // SECTION 2: Speech Recognition (STT) & Phonetic Correction
        // =========================================================================
        SettingSectionHeader(title = "음성 인식 (STT) 및 음운 교정", icon = Icons.Default.Mic)

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Bluetooth / Glasses Mic Priority Toggle & Badge
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("블루투스(안경) 마이크 우선 사용", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                            Spacer(modifier = Modifier.width(6.dp))
                            Surface(
                                color = if (activeMicInfo.isBluetooth) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = activeMicInfo.badgeText,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp, fontWeight = FontWeight.Bold),
                                    color = if (activeMicInfo.isBluetooth) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Text("MemoMind One 스마트글래스 또는 블루투스 헤드셋 연결 시 마이크 자동 전환", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isPreferBluetoothMicEnabled,
                        onCheckedChange = {
                            pipelineController.setPreferBluetoothMicEnabled(it)
                        }
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Continuous Listening Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("연속 상시 청취 활성화", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("대화 중단 시에도 백그라운드에서 자동 재연결 대기", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = continuousListening,
                        onCheckedChange = {
                            continuousListening = it
                            securePreferenceManager.isContinuousListeningEnabled = it
                        }
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Domain Keyword Biasing Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("지식 DB 키워드 바이애싱 (API 33+)", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("저장된 이메일/뉴스 핵심 고유명사 우선 인식", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = biasingEnabled,
                        onCheckedChange = {
                            biasingEnabled = it
                            securePreferenceManager.isBiasingEnabled = it
                        }
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Jamo Similarity Threshold Slider
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("한글 자모 유사도 임계치", style = MaterialTheme.typography.bodyMedium)
                    Text("${(jamoThreshold * 100).toInt()}%", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                Slider(
                    value = jamoThreshold,
                    onValueChange = {
                        jamoThreshold = it
                        securePreferenceManager.jamoSimilarityThreshold = it
                    },
                    valueRange = 0.70f..0.95f,
                    steps = 4
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Custom Correction Dictionary Manager
                Text(
                    text = "사용자 오인식 교정 사전",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = newWrongWord,
                        onValueChange = { newWrongWord = it },
                        placeholder = { Text("오인식 단어") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    OutlinedTextField(
                        value = newCorrectWord,
                        onValueChange = { newCorrectWord = it },
                        placeholder = { Text("교정 단어") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    IconButton(
                        onClick = {
                            if (newWrongWord.isNotBlank() && newCorrectWord.isNotBlank()) {
                                sttPostProcessor.addCustomDictionaryEntry(newWrongWord, newCorrectWord)
                                customDictionary = sttPostProcessor.getCustomDictionary()
                                newWrongWord = ""
                                newCorrectWord = ""
                            }
                        }
                    ) {
                        Icon(imageVector = Icons.Default.Add, contentDescription = "추가", tint = MaterialTheme.colorScheme.primary)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Registered Words Chips/List
                if (customDictionary.isEmpty()) {
                    Text(
                        text = "등록된 교정 규칙이 없습니다. (예: 쿠베 -> 쿠버네티스)",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        customDictionary.forEach { (wrong, correct) ->
                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 10.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "$wrong  ➔  $correct",
                                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
                                    )
                                    IconButton(
                                        onClick = {
                                            sttPostProcessor.removeCustomDictionaryEntry(wrong)
                                            customDictionary = sttPostProcessor.getCustomDictionary()
                                        },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Delete,
                                            contentDescription = "삭제",
                                            tint = MaterialTheme.colorScheme.error,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // =========================================================================
        // SECTION 3: Knowledge Sources & Sync Settings
        // =========================================================================
        SettingSectionHeader(title = "지식 소스 및 수집 설정", icon = Icons.Default.Language)

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // --- 3.1 Seven Independent Knowledge Source Switches ---
                Text(
                    text = "7대 독립 지식 소스 활성화",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(10.dp))

                // Switch 1: Web Search
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("실시간 웹 검색", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("대화 키워드로 실시간 인터넷 검색 스니펫 수집", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isWebSearchEnabled,
                        onCheckedChange = { pipelineController.setWebSearchEnabled(it) }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 2: Emails
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("이메일 요약 데이터", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("IMAP으로 동기화된 이메일 3줄 요약 로컬 검색", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isEmailEnabled,
                        onCheckedChange = { pipelineController.setEmailEnabled(it) }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 3: News
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("최신 뉴스 요약", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("RSS 피드로 수집된 언론사 뉴스 1~3줄 요약 로컬 검색", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isNewsEnabled,
                        onCheckedChange = { pipelineController.setNewsEnabled(it) }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 4: Stocks
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("실시간 주식 시세", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("종목명, 티커, 지수 언급 시 실시간 시세 및 등락률 조회", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isStockEnabled,
                        onCheckedChange = { pipelineController.setStockEnabled(it) }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 5: Calendar
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("캘린더 일정", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                            Spacer(modifier = Modifier.width(6.dp))
                            if (!hasCalendarPermission) {
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text("권한 필요", fontSize = 10.sp, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp))
                                }
                            }
                        }
                        Text("오늘~14일 내 일정, 약속, 회의 발화 시 매칭", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!hasCalendarPermission) {
                            OutlinedButton(
                                onClick = { permissionLauncher.launch(arrayOf(Manifest.permission.READ_CALENDAR)) },
                                modifier = Modifier.height(28.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
                            ) {
                                Text("허용", fontSize = 11.sp)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Switch(
                            checked = isCalendarEnabled,
                            onCheckedChange = {
                                if (it && !hasCalendarPermission) {
                                    permissionLauncher.launch(arrayOf(Manifest.permission.READ_CALENDAR))
                                }
                                pipelineController.setCalendarEnabled(it)
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 6: Contacts
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("연락처 데이터", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                            Spacer(modifier = Modifier.width(6.dp))
                            if (!hasContactsPermission) {
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text("권한 필요", fontSize = 10.sp, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp))
                                }
                            }
                        }
                        Text("인명, 회사, 직함 언급 시 전화번호 및 메모 조회", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!hasContactsPermission) {
                            OutlinedButton(
                                onClick = { permissionLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS)) },
                                modifier = Modifier.height(28.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
                            ) {
                                Text("허용", fontSize = 11.sp)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Switch(
                            checked = isContactsEnabled,
                            onCheckedChange = {
                                if (it && !hasContactsPermission) {
                                    permissionLauncher.launch(arrayOf(Manifest.permission.READ_CONTACTS))
                                }
                                pipelineController.setContactsEnabled(it)
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 7: Call Log & AI Summaries
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("통화 기록 및 AI 통화 요약", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                            Spacer(modifier = Modifier.width(6.dp))
                            if (!hasCallLogPermission) {
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text("권한 필요", fontSize = 10.sp, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp))
                                }
                            }
                        }
                        Text("최근 통화 기록 및 삼성/에이닷/T전화 AI 요약 수집", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!hasCallLogPermission) {
                            OutlinedButton(
                                onClick = { permissionLauncher.launch(arrayOf(Manifest.permission.READ_CALL_LOG)) },
                                modifier = Modifier.height(28.dp),
                                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp)
                            ) {
                                Text("허용", fontSize = 11.sp)
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                        }
                        Switch(
                            checked = isCallEnabled,
                            onCheckedChange = {
                                if (it && !hasCallLogPermission) {
                                    permissionLauncher.launch(arrayOf(Manifest.permission.READ_CALL_LOG))
                                }
                                pipelineController.setCallEnabled(it)
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Switch 8: Free Dictionary & Encyclopedic Lookup (Priority 1)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("실시간 사전 및 백과 용어 해설", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
                        Text("전문 용어, 기술 외래어, 한글 어휘 발화 시 1줄 뜻풀이 자동 조회 (우선순위 1위)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = isDictionaryEnabled,
                        onCheckedChange = { pipelineController.setDictionaryEnabled(it) }
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Action to open Notification Listener Settings for post-call AI summaries
                OutlinedButton(
                    onClick = {
                        try {
                            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            Toast.makeText(context, "알림 접근 설정을 열 수 없습니다: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(imageVector = Icons.Default.Notifications, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("AI 통화 요약 알림 수집 권한 설정", style = MaterialTheme.typography.labelMedium)
                }

                Spacer(modifier = Modifier.height(18.dp))

                // --- 3.2 Real-Time Web Search Provider Settings ---
                Text(
                    text = "실시간 웹 검색 공급자 설정",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(8.dp))

                val searchProviders = listOf("KEYLESS_RSS" to "무키 RSS (Keyless)", "NAVER_API" to "네이버 API")
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    searchProviders.forEachIndexed { index, (providerKey, label) ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = searchProviders.size),
                            onClick = {
                                webSearchProvider = providerKey
                                securePreferenceManager.webSearchProvider = providerKey
                            },
                            selected = webSearchProvider == providerKey
                        ) {
                            Text(label, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                if (webSearchProvider == "NAVER_API") {
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedTextField(
                        value = naverClientId,
                        onValueChange = {
                            naverClientId = it
                            securePreferenceManager.naverClientId = it
                        },
                        label = { Text("네이버 Client ID") },
                        placeholder = { Text("Naver Developers 발급 Client ID") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = naverClientSecret,
                        onValueChange = {
                            naverClientSecret = it
                            securePreferenceManager.naverClientSecret = it
                        },
                        label = { Text("네이버 Client Secret") },
                        placeholder = { Text("Client Secret 키") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp),
                        visualTransformation = if (isNaverSecretVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { isNaverSecretVisible = !isNaverSecretVisible }) {
                                Icon(
                                    imageVector = if (isNaverSecretVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = null
                                )
                            }
                        }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Web Search Connection Test Button
                OutlinedButton(
                    onClick = {
                        coroutineScope.launch {
                            isTestingWebSearch = true
                            webSearchTestResult = null
                            val res = webSearchManager.testConnection()
                            isTestingWebSearch = false
                            webSearchTestResult = if (res.isSuccess) {
                                res.getOrNull()
                            } else {
                                res.exceptionOrNull()?.message ?: "웹 검색 연결 실패"
                            }
                        }
                    },
                    enabled = !isTestingWebSearch,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isTestingWebSearch) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("웹 검색 연결 테스트 중...")
                    } else {
                        Text("웹 검색 연결 테스트")
                    }
                }

                webSearchTestResult?.let { msg ->
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (msg.contains("성공")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                }

                Spacer(modifier = Modifier.height(18.dp))

                // --- 3.2.1 Real-Time Stock Quote Test ---
                Text(
                    text = "실시간 주식 시세 조회 테스트",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = stockTestQuery,
                    onValueChange = { stockTestQuery = it },
                    label = { Text("종목명 또는 티커") },
                    placeholder = { Text("예: 삼성전자, NVDA, 코스피") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedButton(
                    onClick = {
                        coroutineScope.launch {
                            isTestingStock = true
                            stockTestResult = null
                            val res = stockQuoteManager.testQuote(stockTestQuery)
                            isTestingStock = false
                            stockTestResult = if (res.isSuccess) {
                                res.getOrNull()
                            } else {
                                res.exceptionOrNull()?.message ?: "주식 시세 조회 실패"
                            }
                        }
                    },
                    enabled = !isTestingStock && stockTestQuery.isNotBlank(),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isTestingStock) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("실시간 주가 조회 중...")
                    } else {
                        Text("주식 시세 조회 테스트")
                    }
                }

                stockTestResult?.let { msg ->
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (msg.contains("실시간") || msg.contains("시세") || msg.contains("현재가")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // --- 3.3 Email IMAP Settings ---
                Text(
                    text = "이메일 수집 설정 (IMAP SSL)",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("GMAIL" to "Gmail", "NAVER" to "네이버", "CUSTOM" to "직접 입력").forEach { (preset, label) ->
                        FilterChip(
                            selected = selectedPreset == preset,
                            onClick = {
                                selectedPreset = preset
                                securePreferenceManager.imapPreset = preset
                                when (preset) {
                                    "GMAIL" -> {
                                        imapHost = "imap.gmail.com"
                                        imapPort = 993
                                    }
                                    "NAVER" -> {
                                        imapHost = "imap.naver.com"
                                        imapPort = 993
                                    }
                                }
                                securePreferenceManager.imapHost = imapHost
                                securePreferenceManager.imapPort = imapPort
                            },
                            label = { Text(label) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // IMAP Host & Port (if Custom)
                if (selectedPreset == "CUSTOM") {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = imapHost,
                            onValueChange = {
                                imapHost = it
                                securePreferenceManager.imapHost = it
                            },
                            label = { Text("IMAP 서버") },
                            modifier = Modifier.weight(2f),
                            singleLine = true,
                            shape = RoundedCornerShape(8.dp)
                        )
                        OutlinedTextField(
                            value = imapPort.toString(),
                            onValueChange = {
                                imapPort = it.toIntOrNull() ?: 993
                                securePreferenceManager.imapPort = imapPort
                            },
                            label = { Text("포트") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            shape = RoundedCornerShape(8.dp)
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                }

                // Email Address
                OutlinedTextField(
                    value = emailAddress,
                    onValueChange = {
                        emailAddress = it
                        securePreferenceManager.imapEmail = it
                    },
                    label = { Text("이메일 계정") },
                    placeholder = { Text("user@gmail.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp)
                )

                Spacer(modifier = Modifier.height(10.dp))

                // App Password (Encrypted)
                OutlinedTextField(
                    value = appPassword,
                    onValueChange = {
                        appPassword = it
                        securePreferenceManager.imapPassword = it
                    },
                    label = { Text("16자리 전용 앱 비밀번호") },
                    placeholder = { Text("abcd efgh ijkl mnop") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(8.dp),
                    visualTransformation = if (isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        IconButton(onClick = { isPasswordVisible = !isPasswordVisible }) {
                            Icon(
                                imageVector = if (isPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null
                            )
                        }
                    }
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Test Connection Button
                OutlinedButton(
                    onClick = {
                        coroutineScope.launch {
                            isTestingConnection = true
                            connectionTestResult = null
                            val res = emailSyncManager.testConnection()
                            isTestingConnection = false
                            connectionTestResult = if (res.isSuccess) {
                                res.getOrNull()
                            } else {
                                res.exceptionOrNull()?.message ?: "연결 오류 발생"
                            }
                        }
                    },
                    enabled = !isTestingConnection && emailAddress.isNotBlank() && appPassword.isNotBlank(),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isTestingConnection) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("서버 연결 테스트 중...")
                    } else {
                        Text("이메일 서버 연결 테스트")
                    }
                }

                connectionTestResult?.let { msg ->
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (msg.contains("성공")) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Background Sync Frequency Selector
                Text(text = "백그라운드 동기화 주기", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                Spacer(modifier = Modifier.height(6.dp))
                val intervalOptions = listOf(15 to "15분", 30 to "30분", 60 to "1시간", 0 to "수동 전용")
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    intervalOptions.forEachIndexed { index, (mins, label) ->
                        SegmentedButton(
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = intervalOptions.size),
                            onClick = {
                                syncInterval = mins
                                securePreferenceManager.syncIntervalMinutes = mins
                                if (mins > 0) {
                                    SyncWorker.schedulePeriodicSync(context, mins.toLong())
                                } else {
                                    SyncWorker.cancelPeriodicSync(context)
                                }
                            },
                            selected = syncInterval == mins
                        ) {
                            Text(label, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // News RSS Feeds List Manager
                Text(text = "뉴스 RSS 피드 목록", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold))
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "• Google News Korea RSS (기본 내장)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                customRssUrls.forEach { url ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "• $url",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        IconButton(
                            onClick = {
                                securePreferenceManager.removeCustomRssUrl(url)
                                customRssUrls = securePreferenceManager.customRssUrls
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(imageVector = Icons.Default.Delete, contentDescription = "삭제", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = newRssUrl,
                        onValueChange = { newRssUrl = it },
                        placeholder = { Text("https://example.com/rss.xml") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(8.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    IconButton(
                        onClick = {
                            if (newRssUrl.isNotBlank()) {
                                securePreferenceManager.addCustomRssUrl(newRssUrl)
                                customRssUrls = securePreferenceManager.customRssUrls
                                newRssUrl = ""
                            }
                        }
                    ) {
                        Icon(imageVector = Icons.Default.Add, contentDescription = "추가", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun SettingSectionHeader(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
