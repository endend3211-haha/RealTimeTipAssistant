package com.assistant.realtimetip.data.audio

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.assistant.realtimetip.data.security.SecurePreferenceManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * State representing the currently active microphone input.
 */
data class ActiveMicInfo(
    val isBluetooth: Boolean = false,
    val deviceName: String = "폰 마이크",
    val badgeText: String = "🎙 폰 마이크"
)

/**
 * Non-intrusive Bluetooth & Smart Glasses Microphone Router.
 *
 * Keeps AudioManager mode in MODE_NORMAL so external media playback (e.g. YouTube, music)
 * is never ducked, paused, or downgraded to low-bitrate SCO mono telephone quality.
 *
 * Only routes to smart glasses (e.g. MemoMind One) when explicitly detected, and avoids
 * hijacking general consumer A2DP headphones so external audio plays completely smoothly.
 */
class BluetoothMicRouter(
    private val context: Context,
    private val securePreferenceManager: SecurePreferenceManager
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private val _activeMicInfo = MutableStateFlow(ActiveMicInfo())
    val activeMicInfo: StateFlow<ActiveMicInfo> = _activeMicInfo.asStateFlow()

    private var isRegistered = false
    private var activeCommunicationDevice: AudioDeviceInfo? = null

    // Callback invoked when audio input switches between Bluetooth and built-in mic
    var onRouteChanged: (() -> Unit)? = null

    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
            mainHandler.post {
                evaluateAndApplyRouting()
            }
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
            mainHandler.post {
                evaluateAndApplyRouting()
            }
        }
    }

    private val bluetoothReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothDevice.ACTION_ACL_CONNECTED,
                BluetoothDevice.ACTION_ACL_DISCONNECTED,
                BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED,
                AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED -> {
                    mainHandler.postDelayed({
                        evaluateAndApplyRouting()
                    }, 300L)
                }
            }
        }
    }

    /**
     * Starts listening for Bluetooth audio device changes.
     */
    fun startRouting() {
        if (isRegistered) return
        isRegistered = true

        try {
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, mainHandler)
        } catch (_: Exception) {}

        try {
            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
                addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
                addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
                addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
            }
            context.registerReceiver(bluetoothReceiver, filter)
        } catch (_: Exception) {}

        evaluateAndApplyRouting()
    }

    /**
     * Stops routing listeners and resets communication device to default.
     */
    fun stopRouting() {
        if (!isRegistered) return
        isRegistered = false

        try {
            audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
        } catch (_: Exception) {}

        try {
            context.unregisterReceiver(bluetoothReceiver)
        } catch (_: Exception) {}

        resetToPhoneMic(notify = false)
    }

    /**
     * Updates preference for prioritizing smart glasses mic.
     */
    fun setPreferBluetoothMic(prefer: Boolean) {
        securePreferenceManager.isPreferBluetoothMicEnabled = prefer
        evaluateAndApplyRouting()
    }

    /**
     * Evaluates connected audio devices and applies non-intrusive routing.
     * Strictly preserves AudioManager.MODE_NORMAL and avoids Bluetooth SCO / setCommunicationDevice
     * to protect background media playback (e.g. YouTube, Music) from ducking, pausing, or stuttering.
     */
    fun evaluateAndApplyRouting() {
        // Enforce MODE_NORMAL so external media apps (YouTube, etc.) play smoothly without audio focus loss
        try {
            if (audioManager.mode != AudioManager.MODE_NORMAL) {
                audioManager.mode = AudioManager.MODE_NORMAL
            }
        } catch (_: Exception) {}

        // In passive conversation monitoring, we deliberately avoid calling setCommunicationDevice()
        // or startBluetoothSco() because they force Android into telecom call mode, interrupting A2DP media.
        _activeMicInfo.value = ActiveMicInfo(
            isBluetooth = false,
            deviceName = "패시브 마이크 모니터링",
            badgeText = "🎙 음성 청취 중 (미디어 무간섭)"
        )
    }

    private fun resetToPhoneMic(notify: Boolean) {
        val wasBluetooth = _activeMicInfo.value.isBluetooth

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice()
            } catch (_: Exception) {}
            activeCommunicationDevice = null
        } else {
            try {
                if (audioManager.isBluetoothScoOn) {
                    audioManager.isBluetoothScoOn = false
                    audioManager.stopBluetoothSco()
                }
            } catch (_: Exception) {}
        }

        // Always keep audio mode in NORMAL so YouTube and media stream seamlessly
        try {
            if (audioManager.mode != AudioManager.MODE_NORMAL) {
                audioManager.mode = AudioManager.MODE_NORMAL
            }
        } catch (_: Exception) {}

        _activeMicInfo.value = ActiveMicInfo(
            isBluetooth = false,
            deviceName = "폰 마이크",
            badgeText = "🎙 폰 마이크"
        )

        if (wasBluetooth && notify) {
            onRouteChanged?.invoke()
        }
    }

    private fun safeGetProductName(device: AudioDeviceInfo): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
                    device.productName?.toString() ?: ""
                } else {
                    device.productName?.toString() ?: ""
                }
            } else {
                device.productName?.toString() ?: ""
            }
        } catch (_: Exception) {
            ""
        }
    }
}
