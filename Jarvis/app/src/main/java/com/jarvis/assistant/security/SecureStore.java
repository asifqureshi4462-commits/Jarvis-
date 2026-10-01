package com.jarvis.assistant.security;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import java.io.IOException;
import java.security.GeneralSecurityException;

/** All settings, encrypted at rest with the Android Keystore. The API key never lives in source code. */
public class SecureStore {
    private static final String NAME = "jarvis_secure";
    private static SecureStore instance;
    private final SharedPreferences prefs;

    public static synchronized SecureStore get(Context c) {
        if (instance == null) instance = new SecureStore(c.getApplicationContext());
        return instance;
    }

    private SecureStore(Context c) {
        prefs = create(c);
    }

    private static SharedPreferences create(Context c) {
        try {
            return open(c);
        } catch (Exception first) {
            // Keystore data can become unreadable (e.g. after a restore). Start fresh once.
            c.deleteSharedPreferences(NAME);
            try {
                return open(c);
            } catch (Exception second) {
                throw new IllegalStateException("Secure storage is unavailable on this device", second);
            }
        }
    }

    private static SharedPreferences open(Context c) throws GeneralSecurityException, IOException {
        MasterKey key = new MasterKey.Builder(c).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
        return EncryptedSharedPreferences.create(c, NAME, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    public String getApiKey() { return prefs.getString("api_key", ""); }
    public void setApiKey(String k) { prefs.edit().putString("api_key", k.trim()).apply(); }
    public void removeApiKey() { prefs.edit().remove("api_key").apply(); }

    public String getModel() {
        String m = prefs.getString("model", "");
        return m.isEmpty() ? "gemini-2.5-flash" : m;
    }
    public void setModel(String m) {
        // Only characters valid in a model id; it becomes part of the request URL.
        prefs.edit().putString("model", m.trim().replaceAll("[^A-Za-z0-9._-]", "")).apply();
    }

    public String getUserTitle() {
        String t = prefs.getString("title", "");
        return t.isEmpty() ? "Sir" : t;
    }
    public void setUserTitle(String t) { prefs.edit().putString("title", t.trim()).apply(); }

    public String getHomeCity() { return prefs.getString("city", ""); }
    public void setHomeCity(String c) { prefs.edit().putString("city", c.trim()).apply(); }

    public String getSttLang() { return prefs.getString("stt_lang", "en-IN"); }
    public void setSttLang(String l) { prefs.edit().putString("stt_lang", l).apply(); }

    public boolean isAlwaysSpeak() { return prefs.getBoolean("always_speak", false); }
    public void setAlwaysSpeak(boolean b) { prefs.edit().putBoolean("always_speak", b).apply(); }

    public boolean isGrounding() { return prefs.getBoolean("grounding", true); }
    public void setGrounding(boolean b) { prefs.edit().putBoolean("grounding", b).apply(); }

    public float getSpeechRate() { return prefs.getFloat("speech_rate", 1.0f); }
    public void setSpeechRate(float r) { prefs.edit().putFloat("speech_rate", r).apply(); }
}
