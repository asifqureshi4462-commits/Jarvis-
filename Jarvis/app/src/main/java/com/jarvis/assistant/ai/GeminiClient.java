package com.jarvis.assistant.ai;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.jarvis.assistant.data.Message;
import com.jarvis.assistant.net.Http;
import com.jarvis.assistant.security.SecureStore;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Talks to the Gemini REST API directly from the phone (no backend). */
public class GeminiClient {
    public interface Callback {
        void onSuccess(String text);
        void onError(String message);
    }

    private static final String BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    private final Context ctx;
    private final SecureStore store;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    public GeminiClient(Context c) {
        ctx = c.getApplicationContext();
        store = SecureStore.get(ctx);
    }

    /** Runs in the background; the callback is always delivered on the main thread. */
    public void generate(List<Message> history, Attachment att, String system, Callback cb) {
        io.execute(() -> {
            String result = null;
            String error = null;
            try {
                result = run(history, att, system);
            } catch (AiException e) {
                error = e.getMessage();
            } catch (Exception e) {
                error = "Unexpected error (" + e.getClass().getSimpleName() + ").";
            }
            final String r = result;
            final String err = error;
            main.post(() -> {
                if (r != null) cb.onSuccess(r);
                else cb.onError(err);
            });
        });
    }

    private String run(List<Message> history, Attachment att, String system) throws AiException, JSONException {
        String key = store.getApiKey();
        if (key.isEmpty()) throw new AiException("No API key set. Add your Gemini key in Settings.", 0);
        if (!Http.isOnline(ctx)) throw new AiException("No internet connection.", 0);

        boolean search = store.isGrounding();
        try {
            return call(key, buildBody(history, att, system, search));
        } catch (AiException e) {
            // If Google Search grounding is the problem, retry once without it.
            boolean retry = search && ((e.code == 400 && !e.keyProblem) || e.code == 429 || e.code == 403);
            if (retry) return call(key, buildBody(history, att, system, false));
            throw e;
        }
    }

    private String buildBody(List<Message> history, Attachment att, String system, boolean search)
            throws AiException, JSONException {
        // Gemini needs alternating roles starting with "user": merge repeats, drop a leading model turn.
        List<String[]> turns = new ArrayList<>();
        for (Message m : history) {
            String role = m.isUser() ? "user" : "model";
            if (turns.isEmpty() && role.equals("model")) continue;
            if (!turns.isEmpty() && turns.get(turns.size() - 1)[0].equals(role)) {
                turns.get(turns.size() - 1)[1] += "\n" + m.text;
            } else {
                turns.add(new String[]{role, m.text});
            }
        }
        if (turns.isEmpty()) throw new AiException("Nothing to send.", 0);

        JSONArray contents = new JSONArray();
        for (int i = 0; i < turns.size(); i++) {
            String text = turns.get(i)[1];
            boolean last = i == turns.size() - 1;
            JSONArray parts = new JSONArray();
            if (last && att != null && att.text != null) {
                text += "\n\n--- Attached file: " + att.name + " ---\n" + att.text + "\n--- End of file ---";
            }
            parts.put(new JSONObject().put("text", text));
            if (last && att != null && att.base64 != null) {
                parts.put(new JSONObject().put("inlineData",
                        new JSONObject().put("mimeType", att.mime).put("data", att.base64)));
            }
            contents.put(new JSONObject().put("role", turns.get(i)[0]).put("parts", parts));
        }

        JSONObject body = new JSONObject();
        body.put("contents", contents);
        if (system != null && !system.isEmpty()) {
            body.put("systemInstruction", new JSONObject()
                    .put("parts", new JSONArray().put(new JSONObject().put("text", system))));
        }
        body.put("generationConfig", new JSONObject().put("temperature", 0.7));
        if (search) {
            body.put("tools", new JSONArray().put(new JSONObject().put("googleSearch", new JSONObject())));
        }
        return body.toString();
    }

    private String call(String key, String body) throws AiException {
        HttpURLConnection c = null;
        try {
            URL url = new URL(BASE + store.getModel() + ":generateContent");
            c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(90000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            // Key goes in a header, not the URL, so it does not end up in logs.
            c.setRequestProperty("x-goog-api-key", key);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            String resp = in == null ? "" : Http.readAll(in);
            if (code >= 400) throw mapError(code, resp);
            return parse(resp);
        } catch (AiException e) {
            throw e;
        } catch (UnknownHostException e) {
            throw new AiException("No internet connection.", 0);
        } catch (SocketTimeoutException e) {
            throw new AiException("The AI took too long to answer. Please try again.", 0);
        } catch (IOException | JSONException e) {
            throw new AiException("Network problem talking to the AI. Please try again.", 0);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private AiException mapError(int code, String body) {
        String msg = errorMessage(body);
        if (code == 400 && msg.toLowerCase().contains("api key")) {
            return new AiException("Invalid API key. Check it in Settings.", code, true);
        }
        if (code == 401 || code == 403) {
            return new AiException("The API key was rejected or lacks permission (" + code + "). Check it in Settings.", code, true);
        }
        if (code == 404) return new AiException("Model not found. Check the model name in Settings.", code);
        if (code == 429) return new AiException("Rate limit or quota reached. Wait a moment, or check your Gemini quota.", code);
        if (code >= 500) return new AiException("Gemini is having trouble right now (" + code + "). Try again shortly.", code);
        return new AiException("The AI request failed (" + code + "): " + msg, code);
    }

    private String errorMessage(String body) {
        try {
            return new JSONObject(body).getJSONObject("error").getString("message");
        } catch (Exception e) {
            return body.length() > 160 ? body.substring(0, 160) : body;
        }
    }

    private String parse(String resp) throws JSONException, AiException {
        JSONObject root = new JSONObject(resp);
        JSONArray cands = root.optJSONArray("candidates");
        if (cands == null || cands.length() == 0) {
            throw new AiException("The AI returned no answer (it may have been blocked by safety filters).", 200);
        }
        JSONObject content = cands.getJSONObject(0).optJSONObject("content");
        JSONArray parts = content == null ? null : content.optJSONArray("parts");
        StringBuilder sb = new StringBuilder();
        if (parts != null) {
            for (int i = 0; i < parts.length(); i++) sb.append(parts.getJSONObject(i).optString("text", ""));
        }
        String text = sb.toString().trim();
        if (text.isEmpty()) throw new AiException("The AI returned an empty answer. Try rephrasing.", 200);
        return text;
    }
}
