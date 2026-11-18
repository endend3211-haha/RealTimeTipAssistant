package com.assistant.realtimetip.ui.screens

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.outlined.TipsAndUpdates
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.assistant.realtimetip.data.llm.LlmModelState
import com.assistant.realtimetip.data.local.entity.TipHistory
import com.assistant.realtimetip.data.pipeline.AssistantPipelineController
import com.assistant.realtimetip.ui.components.ConversationCaptionBox
import com.assistant.realtimetip.ui.components.MemoMindHudCard
import com.assistant.realtimetip.ui.components.TipDetailBottomSheet
import com.assistant.realtimetip.ui.components.TipHighlightCard
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveTipsScreen(
    pipelineController: AssistantPipelineController,
    onNavigateToSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isListening by pipelineController.isListening.collectAsState()
    val sttStatus by pipelineController.sttStatus.collectAsState()
    val partialCaption by pipelineController.partialCaption.collectAsState()
    val speechRms by pipelineController.speechRms.collectAsState()
    val latestLog by pipelineController.latestLog.collectAsState()
    val recentLogs by pipelineController.recentLogs.collectAsState()
    val displayedTip by pipelineController.currentDisplayedTip.collectAsState()
    val hudTipStack by pipelineController.hudTipStack.collectAsState()
    val hudFeedLines by pipelineController.hudFeedLines.collectAsState()
    val queuedTipCount by pipelineController.queuedTipCount.collectAsState()
    val modelState by pipelineController.modelState.collectAsState()
    val isGeneratingTip by pipelineController.isGeneratingTip.collectAsState()
    val isSyncing by pipelineController.isSyncing.collectAsState()

    // 7 Independent Knowledge Source Switches
    val isStockEnabled by pipelineController.isStockEnabled.collectAsState()
    val isWebSearchEnabled by pipelineController.isWebSearchEnabled.collectAsState()
    val isEmailEnabled by pipelineController.isEmailEnabled.collectAsState()
    val isNewsEnabled by pipelineController.isNewsEnabled.collectAsState()
    val isCalendarEnabled by pipelineController.isCalendarEnabled.collectAsState()
    val isContactsEnabled by pipelineController.isContactsEnabled.collectAsState()
    val isCallEnabled by pipelineController.isCallEnabled.collectAsState()
    val isPreferBluetoothMicEnabled by pipelineController.isPreferBluetoothMicEnabled.collectAsState()
    val activeMicInfo by pipelineController.activeMicInfo.collectAsState()

    // MemoMind HUD countdown progress
    val hudProgress by pipelineController.hudProgress.collectAsState()

    var selectedTipForDetails by remember { mutableStateOf<TipHistory?>(null) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        // --- 1. Top Status Header ---
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Active Listening Toggle Switch + Active Mic Badge
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(
                        checked = isListening,
                        onCheckedChange = { pipelineController.toggleListening() },
                        modifier = Modifier.size(width = 44.dp, height = 28.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isListening) "청취 ON" else "청취 OFF",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = if (isListening) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Surface(
                        color = if (activeMicInfo.isBluetooth) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.clickable {
                            pipelineController.setPreferBluetoothMicEnabled(!isPreferBluetoothMicEnabled)
                        }
                    ) {
                        Text(
                            text = activeMicInfo.badgeText,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp, fontWeight = FontWeight.Bold),
                            color = if (activeMicInfo.isBluetooth) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Loaded LLM Status Chip
                    val (llmChipLabel, llmChipColor) = when (val state = modelState) {
                        is LlmModelState.Loaded -> state.modelName.take(12) + ".." to MaterialTheme.colorScheme.primary
                        is LlmModelState.Loading -> "로드 중.." to MaterialTheme.colorScheme.tertiary
                        is LlmModelState.Error -> "오류" to MaterialTheme.colorScheme.error
                        else -> "LLM 준비" to MaterialTheme.colorScheme.outline
                    }

                    FilterChip(
                        selected = modelState is LlmModelState.Loaded,
                        onClick = onNavigateToSettings,
                        label = {
                            Text(
                                text = llmChipLabel,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp)
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Memory,
                                contentDescription = null,
                                modifier = Modifier.size(13.dp),
                                tint = llmChipColor
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                        ),
                        modifier = Modifier.height(30.dp)
                    )

                    Spacer(modifier = Modifier.width(6.dp))

                    // Quick Manual Sync Icon Button
                    IconButton(
                        onClick = { pipelineController.triggerManualSync() },
                        enabled = !isSyncing,
                        modifier = Modifier.size(34.dp)
                    ) {
                        if (isSyncing) {
                            CircularProgressIndicator(
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(16.dp)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = "수동 동기화",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // --- 1.1 Seven Independent Knowledge Source FilterChips (Horizontally Scrollable) ---
        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            item {
                FilterChip(
                    selected = isWebSearchEnabled,
                    onClick = { pipelineController.setWebSearchEnabled(!isWebSearchEnabled) },
                    label = {
                        Text(
                            text = "웹 검색",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isWebSearchEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Language,
                            contentDescription = "웹 검색",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isEmailEnabled,
                    onClick = { pipelineController.setEmailEnabled(!isEmailEnabled) },
                    label = {
                        Text(
                            text = "이메일",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isEmailEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Email,
                            contentDescription = "이메일",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isNewsEnabled,
                    onClick = { pipelineController.setNewsEnabled(!isNewsEnabled) },
                    label = {
                        Text(
                            text = "뉴스",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isNewsEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Newspaper,
                            contentDescription = "뉴스",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isStockEnabled,
                    onClick = { pipelineController.setStockEnabled(!isStockEnabled) },
                    label = {
                        Text(
                            text = "실시간 주식",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isStockEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.TrendingUp,
                            contentDescription = "실시간 주식",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isCalendarEnabled,
                    onClick = { pipelineController.setCalendarEnabled(!isCalendarEnabled) },
                    label = {
                        Text(
                            text = "캘린더",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isCalendarEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.CalendarToday,
                            contentDescription = "캘린더",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isContactsEnabled,
                    onClick = { pipelineController.setContactsEnabled(!isContactsEnabled) },
                    label = {
                        Text(
                            text = "연락처",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isContactsEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "연락처",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }

            item {
                FilterChip(
                    selected = isCallEnabled,
                    onClick = { pipelineController.setCallEnabled(!isCallEnabled) },
                    label = {
                        Text(
                            text = "통화 요약",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 11.sp,
                                fontWeight = if (isCallEnabled) FontWeight.Bold else FontWeight.Normal
                            )
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "통화 요약",
                            modifier = Modifier.size(13.dp)
                        )
                    },
                    modifier = Modifier.height(30.dp)
                )
            }
        }

        // When all seven switches are OFF: display subtle status note
        AnimatedVisibility(
            visible = !isStockEnabled && !isWebSearchEnabled && !isEmailEnabled &&
                    !isNewsEnabled && !isCalendarEnabled && !isContactsEnabled && !isCallEnabled
        ) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
            ) {
                Text(
                    text = "모든 지식 소스가 꺼져 있어 자막만 기록됩니다",
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    ),
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(14.dp))

        // --- 2. MemoMind One Optical Waveguide HUD Viewport ---
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Outlined.TipsAndUpdates,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "MemoMind One 스마트글래스 HUD",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (isGeneratingTip) {
                    Spacer(modifier = Modifier.width(10.dp))
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "HUD 분석 중...",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Dedicated MemoMind One Smart Glasses HUD Optical Waveguide Viewport (640x350)
        // Instant streaming responsiveness: partial streaming words appear immediately while speaking
        val liveStreamingCaption = if (partialCaption.isNotBlank()) partialCaption else (latestLog?.correctedText ?: "")
        MemoMindHudCard(
            hudFeedLines = hudFeedLines,
            activeTip = displayedTip,
            queuedTipCount = queuedTipCount,
            hudProgress = hudProgress,
            liveCaption = liveStreamingCaption,
            onTipClick = { selectedTipForDetails = it }
        )

        // Quick 1-Tap Action Bar to view full tip & source details directly on the phone
        val currentTip = displayedTip
        if (currentTip != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { selectedTipForDetails = currentTip }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "💡 활성 팁: ${currentTip.referenceTitle}",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "터치하여 팁 전문 및 출처 원문 확인",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                    Text(
                        text = "상세보기 >",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // --- 3. Live Real-Time Conversation Caption Box ---
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "실시간 대화 캡션",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        ConversationCaptionBox(
            isListening = isListening,
            sttStatus = sttStatus,
            partialCaption = partialCaption,
            latestLog = latestLog,
            recentLogs = recentLogs,
            speechRms = speechRms
        )

        Spacer(modifier = Modifier.height(24.dp))
    }

    // ModalBottomSheet for detailed tip view
    if (selectedTipForDetails != null) {
        TipDetailBottomSheet(
            tip = selectedTipForDetails,
            sheetState = sheetState,
            onDismissRequest = {
                coroutineScope.launch { sheetState.hide() }.invokeOnCompletion {
                    selectedTipForDetails = null
                }
            }
        )
    }
}
