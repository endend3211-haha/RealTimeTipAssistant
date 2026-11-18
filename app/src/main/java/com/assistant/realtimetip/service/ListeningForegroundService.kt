package com.assistant.realtimetip.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.assistant.realtimetip.MainActivity
import com.assistant.realtimetip.R
import com.assistant.realtimetip.TipAssistantApplication

/**
 * Lightweight Foreground Service holding the microphone foreground service type
 * to prevent Android OS from suspending real-time listening in background.
 */
class ListeningForegroundService : Service {

    constructor() : super()

    companion object {
        const val CHANNEL_ID = "realtime_assistant_listening_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.assistant.realtimetip.START_LISTENING"
        const val ACTION_STOP = "com.assistant.realtimetip.STOP_LISTENING"

        fun start(context: Context) {
            val intent = Intent(context, ListeningForegroundService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, ListeningForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                releaseWakeLock()
                val app = application as? TipAssistantApplication
                app?.bluetoothMicRouter?.stopRouting()
                app?.koreanSttManager?.stopContinuousListening()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                acquireWakeLock()
                val app = application as? TipAssistantApplication
                app?.bluetoothMicRouter?.startRouting()
                val activeMic = app?.bluetoothMicRouter?.activeMicInfo?.value?.badgeText ?: "🎙 폰 마이크"
                val notification = buildNotification("실시간 대화 분석 중 ($activeMic)")
                startForeground(NOTIFICATION_ID, notification)
                app?.koreanSttManager?.startContinuousListening()
                return START_STICKY
            }
        }
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) {
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "RealTimeTipAssistant:ListeningWakeLock"
                ).apply {
                    setReferenceCounted(false)
                }
            }
            if (wakeLock?.isHeld == false) {
                wakeLock?.acquire()
            }
        } catch (_: Exception) {}
    }

    private fun releaseWakeLock() {
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
    }

    private fun buildNotification(contentText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val stopIntent = Intent(this, ListeningForegroundService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("실시간 대화 팁 비서")
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "청취 중지", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "실시간 음성 청취 알림",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "실시간 대화를 분석하여 이메일/뉴스 기반 팁을 제공하기 위한 상시 청취 알림입니다."
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        releaseWakeLock()
        super.onDestroy()
    }
}
