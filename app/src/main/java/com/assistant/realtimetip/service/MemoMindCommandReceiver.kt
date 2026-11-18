package com.assistant.realtimetip.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.assistant.realtimetip.TipAssistantApplication

/**
 * BroadcastReceiver listening for bidirectional control commands sent from MemoMind One
 * Smart Glasses (com.mcnex.memomind.hud).
 *
 * Allows toggling 7 Android App Data Sources and Start/Stop STT Listening directly from
 * hardware buttons and quick menus on the smart glasses.
 */
class MemoMindCommandReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_CONTROL_COMMAND = "com.memomind.hud.ACTION_CONTROL_COMMAND"
        const val EXTRA_TARGET = "target"
        const val EXTRA_VALUE = "value"
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action != ACTION_CONTROL_COMMAND) return

        val target = intent.getStringExtra(EXTRA_TARGET) ?: return
        val value = intent.getBooleanExtra(EXTRA_VALUE, true)

        val app = context?.applicationContext as? TipAssistantApplication ?: return
        val controller = app.pipelineController

        when (target) {
            "sttListening" -> {
                if (value) {
                    ListeningForegroundService.start(context)
                } else {
                    ListeningForegroundService.stop(context)
                }
            }
            "isWebSearchEnabled" -> controller.setWebSearchEnabled(value)
            "isEmailEnabled" -> controller.setEmailEnabled(value)
            "isNewsEnabled" -> controller.setNewsEnabled(value)
            "isStockEnabled" -> controller.setStockEnabled(value)
            "isCalendarEnabled" -> controller.setCalendarEnabled(value)
            "isContactsEnabled" -> controller.setContactsEnabled(value)
            "isCallEnabled" -> controller.setCallEnabled(value)
            "isPreferBluetoothMic" -> controller.setPreferBluetoothMicEnabled(value)
        }
    }
}
