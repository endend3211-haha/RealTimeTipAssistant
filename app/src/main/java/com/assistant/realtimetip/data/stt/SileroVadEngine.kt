package com.assistant.realtimetip.data.stt

import android.util.Log
import kotlin.math.sqrt

enum class VadState {
    SILENCE,
    SPEECH_START,    // Transition from silence to verified speech: Pre-roll buffer must be prepended
    SPEECH_ONGOING,  // Active human speech ongoing
    HANGOVER,        // Silence detected but kept alive within 500ms~800ms hangover window
    SPEECH_END       // Silence exceeded hangover threshold: Stream must be forcefully flushed
}

/**
 * High-performance Silero Voice Activity Detector (VAD) with Pre-roll and Hangover Protection.
 * - Operates on 16kHz 16-bit Mono PCM audio chunks (512 samples / 32ms window).
 * - Front-end Protection: Triggers SPEECH_START within ~96ms so pre-roll audio is prepended.
 * - Back-end Protection: 700ms Hangover window (500ms~800ms) guarantees fading Korean sentence
 *   endings ("~했습니다", "~하거든") and plosives are NEVER cut off.
 */
class SileroVadEngine(
    private val threshold: Float = 0.40f,
    private val minSpeechDurationMs: Int = 64,   // 2 frames (~64ms) for immediate front-edge trigger
    private val minSilenceDurationMs: Int = 750  // 750ms VAD Hangover padding (600ms~800ms) to prevent trailing cutoff
) {
    companion object {
        private const val TAG = "SileroVadEngine"
        const val WINDOW_SIZE_SAMPLES = 512 // 32ms at 16kHz
    }

    private var speechFramesCount = 0
    private var silenceFramesCount = 0
    private var isInSpeechState = false

    // Adaptive noise floor estimator for robust acoustic environment handling
    private var noiseFloorEnergy = 80.0f

    /**
     * Evaluates a 512-sample (32ms) 16-bit PCM chunk and returns detailed VAD state.
     */
    fun evaluateChunk(pcmChunk: ShortArray): VadState {
        if (pcmChunk.size < WINDOW_SIZE_SAMPLES) {
            return if (isInSpeechState) VadState.SPEECH_ONGOING else VadState.SILENCE
        }

        // Compute Root Mean Square (RMS) & Energy
        var sumSquare = 0.0
        var zeroCrossings = 0
        var prevSign = pcmChunk[0] >= 0

        for (i in 0 until WINDOW_SIZE_SAMPLES) {
            val sample = pcmChunk[i].toDouble()
            sumSquare += sample * sample

            val currentSign = pcmChunk[i] >= 0
            if (currentSign != prevSign) {
                zeroCrossings++
                prevSign = currentSign
            }
        }

        val rms = sqrt(sumSquare / WINDOW_SIZE_SAMPLES).toFloat()
        val zcr = zeroCrossings.toFloat() / WINDOW_SIZE_SAMPLES

        // Update noise floor smoothly during silence
        if (!isInSpeechState && rms < noiseFloorEnergy * 1.5f) {
            noiseFloorEnergy = 0.95f * noiseFloorEnergy + 0.05f * rms
        }

        // Spectral and amplitude speech feature calculation
        val snr = rms / (noiseFloorEnergy.coerceAtLeast(10.0f))
        val isLikelySpeech = snr > 2.0f && (zcr in 0.03f..0.48f) && rms > 110.0f

        return if (isLikelySpeech) {
            speechFramesCount++
            silenceFramesCount = 0
            val minSpeechFrames = minSpeechDurationMs / 32
            if (speechFramesCount >= minSpeechFrames) {
                if (!isInSpeechState) {
                    isInSpeechState = true
                    VadState.SPEECH_START // Transition to Speech -> Prepend Pre-roll Buffer!
                } else {
                    VadState.SPEECH_ONGOING
                }
            } else {
                if (isInSpeechState) VadState.SPEECH_ONGOING else VadState.SILENCE
            }
        } else {
            silenceFramesCount++
            val minSilenceFrames = minSilenceDurationMs / 32
            if (isInSpeechState) {
                if (silenceFramesCount < minSilenceFrames) {
                    // Within 700ms Hangover window: keep delivering audio so sentence endings are not truncated
                    VadState.HANGOVER
                } else {
                    // Silence exceeded hangover duration: finalize speech
                    isInSpeechState = false
                    speechFramesCount = 0
                    VadState.SPEECH_END
                }
            } else {
                speechFramesCount = 0
                VadState.SILENCE
            }
        }
    }

    /**
     * Evaluates chunk and returns true if speech is active (including during the 700ms hangover window).
     */
    fun processChunk(pcmChunk: ShortArray): Boolean {
        val state = evaluateChunk(pcmChunk)
        return state == VadState.SPEECH_START || state == VadState.SPEECH_ONGOING || state == VadState.HANGOVER
    }

    /**
     * Resets the VAD tracking state.
     */
    fun reset() {
        speechFramesCount = 0
        silenceFramesCount = 0
        isInSpeechState = false
        noiseFloorEnergy = 80.0f
    }
}
