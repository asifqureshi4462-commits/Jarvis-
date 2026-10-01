package com.jarvis.assistant.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Local SQLite storage: chat messages, notes, memory facts, command log. */
public class DbHelper extends SQLiteOpenHelper {
    public static final String T_MESSAGES = "messages";
    public static final String T_NOTES = "notes";
    public static final String T_MEMORY = "memory";
    public static final String T_COMMANDS = "commands";

    private static final String NAME = "jarvis.db";
    private static final int VERSION = 1;
    private static DbHelper instance;

    public static synchronized DbHelper get(Context c) {
        if (instance == null) instance = new DbHelper(c.getApplicationContext());
        return instance;
    }

    private DbHelper(Context c) {
        super(c, NAME, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, content TEXT NOT NULL, ts INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, ts INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE memory (id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT NOT NULL, ts INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE commands (id INTEGER PRIMARY KEY AUTOINCREMENT, input TEXT NOT NULL, result TEXT NOT NULL, ts INTEGER NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Version 1 only. Add migrations here when the schema changes.
    }

    private static String fmt(long ts) {
        return new SimpleDateFormat("dd MMM, HH:mm", Locale.getDefault()).format(new Date(ts));
    }

    private long insert(String table, ContentValues v) {
        v.put("ts", System.currentTimeMillis());
        return getWritableDatabase().insert(table, null, v);
    }

    // ---- chat messages ----
    public long addMessage(String role, String text) {
        ContentValues v = new ContentValues();
        v.put("role", role);
        v.put("content", text);
        return insert(T_MESSAGES, v);
    }

    public List<Message> recentMessages(int limit) {
        List<Message> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(T_MESSAGES, new String[]{"id", "role", "content", "ts"},
                null, null, null, null, "id DESC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                out.add(new Message(c.getLong(0), c.getString(1), c.getString(2), c.getLong(3)));
            }
        }
        Collections.reverse(out);
        return out;
    }

    public List<Row> chatRows(int limit) {
        List<Row> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(T_MESSAGES, new String[]{"id", "role", "content", "ts"},
                null, null, null, null, "id DESC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                String who = "user".equals(c.getString(1)) ? "You" : "JARVIS";
                out.add(new Row(c.getLong(0), who + ": " + c.getString(2) + "\n" + fmt(c.getLong(3))));
            }
        }
        return out;
    }

    // ---- notes ----
    public long addNote(String body) {
        ContentValues v = new ContentValues();
        v.put("body", body);
        return insert(T_NOTES, v);
    }

    public List<Row> notes(int limit) {
        return rows(T_NOTES, "body", limit);
    }

    // ---- memory facts ----
    public long addFact(String fact) {
        ContentValues v = new ContentValues();
        v.put("fact", fact);
        return insert(T_MEMORY, v);
    }

    public List<Row> facts(int limit) {
        return rows(T_MEMORY, "fact", limit);
    }

    // ---- command log ----
    public long addCommand(String input, String result) {
        ContentValues v = new ContentValues();
        v.put("input", input);
        v.put("result", result);
        return insert(T_COMMANDS, v);
    }

    public List<Row> commands(int limit) {
        List<Row> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(T_COMMANDS, new String[]{"id", "input", "result", "ts"},
                null, null, null, null, "id DESC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                out.add(new Row(c.getLong(0), c.getString(1) + "\n-> " + c.getString(2) + "\n" + fmt(c.getLong(3))));
            }
        }
        return out;
    }

    // ---- generic helpers ----
    private List<Row> rows(String table, String col, int limit) {
        List<Row> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(table, new String[]{"id", col, "ts"},
                null, null, null, null, "id DESC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                out.add(new Row(c.getLong(0), c.getString(1) + "\n" + fmt(c.getLong(2))));
            }
        }
        return out;
    }

    /** Plain texts (no dates) of the newest rows. Only called with the constants above. */
    public List<String> texts(String table, String col, int limit) {
        List<String> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(table, new String[]{col},
                null, null, null, null, "id DESC", String.valueOf(limit))) {
            while (c.moveToNext()) out.add(c.getString(0));
        }
        return out;
    }

    public void delete(String table, long id) {
        getWritableDatabase().delete(table, "id=?", new String[]{String.valueOf(id)});
    }

    public void clear(String table) {
        getWritableDatabase().delete(table, null, null);
    }
}
