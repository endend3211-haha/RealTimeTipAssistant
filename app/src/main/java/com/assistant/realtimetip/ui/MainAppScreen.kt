package com.assistant.realtimetip.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.assistant.realtimetip.TipAssistantApplication
import com.assistant.realtimetip.ui.navigation.AppTab
import com.assistant.realtimetip.ui.screens.KnowledgeBaseScreen
import com.assistant.realtimetip.ui.screens.LiveTipsScreen
import com.assistant.realtimetip.ui.screens.SettingsScreen
import com.assistant.realtimetip.ui.screens.TipHistoryScreen
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun MainAppScreen(
    app: TipAssistantApplication,
    modifier: Modifier = Modifier
) {
    val tabs = remember { AppTab.values() }
    val pagerState = rememberPagerState(
        initialPage = AppTab.LIVE_TIPS.pageIndex,
        pageCount = { tabs.size }
    )
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val syncMessage by app.pipelineController.syncStatusMessage.collectAsState()

    LaunchedEffect(syncMessage) {
        syncMessage?.let { msg ->
            snackbarHostState.showSnackbar(msg)
            app.pipelineController.clearSyncMessage()
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = tabs[pagerState.currentPage].title,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp
            ) {
                tabs.forEach { tab ->
                    val isSelected = pagerState.currentPage == tab.pageIndex
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = {
                            coroutineScope.launch {
                                pagerState.animateScrollToPage(
                                    page = tab.pageIndex,
                                    animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing)
                                )
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = if (isSelected) tab.selectedIcon else tab.unselectedIcon,
                                contentDescription = tab.title
                            )
                        },
                        label = {
                            Text(
                                text = tab.title,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            )
                        }
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) }
    ) { innerPadding ->
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) { pageIndex ->
            when (tabs[pageIndex]) {
                AppTab.LIVE_TIPS -> {
                    LiveTipsScreen(
                        pipelineController = app.pipelineController,
                        onNavigateToSettings = {
                            coroutineScope.launch {
                                pagerState.animateScrollToPage(
                                    page = AppTab.SETTINGS.pageIndex,
                                    animationSpec = tween(durationMillis = 300, easing = FastOutSlowInEasing)
                                )
                            }
                        }
                    )
                }
                AppTab.TIP_HISTORY -> {
                    TipHistoryScreen(
                        tipHistoryRepository = app.tipHistoryRepository
                    )
                }
                AppTab.KNOWLEDGE_BASE -> {
                    KnowledgeBaseScreen(
                        knowledgeRepository = app.knowledgeRepository,
                        pipelineController = app.pipelineController
                    )
                }
                AppTab.SETTINGS -> {
                    SettingsScreen(
                        securePreferenceManager = app.securePreferenceManager,
                        localLlmEngine = app.localLlmEngine,
                        sttPostProcessor = app.sttPostProcessor,
                        emailSyncManager = app.emailSyncManager,
                        webSearchManager = app.webSearchManager,
                        stockQuoteManager = app.stockQuoteManager,
                        pipelineController = app.pipelineController
                    )
                }
            }
        }
    }
}
