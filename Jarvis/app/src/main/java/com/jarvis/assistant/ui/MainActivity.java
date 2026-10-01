package com.jarvis.assistant.ui;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.jarvis.assistant.R;
import com.jarvis.assistant.ai.Attachment;
import com.jarvis.assistant.ai.GeminiClient;
import com.jarvis.assistant.ai.PromptBuilder;
import com.jarvis.assistant.commands.CommandRouter;
import com.jarvis.assistant.data.DbHelper;
import com.jarvis.assistant.data.Message;
import com.jarvis.assistant.files.FileProcessor;
import com.jarvis.assistant.security.SecureStore;
import com.jarvis.assistant.voice.VoiceManager;

import java.io.IOException;
import java.util.List;

/** Main screen: chat, voice, attachments and the status orb. */
public class MainActivity extends AppCompatActivity {
    private enum State { IDLE, LISTENING, THINKING, SPEAKING }

    private SecureStore store;
    private DbHelper db;
    private GeminiClient gemini;
    private VoiceManager voice;
    private CommandRouter router;
    private MessageAdapter adapter;

    private RecyclerView chatList;
    private EditText inputText;
    private ImageButton btnSend;
    private TextView statusText;
    private TextView attachInfo;
    private View orb;

    private ObjectAnimator pulse;
    private State state = State.IDLE;
    private boolean busy = false;
    private boolean lastWasVoice = false;

    private Uri pendingUri;
    private String pendingName;
    private String pendingMime;

