package com.jarvis.assistant.ui;

import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.SwitchCompat;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.jarvis.assistant.R;
import com.jarvis.assistant.ai.GeminiClient;
import com.jarvis.assistant.data.Message;
import com.jarvis.assistant.security.SecureStore;

import java.util.Collections;
import java.util.Locale;

public class SettingsActivity extends AppCompatActivity {
    private static final String[] LANG_NAMES = {"English (India)", "Hindi", "English (US)", "English (UK)"};
    private static final String[] LANG_TAGS = {"en-IN", "hi-IN", "en-US", "en-GB"};

    private SecureStore store;
    private EditText apiKey, model, title, city;
    private Spinner lang;
    private SeekBar rate;
    private TextView rateLabel, apiStatus, testResult;
    private SwitchCompat speak, ground;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        store = SecureStore.get(this);

        apiKey = findViewById(R.id.apiKeyInput);
        model = findViewById(R.id.modelInput);
        title = findViewById(R.id.titleInput);
        city = findViewById(R.id.cityInput);
        lang = findViewById(R.id.langSpinner);
        rate = findViewById(R.id.rateSeek);
        rateLabel = findViewById(R.id.rateLabel);
        apiStatus = findViewById(R.id.apiStatus);
        testResult = findViewById(R.id.testResult);
        speak = findViewById(R.id.speakSwitch);
        ground = findViewById(R.id.groundSwitch);

        ArrayAdapter<String> la = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, LANG_NAMES);
        la.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        lang.setAdapter(la);

        rate.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) { showRate(p); }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { }
        });

        findViewById(R.id.btnSave).setOnClickListener(v -> {
            save();
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
        });
        findViewById(R.id.btnTest).setOnClickListener(v -> testConnection());
        findViewById(R.id.btnRemoveKey).setOnClickListener(v ->
                new MaterialAlertDialogBuilder(this)
                        .setTitle("Remove the saved API key?")
                        .setPositiveButton("Remove", (d, w) -> {
                            store.removeApiKey();
                            apiKey.setText("");
                            refreshStatus();
                        })
                        .setNegativeButton("Cancel", null)
                        .show());

        load();
    }

    private void load() {
        model.setText(store.getModel());
        title.setText(store.getUserTitle());
        city.setText(store.getHomeCity());
        speak.setChecked(store.isAlwaysSpeak());
        ground.setChecked(store.isGrounding());
        for (int i = 0; i < LANG_TAGS.length; i++) {
            if (LANG_TAGS[i].equals(store.getSttLang())) lang.setSelection(i);
        }
        int p = Math.round((store.getSpeechRate() - 0.5f) * 10f);
        rate.setProgress(Math.max(0, Math.min(15, p)));
        showRate(rate.getProgress());
        refreshStatus();
    }

    private void showRate(int p) {
        rateLabel.setText(String.format(Locale.US, "SPEECH SPEED  (%.1fx)", 0.5f + p * 0.1f));
    }

    private void refreshStatus() {
        apiStatus.setText(store.getApiKey().isEmpty()
                ? "No API key saved yet."
                : "API key saved (encrypted on this device). Type a new one to replace it.");
    }

    private void save() {
        String key = apiKey.getText().toString().trim();
        if (!key.isEmpty()) {
            store.setApiKey(key);
            apiKey.setText("");
        }
        store.setModel(model.getText().toString());
        store.setUserTitle(title.getText().toString());
        store.setHomeCity(city.getText().toString());
        store.setSttLang(LANG_TAGS[lang.getSelectedItemPosition()]);
        store.setAlwaysSpeak(speak.isChecked());
        store.setGrounding(ground.isChecked());
        store.setSpeechRate(0.5f + rate.getProgress() * 0.1f);
        refreshStatus();
    }

    private void testConnection() {
        save();
        testResult.setText("Testing...");
        new GeminiClient(this).generate(
                Collections.singletonList(new Message(0, "user", "Reply with the single word: OK", System.currentTimeMillis())),
                null, "",
                new GeminiClient.Callback() {
                    @Override
                    public void onSuccess(String text) {
                        testResult.setText("Connected. Gemini answered: " + text);
                    }

                    @Override
                    public void onError(String message) {
                        testResult.setText("Failed: " + message);
                    }
                });
    }
}
