package com.assistant.realtimetip.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.ui.graphics.vector.ImageVector

enum class AppTab(
    val title: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
    val pageIndex: Int
) {
    LIVE_TIPS(
        title = "실시간 팁",
        selectedIcon = Icons.Filled.AutoAwesome,
        unselectedIcon = Icons.Outlined.AutoAwesome,
        pageIndex = 0
    ),
    TIP_HISTORY(
        title = "팁 히스토리",
        selectedIcon = Icons.Filled.History,
        unselectedIcon = Icons.Outlined.History,
        pageIndex = 1
    ),
    KNOWLEDGE_BASE(
        title = "지식 베이스",
        selectedIcon = Icons.Filled.MenuBook,
        unselectedIcon = Icons.Outlined.MenuBook,
        pageIndex = 2
    ),
    SETTINGS(
        title = "세부 설정",
        selectedIcon = Icons.Filled.Settings,
        unselectedIcon = Icons.Outlined.Settings,
        pageIndex = 3
    )
}
