package com.assistant.realtimetip

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.assistant.realtimetip.ui.MainAppScreen
import com.assistant.realtimetip.ui.components.PermissionHandler
import com.assistant.realtimetip.ui.theme.RealTimeTipAssistantTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as TipAssistantApplication

        setContent {
            RealTimeTipAssistantTheme {
                var hasPermissions by remember { mutableStateOf(false) }

                Surface(modifier = Modifier.fillMaxSize()) {
                    PermissionHandler(
                        onPermissionsGranted = {
                            hasPermissions = true
                        }
                    )

                    MainAppScreen(app = app)
                }
            }
        }
    }
}
