package com.jarvis.assistant.files;

import android.content.ContentResolver;
import android.net.Uri;
import android.util.Base64;

import com.jarvis.assistant.ai.Attachment;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Reads a file picked with the Storage Access Framework and prepares it for Gemini. */
public final class FileProcessor {
    private static final int MAX_TEXT_BYTES = 400 * 1024;
    private static final int MAX_BINARY_BYTES = 12 * 1024 * 1024;
    private static final int MAX_TEXT_CHARS = 100000;

    private FileProcessor() {}

    public static boolean isSupported(String name, String mime) {
        return isText(name, mime) || isPdf(name, mime) || isImage(mime);
    }

    private static boolean isText(String name, String mime) {
        if (mime != null && (mime.startsWith("text/") || mime.equals("application/json") || mime.equals("application/xml"))) {
            return true;
        }
        return name.toLowerCase(Locale.ROOT)
                .matches(".*\\.(txt|md|csv|json|xml|java|py|js|html|css|php|sql|log|c|cpp|h|yml|yaml|kt)$");
    }

    private static boolean isPdf(String name, String mime) {
        return "application/pdf".equals(mime) || name.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    private static boolean isImage(String mime) {
        return mime != null && mime.startsWith("image/");
    }

    public static Attachment load(ContentResolver cr, Uri uri, String name, String mime) throws IOException {
        boolean text = isText(name, mime);
        boolean pdf = isPdf(name, mime);
        boolean img = isImage(mime);
        if (!text && !pdf && !img) {
            throw new IOException("This file type isn't supported. Use a text file, PDF or image.");
        }
        byte[] data = readLimited(cr, uri, text ? MAX_TEXT_BYTES : MAX_BINARY_BYTES);

        Attachment a = new Attachment();
        a.name = name;
        if (text) {
            String s = new String(data, StandardCharsets.UTF_8);
            a.text = s.length() > MAX_TEXT_CHARS ? s.substring(0, MAX_TEXT_CHARS) : s;
        } else {
            a.mime = pdf ? "application/pdf" : mime;
            a.base64 = Base64.encodeToString(data, Base64.NO_WRAP);
        }
        return a;
    }

    private static byte[] readLimited(ContentResolver cr, Uri uri, int limit) throws IOException {
        try (InputStream in = cr.openInputStream(uri)) {
            if (in == null) throw new IOException("Could not open the file.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (out.size() > limit) {
                    throw new IOException("The file is too large (limit " + (limit / 1024) + " KB).");
                }
            }
            return out.toByteArray();
        }
    }
}
