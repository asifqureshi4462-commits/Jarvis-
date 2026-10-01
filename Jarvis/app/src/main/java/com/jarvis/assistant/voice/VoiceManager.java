package com.jarvis.assistant.voice;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.ArrayList;
import java.util.Locale;

/** Speech-to-text (SpeechRecognizer) and text-to-speech (TextToSpeech). Call from the main thread. */
public class VoiceManager {
    public interface ListenListener {
        void onPartial(String text);
        void onResult(String text);
        void onError(String message);
        void onLevel(float rms);
    }

    public interface SpeakListener {
        void onDone();
    }

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeakListener speakListener;

    public VoiceManager(Context c) {
        ctx = c.getApplicationContext();
        tts = new TextToSpeech(ctx, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { finishSpeaking(); }
                    @Override public void onError(String id) { finishSpeaking(); }
                    @Override public void onStop(String id, boolean interrupted) { finishSpeaking(); }
                });
            }
        });
    }

    private void finishSpeaking() {
        main.post(() -> {
            SpeakListener l = speakListener;
            speakListener = null;
            if (l != null) l.onDone();
        });
    }

    public boolean isRecognitionAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(ctx);
    }

    public void startListening(String langTag, ListenListener l) {
        cancelListening();
        recognizer = SpeechRecognizer.createSpeechRecognizer(ctx);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { l.onLevel(rmsdB); }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override public void onError(int error) { l.onError(describe(error)); }

            @Override public void onPartialResults(Bundle partial) {
                String t = first(partial);
                if (t != null) l.onPartial(t);
            }

            @Override public void onResults(Bundle results) {
                String t = first(results);
                if (t == null || t.trim().isEmpty()) l.onError("I didn't catch that. Please try again.");
                else l.onResult(t);
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, langTag);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(i);
    }

    /** Stop recording and deliver what was heard so far. */
    public void stopListening() {
        if (recognizer != null) recognizer.stopListening();
    }

    /** Abort listening without a result. */
    public void cancelListening() {
        if (recognizer != null) {
            recognizer.cancel();
            recognizer.destroy();
            recognizer = null;
        }
    }

    private static String first(Bundle b) {
        ArrayList<String> list = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() ? null : list.get(0);
    }

    private static String describe(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "I didn't catch that. Please try again.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Microphone permission is missing.";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Speech recognition needs a network connection right now.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Speech recognizer is busy. Try again in a moment.";
            case SpeechRecognizer.ERROR_AUDIO:
                return "Microphone problem. Check that no other app is using it.";
            default:
                return "Speech recognition failed (code " + error + ").";
        }
    }

    public void speak(String text, float rate, SpeakListener l) {
        speakListener = l;
        if (!ttsReady) {
            finishSpeaking();
            return;
        }
        String clean = text.replaceAll("```[\\s\\S]*?```", " Code omitted. ")
                .replaceAll("https?://\\S+", "link")
                .replaceAll("[*#`_>~]", "")
                .trim();
        if (clean.isEmpty()) {
            finishSpeaking();
            return;
        }
        int max = TextToSpeech.getMaxSpeechInputLength();
        if (clean.length() >= max) clean = clean.substring(0, max - 1);

        Locale loc = hasDevanagari(clean) ? Locale.forLanguageTag("hi-IN") : Locale.forLanguageTag("en-IN");
        int r = tts.setLanguage(loc);
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.getDefault());
        }
        tts.setSpeechRate(rate);
        tts.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "jarvis-utterance");
    }

    public void stopSpeaking() {
        if (tts != null) tts.stop();
    }

    private static boolean hasDevanagari(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= 0x0900 && c <= 0x097F) return true;
        }
        return false;
    }

    public void destroy() {
        cancelListening();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }
}
