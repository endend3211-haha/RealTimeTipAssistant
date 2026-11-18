package com.assistant.realtimetip.data.stt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Continuous Background Audio Ring Buffer (16kHz, 16-bit Mono PCM).
 * - Front-end Protection: Maintains a continuous rolling circular pre-roll buffer (300ms ~ 500ms).
 * - When speech is triggered, the pre-roll audio is prepended to the STT stream,
 *   entirely eliminating initial syllable clipping.
 * - Back-end Protection: Provides reliable sample extraction and non-blocking background capture.
 */
class ContinuousAudioRingBuffer(
    private val context: Context,
    private val scope: CoroutineScope
) {
    companion object {
        const val SAMPLE_RATE = 16000
        const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        const val BYTES_PER_SAMPLE = 2
        const val BUFFER_DURATION_SECONDS = 3 // 3-second circular ring buffer (48,000 samples)
        const val TOTAL_SAMPLES = SAMPLE_RATE * BUFFER_DURATION_SECONDS
        const val CHUNK_SIZE_SAMPLES = 4800 // 300ms at 16kHz for rich acoustic context (increased from 512/32ms)
    }

    private val sampleRingBuffer = ShortArray(TOTAL_SAMPLES)
    private var writeHead = 0
    private val chunkAccumulator = mutableListOf<Short>()
    private val lock = Any()

    private var isRunning = false
    private var onChunkCallback: ((ShortArray) -> Unit)? = null

    @Volatile
    var currentRmsDb: Float = 0f
        private set

    /**
     * Initializes continuous circular ring buffer without hardware AudioRecord contention.
     * Prevents Android AudioPolicy / HAL from blocking or starving SpeechRecognizer.
     */
    fun start(onChunkAvailable: ((ShortArray) -> Unit)? = null) {
        if (isRunning) return
        isRunning = true
        onChunkCallback = onChunkAvailable
    }

    /**
     * Feeds 16-bit PCM Short samples into circular ring buffer and calculates instant RMS dB.
     * Accumulates samples into 300ms acoustic chunks (4800 samples) before dispatching to STT/VAD.
     */
    fun feedShortSamples(samples: ShortArray, offset: Int = 0, length: Int = samples.size) {
        if (!isRunning || length <= 0) return

        var sum = 0.0
        val readyChunks = mutableListOf<ShortArray>()

        synchronized(lock) {
            val count = length.coerceAtMost(samples.size - offset)
            for (i in 0 until count) {
                val s = samples[offset + i]
                sampleRingBuffer[writeHead] = s
                writeHead = (writeHead + 1) % TOTAL_SAMPLES
                sum += s.toDouble() * s.toDouble()
                chunkAccumulator.add(s)
            }

            while (chunkAccumulator.size >= CHUNK_SIZE_SAMPLES) {
                val chunk = ShortArray(CHUNK_SIZE_SAMPLES)
                for (j in 0 until CHUNK_SIZE_SAMPLES) {
                    chunk[j] = chunkAccumulator[j]
                }
                chunkAccumulator.subList(0, CHUNK_SIZE_SAMPLES).clear()
                readyChunks.add(chunk)
            }
        }

        if (length > 0) {
            val rms = sqrt(sum / length)
            currentRmsDb = if (rms > 1.0) (20 * log10(rms)).toFloat().coerceIn(0f, 90f) else 0f
            for (chunk in readyChunks) {
                onChunkCallback?.invoke(chunk)
            }
        }
    }

    /**
     * Feeds PCM byte data into the circular ring buffer.
     */
    fun feedPcmData(data: ByteArray, offset: Int = 0, length: Int = data.size) {
        if (!isRunning || length <= 1) return
        val sampleCount = length / 2
        val shorts = ShortArray(sampleCount)
        for (i in 0 until sampleCount) {
            val idx = offset + i * 2
            shorts[i] = ((data[idx].toInt() and 0xFF) or (data[idx + 1].toInt() shl 8)).toShort()
        }
        feedShortSamples(shorts)
    }

    /**
     * Extracts the most recent audio samples from the circular ring buffer.
     * @param durationMs Length of audio in milliseconds to extract (default 400ms for pre-roll)
     */
    fun getLatestPreRollSamples(durationMs: Int = 400): ShortArray {
        val requestedSamples = (SAMPLE_RATE * durationMs / 1000).coerceAtMost(TOTAL_SAMPLES)
        val result = ShortArray(requestedSamples)

        synchronized(lock) {
            var readHead = (writeHead - requestedSamples + TOTAL_SAMPLES) % TOTAL_SAMPLES
            for (i in 0 until requestedSamples) {
                result[i] = sampleRingBuffer[readHead]
                readHead = (readHead + 1) % TOTAL_SAMPLES
            }
        }

        return result
    }

    /**
     * Extracts the most recent audio frames as ByteArray.
     */
    fun getLatestPreRollBuffer(durationMs: Int = 400): ByteArray {
        val samples = getLatestPreRollSamples(durationMs)
        val bytes = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = samples[i].toInt()
            bytes[i * 2] = (s and 0xFF).toByte()
            bytes[i * 2 + 1] = ((s shr 8) and 0xFF).toByte()
        }
        return bytes
    }

    /**
     * Stops continuous recording.
     */
    fun stop() {
        isRunning = false
        onChunkCallback = null
        currentRmsDb = 0f
        synchronized(lock) {
            chunkAccumulator.clear()
        }
    }
}