    private final ActivityResultLauncher<String> micPermission =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) startListening();
                else toast("Microphone permission is needed for voice input.");
            });

    private final ActivityResultLauncher<String[]> picker =
            registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
                if (uri != null) onFilePicked(uri);
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        store = SecureStore.get(this);
        db = DbHelper.get(this);
        gemini = new GeminiClient(this);
        voice = new VoiceManager(this);
        router = new CommandRouter(this, db, store);

        chatList = findViewById(R.id.chatList);
        inputText = findViewById(R.id.inputText);
        btnSend = findViewById(R.id.btnSend);
        statusText = findViewById(R.id.statusText);
        attachInfo = findViewById(R.id.attachInfo);
        orb = findViewById(R.id.orbView);

        adapter = new MessageAdapter();
        LinearLayoutManager lm = new LinearLayoutManager(this);
        lm.setStackFromEnd(true);
        chatList.setLayoutManager(lm);
        chatList.setAdapter(adapter);

        btnSend.setOnClickListener(v -> send());
        findViewById(R.id.btnMic).setOnClickListener(v -> onMicClicked());
        findViewById(R.id.btnAttach).setOnClickListener(v ->
                picker.launch(new String[]{"text/*", "application/pdf", "image/*", "application/json"}));
        attachInfo.setOnClickListener(v -> clearAttachment());
        findViewById(R.id.btnNotes).setOnClickListener(v -> startActivity(new Intent(this, NotesActivity.class)));
        findViewById(R.id.btnHistory).setOnClickListener(v -> startActivity(new Intent(this, HistoryActivity.class)));
        findViewById(R.id.btnSettings).setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));

        setState(State.IDLE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!busy && state != State.SPEAKING && state != State.LISTENING) {
            reloadHistory();
            setState(State.IDLE);
        }
    }

    @Override
    protected void onStop() {
        voice.cancelListening();
        if (state == State.LISTENING) setState(State.IDLE);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (pulse != null) pulse.cancel();
        voice.destroy();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ chat

    private void reloadHistory() {
        List<Message> history = db.recentMessages(50);
        adapter.setAll(history);
        if (history.isEmpty()) {
            adapter.add(new Message(0, "model", "Good day, " + store.getUserTitle()
                    + ". JARVIS online. Ask me anything, or say \"help\" to see what I can do.", System.currentTimeMillis()));
        }
        scrollToEnd();
    }

    private void scrollToEnd() {
        if (adapter.getItemCount() > 0) chatList.scrollToPosition(adapter.getItemCount() - 1);
    }

    private void addMessage(String role, String text, boolean persist) {
        if (persist) db.addMessage(role, text);
        adapter.add(new Message(0, role, text, System.currentTimeMillis()));
        scrollToEnd();
    }

    private void send() {
        if (busy) return;
        String text = inputText.getText().toString().trim();
        if (text.isEmpty() && pendingUri == null) return;
        inputText.setText("");
        boolean spoken = lastWasVoice;
        lastWasVoice = false;

        if (pendingUri != null) {
            sendWithAttachment(text, spoken);
            return;
        }
        addMessage("user", text, true);
        boolean handled = router.tryHandle(text, reply -> deliver(reply, spoken, true));
        if (!handled) askAi(null, spoken);
    }

    private void sendWithAttachment(String text, boolean spoken) {
        String instruction = text.isEmpty() ? "Summarize this file and list the key points." : text;
        final Uri uri = pendingUri;
        final String name = pendingName;
        final String mime = pendingMime;
        clearAttachment();

        addMessage("user", "\uD83D\uDCCE " + name + "\n" + instruction, true);
        busy = true;
        setState(State.THINKING);
        new Thread(() -> {
            try {
                Attachment a = FileProcessor.load(getContentResolver(), uri, name, mime);
                runOnUiThread(() -> {
                    busy = false;
                    askAi(a, spoken);
                });
            } catch (IOException e) {
                runOnUiThread(() -> {
                    busy = false;
                    setState(State.IDLE);
                    addMessage("model", e.getMessage(), false);
                });
            }
        }).start();
    }

    private void askAi(Attachment att, boolean spoken) {
        if (store.getApiKey().isEmpty()) {
            setState(State.IDLE);
            addMessage("model", "I need a Gemini API key first. Open Settings and paste one (it's free at aistudio.google.com/apikey).", false);
            return;
        }
        busy = true;
        setState(State.THINKING);
        List<Message> history = db.recentMessages(20);
        gemini.generate(history, att, PromptBuilder.system(store, db), new GeminiClient.Callback() {
            @Override
            public void onSuccess(String reply) {
                busy = false;
                deliver(reply, spoken, true);
            }

            @Override
            public void onError(String message) {
                busy = false;
                setState(State.IDLE);
                addMessage("model", message, false);
            }
        });
    }

    /** Shows a reply and speaks it when the question was spoken or "speak every reply" is on. */
    private void deliver(String reply, boolean spoken, boolean persist) {
        addMessage("model", reply, persist);
        if (spoken || store.isAlwaysSpeak()) speak(reply);
        else setState(State.IDLE);
    }

    // ------------------------------------------------------------------ voice

    private void onMicClicked() {
        if (state == State.SPEAKING) {
            voice.stopSpeaking();
            setState(State.IDLE);
            return;
        }
        if (state == State.LISTENING) {
            voice.stopListening();
            return;
        }
        if (busy) return;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            micPermission.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        startListening();
    }

    private void startListening() {
        if (!voice.isRecognitionAvailable()) {
            toast("No speech recognition service found. Install or enable the Google app.");
            return;
        }
        lastWasVoice = true;
        setState(State.LISTENING);
        voice.startListening(store.getSttLang(), new VoiceManager.ListenListener() {
            @Override
            public void onPartial(String text) {
                inputText.setText(text);
            }

            @Override
            public void onResult(String text) {
                inputText.setText(text);
                setState(State.IDLE);
                send();
            }

            @Override
            public void onError(String message) {
                lastWasVoice = false;
                setState(State.IDLE);
                toast(message);
            }

            @Override
            public void onLevel(float rms) {
                if (state == State.LISTENING) {
                    float s = 1f + Math.min(0.4f, Math.max(0f, rms) / 25f);
                    orb.setScaleX(s);
                    orb.setScaleY(s);
                }
            }
        });
    }

    private void speak(String reply) {
        setState(State.SPEAKING);
        voice.speak(reply, store.getSpeechRate(), () -> {
            if (state == State.SPEAKING) setState(State.IDLE);
        });
    }

    // ------------------------------------------------------------------ attachments

    private void onFilePicked(Uri uri) {
        String name = queryName(uri);
        String mime = getContentResolver().getType(uri);
        if (!FileProcessor.isSupported(name, mime)) {
            toast("Unsupported file. Use a text file, PDF or image.");
            return;
        }
        pendingUri = uri;
        pendingName = name;
        pendingMime = mime;
        attachInfo.setText("\uD83D\uDCCE " + name + "  (tap to remove)");
        attachInfo.setVisibility(View.VISIBLE);
    }

    private void clearAttachment() {
        pendingUri = null;
        pendingName = null;
        pendingMime = null;
        attachInfo.setVisibility(View.GONE);
    }

    private String queryName(Uri uri) {
        String name = "file";
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0 && c.getString(i) != null) name = c.getString(i);
            }
        } catch (Exception ignored) {
            // keep the default name
        }
        return name;
    }

    // ------------------------------------------------------------------ status orb

    private void setState(State s) {
        state = s;
        if (pulse != null) {
            pulse.cancel();
            pulse = null;
        }
        orb.setScaleX(1f);
        orb.setScaleY(1f);
        orb.setAlpha(s == State.IDLE ? 0.7f : 1f);
        switch (s) {
            case IDLE:
                statusText.setText(store.getApiKey().isEmpty() ? "Add your Gemini API key in Settings" : "Online - ready");
                break;
            case LISTENING:
                statusText.setText("Listening...");
                break;
            case THINKING:
                statusText.setText("Thinking...");
                startPulse(1100);
                break;
            case SPEAKING:
                statusText.setText("Speaking...");
                startPulse(500);
                break;
        }
        btnSend.setEnabled(s != State.THINKING);
    }

    private void startPulse(long duration) {
        pulse = ObjectAnimator.ofPropertyValuesHolder(orb,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.18f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.18f));
        pulse.setDuration(duration);
        pulse.setRepeatCount(ObjectAnimator.INFINITE);
        pulse.setRepeatMode(ObjectAnimator.REVERSE);
        pulse.setInterpolator(new AccelerateDecelerateInterpolator());
        pulse.start();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
