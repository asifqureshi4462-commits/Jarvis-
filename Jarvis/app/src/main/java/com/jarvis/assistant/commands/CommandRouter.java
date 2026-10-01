package com.jarvis.assistant.commands;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.AlarmClock;
import android.provider.Settings;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.jarvis.assistant.data.DbHelper;
import com.jarvis.assistant.net.Http;
import com.jarvis.assistant.security.SecureStore;
import com.jarvis.assistant.ui.NotesActivity;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Detects device commands in what the user said and runs them locally.
 * Only the user's own typed/spoken text can trigger a command - never the AI's replies or file contents.
 * tryHandle() returns false when the text is not a command, so it goes to the AI instead.
 */
public class CommandRouter {
    public interface Callback {
        void onReply(String reply);
    }

    private static final int F = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final String UNIT = "(seconds?|secs?|minutes?|mins?|hours?|hrs?|ghante|ghanta)";

    private static final Pattern HELP = Pattern.compile("^(?:help|what can you do|commands|kya kar sakte ho)$", F);
    private static final Pattern TIME = Pattern.compile(
            "^(?:what(?:'s| is) the (?:time|date|day)(?: now| today)?|what time is it|time|date|kitne baje hain?|aaj kya tarikh hai)$", F);
    private static final Pattern SHOW_NOTES = Pattern.compile("^(?:open|show|see|list|dikhao)\\s+(?:my |all |saved )?notes?$", F);
    private static final Pattern READ_NOTES = Pattern.compile("^(?:read|padho)\\s+(?:my |all |saved )?notes?$", F);
    private static final Pattern ADD_NOTE = Pattern.compile(
            "^(?:(?:create|add|save|make|take|write)(?: a| new)? note|note kar(?:o| lo)?|note likho|note down|note)(?: that| saying|:|-)?\\s+(.+)$", F);
    private static final Pattern REMEMBER = Pattern.compile("^(?:remember|yaad rakho|yaad rakhna|yaad rakh)(?: that| ki)?\\s+(.+)$", F);
    private static final Pattern RECALL = Pattern.compile(
            "^(?:what do you (?:remember|know) about me|what do you remember|tumhe kya yaad hai)$", F);
    private static final Pattern REMIND_IN = Pattern.compile(
            "^(?:remind me|reminder)\\s+in\\s+(\\d{1,5})\\s*" + UNIT + "\\s*(?:to|that|for)?\\s*(.*)$", F);
    private static final Pattern TIMER_A = Pattern.compile("\\btimer\\b.*?(\\d{1,5})\\s*" + UNIT, F);
    private static final Pattern TIMER_B = Pattern.compile("(\\d{1,5})\\s*" + UNIT + "\\s*(?:ka\\s*)?timer", F);
    private static final Pattern ALARM_START = Pattern.compile(
            "^(?:set (?:an? )?(?:alarm|reminder)|alarm|reminder|remind me|wake me(?: up)?|alarm laga(?:o| do)?|reminder laga(?:o| do)?)\\b(.*)$", F);
    private static final Pattern TIME_TOKEN = Pattern.compile(
            "(?:\\bat\\s+)?\\b(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?(\\s*baje)?\\b", F);
    private static final Pattern WEATHER_A = Pattern.compile(
            "^(?:(?:what(?:'s| is)|how(?:'s| is)|tell me|show me|check|get)(?: me)?(?: the)? |current |today'?s? )*"
                    + "(?:weather|temperature|mausam)(?: like)?(?:\\s+(?:in|of|at|for)\\s+(.+?))?(?:\\s+(?:today|now|outside|aaj|abhi|right now))?$", F);
    private static final Pattern WEATHER_B = Pattern.compile(
            "^(.+?)\\s+(?:ka|ki|me|mein)\\s+(?:mausam|weather|temperature)(?:\\s+(?:kaisa hai|batao|kya hai))?$", F);
    private static final Pattern WEATHER_C = Pattern.compile("^(?:aaj (?:ka )?|abhi (?:ka )?)?mausam(?:\\s+(?:kaisa hai|batao|kya hai))?$", F);
    private static final Pattern SEARCH = Pattern.compile(
            "^(?:search(?: the web)?(?: for)?|web search|google|look up|dhundo|search karo)\\s+(.+)$", F);
    private static final Pattern CALL = Pattern.compile("^(?:call|dial|phone)\\s+(\\+?\\d[\\d\\s-]{4,})$", F);
    private static final Pattern OPEN_URL = Pattern.compile("^(?:open|go to|visit)\\s+((?:https?://)?(?:[\\w-]+\\.)+[a-z]{2,}(?:/\\S*)?)$", F);
    private static final Pattern OPEN1 = Pattern.compile("^(?:open|launch|kholo|khol|start)\\s+(?:the |my )?(.+)$", F);
    private static final Pattern OPEN2 = Pattern.compile("^(.+?)\\s+(?:kholo|khol do|khol de|open karo|chalu karo|start karo)$", F);
    private static final Pattern SETTINGS_TARGET = Pattern.compile("^(.*?)\\s*settings?$", F);
    private static final Pattern PERCENT_OF = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:percent|%)\\s*of\\s*", F);

    private static final String HELP_TEXT = "Here's what I can do:\n"
            + "- open <app>, or open wifi settings\n"
            + "- note <text>, read my notes, open notes\n"
            + "- remember that <fact>, what do you remember\n"
            + "- set alarm at 6:30 am, remind me at 5 pm to call Riya\n"
            + "- timer for 10 minutes\n"
            + "- calculate 12*(3+4), or 20 percent of 150\n"
            + "- weather in Delhi\n"
            + "- search <topic> (opens your browser)\n"
            + "- call <number> (opens the dialer after you confirm)\n"
            + "- open example.com\n"
            + "Anything else goes to the AI: news, coding help, explanations. Use the paperclip to send it a file.";

    private final Activity activity;
    private final DbHelper db;
    private final SecureStore store;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    public CommandRouter(Activity activity, DbHelper db, SecureStore store) {
        this.activity = activity;
        this.db = db;
        this.store = store;
    }

    private boolean done(String raw, String reply, Callback cb) {
        db.addCommand(raw, reply);
        cb.onReply(reply);
        return true;
    }

    public boolean tryHandle(String raw, Callback cb) {
        String cmd = raw.trim()
                .replaceAll("(?i)^(?:hey |ok |okay )?jarvis[,:!]?\\s*", "")
                .replaceAll("[.!?\\s]+$", "")
                .trim();
        if (cmd.isEmpty()) return false;
        Matcher m;

        if (HELP.matcher(cmd).matches()) return done(raw, HELP_TEXT, cb);
        if (TIME.matcher(cmd).matches()) return done(raw, timeReply(cmd), cb);

        // ---- notes & memory ----
        if (SHOW_NOTES.matcher(cmd).matches()) {
            activity.startActivity(new Intent(activity, NotesActivity.class));
            return done(raw, "Opening your notes.", cb);
        }
        if (READ_NOTES.matcher(cmd).matches()) return done(raw, readNotes(), cb);
        if ((m = ADD_NOTE.matcher(cmd)).matches()) {
            String body = clip(m.group(1).trim(), 2000);
            db.addNote(body);
            return done(raw, "Note saved: " + body, cb);
        }
        if ((m = REMEMBER.matcher(cmd)).matches()) {
            String fact = clip(m.group(1).trim(), 500);
            db.addFact(fact);
            return done(raw, "Understood. I'll remember that: " + fact, cb);
        }
        if (RECALL.matcher(cmd).matches()) return done(raw, recallFacts(), cb);

        // ---- timers, alarms, reminders ----
        if ((m = REMIND_IN.matcher(cmd)).matches()) {
            return startTimer(raw, Integer.parseInt(m.group(1)), m.group(2), m.group(3), cb);
        }
        Matcher t = TIMER_A.matcher(cmd);
        if (t.find() || (t = TIMER_B.matcher(cmd)).find()) {
            return startTimer(raw, Integer.parseInt(t.group(1)), t.group(2), "", cb);
        }
        if ((m = ALARM_START.matcher(cmd)).matches()) return startAlarm(raw, m.group(1), cb);

        // ---- calculator ----
        String calc = calcExpression(cmd);
        if (calc != null) {
            try {
                return done(raw, calc + " = " + Calculator.format(Calculator.eval(calc)), cb);
            } catch (ArithmeticException | IllegalArgumentException e) {
                return done(raw, "I couldn't calculate that: " + e.getMessage() + ".", cb);
            }
        }

        // ---- weather ----
        String city = null;
        boolean weather = false;
        if ((m = WEATHER_A.matcher(cmd)).matches()) { weather = true; city = m.group(1); }
        else if ((m = WEATHER_B.matcher(cmd)).matches()) { weather = true; city = m.group(1); }
        else if (WEATHER_C.matcher(cmd).matches()) { weather = true; }
        if (weather) return startWeather(raw, city, cb);

        // ---- web / phone ----
        if ((m = SEARCH.matcher(cmd)).matches()) {
            String q = m.group(1).replaceAll("(?i)\\s+on google$", "").trim();
            if (viewUrl("https://www.google.com/search?q=" + Uri.encode(q))) {
                return done(raw, "Searching the web for \"" + q + "\".", cb);
            }
            return done(raw, "I couldn't open a browser on this phone.", cb);
        }
        if ((m = CALL.matcher(cmd)).matches()) return confirmCall(raw, m.group(1), cb);
        if ((m = OPEN_URL.matcher(cmd)).matches()) {
            String url = m.group(1);
            if (!url.toLowerCase(Locale.ROOT).startsWith("http")) url = "https://" + url;
            if (viewUrl(url)) return done(raw, "Opening " + url, cb);
            return done(raw, "I couldn't open a browser on this phone.", cb);
        }

        // ---- open app / settings ----
        String target = null;
        if ((m = OPEN1.matcher(cmd)).matches()) target = m.group(1);
        else if ((m = OPEN2.matcher(cmd)).matches()) target = m.group(1);
        if (target != null) {
            String reply = openTarget(target.trim());
            if (reply != null) return done(raw, reply, cb);
            if (target.trim().split("\\s+").length > 3) return false; // probably a normal sentence for the AI
            return done(raw, "I couldn't find an app or setting called \"" + target.trim() + "\".", cb);
        }
        return false;
    }

    // ------------------------------------------------------------------ helpers

    private static String clip(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private String timeReply(String cmd) {
        String l = cmd.toLowerCase(Locale.ROOT);
        if (l.contains("date") || l.contains("day") || l.contains("tarikh")) {
            return "Today is " + new SimpleDateFormat("EEEE, d MMMM yyyy", Locale.ENGLISH).format(new Date()) + ".";
        }
        return "It's " + new SimpleDateFormat("h:mm a", Locale.ENGLISH).format(new Date()) + ".";
    }

    private String readNotes() {
        List<String> notes = db.texts(DbHelper.T_NOTES, "body", 5);
        if (notes.isEmpty()) return "You have no saved notes. Say \"note\" followed by what to write.";
        StringBuilder sb = new StringBuilder("Your latest notes:");
        int i = 1;
        for (String n : notes) sb.append("\n").append(i++).append(". ").append(n);
        return sb.toString();
    }

    private String recallFacts() {
        List<String> facts = db.texts(DbHelper.T_MEMORY, "fact", 10);
        if (facts.isEmpty()) return "I haven't saved anything yet. Say \"remember that ...\" to teach me.";
        StringBuilder sb = new StringBuilder("Here's what I remember:");
        for (String f : facts) sb.append("\n- ").append(f);
        return sb.toString();
    }

    // ---- timers & alarms (opens the system Clock app so the user confirms there) ----

    private static int unitSeconds(String unit) {
        String u = unit.toLowerCase(Locale.ROOT);
        if (u.startsWith("s")) return 1;
        if (u.startsWith("m")) return 60;
        return 3600; // hours / ghante
    }

    private boolean startTimer(String raw, int n, String unit, String msg, Callback cb) {
        long secs = (long) n * unitSeconds(unit);
        if (secs < 1 || secs > 86400) return done(raw, "Timers must be between 1 second and 24 hours.", cb);
        String label = msg == null || msg.trim().isEmpty() ? "JARVIS timer" : msg.trim();
        Intent i = new Intent(AlarmClock.ACTION_SET_TIMER)
                .putExtra(AlarmClock.EXTRA_LENGTH, (int) secs)
                .putExtra(AlarmClock.EXTRA_MESSAGE, label)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        try {
            activity.startActivity(i);
            return done(raw, "Opening the clock app for a " + n + " " + unit + " timer.", cb);
        } catch (ActivityNotFoundException e) {
            return done(raw, "No clock app on this phone can set timers.", cb);
        }
    }

    private boolean startAlarm(String raw, String rest, Callback cb) {
        int h = -1, mi = 0, s = -1, e = -1;
        boolean explicit = false;
        Matcher t = TIME_TOKEN.matcher(rest);
        while (t.find()) {
            boolean hasAt = t.group(0).toLowerCase(Locale.ROOT).startsWith("at");
            if (t.group(2) == null && t.group(3) == null && t.group(4) == null && !hasAt) continue;
            int hh = Integer.parseInt(t.group(1));
            int mm = t.group(2) != null ? Integer.parseInt(t.group(2)) : 0;
            String ap = t.group(3);
            if (ap != null) {
                ap = ap.toLowerCase(Locale.ROOT).replace(".", "");
                if (ap.equals("pm") && hh < 12) hh += 12;
                if (ap.equals("am") && hh == 12) hh = 0;
                explicit = true;
            }
            if (hh > 23 || mm > 59) continue;
            h = hh; mi = mm; s = t.start(); e = t.end();
            break;
        }
        if (h < 0) {
            return done(raw, "What time? For example: \"set alarm at 6:30 am\" or \"remind me at 5 pm to call Riya\".", cb);
        }
        String msg = (rest.substring(0, s) + " " + rest.substring(e)).trim()
                .replaceFirst("(?i)^(?:(?:to|that|for)\\s+)+", "")
                .replaceFirst("(?i)(?:\\s+(?:to|for|at|on))+$", "")
                .trim();
        if (msg.isEmpty()) msg = "JARVIS alarm";
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, h)
                .putExtra(AlarmClock.EXTRA_MINUTES, mi)
                .putExtra(AlarmClock.EXTRA_MESSAGE, msg)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, false);
        try {
            activity.startActivity(i);
            String when = String.format(Locale.US, "%02d:%02d", h, mi);
            return done(raw, "Opening the clock app with an alarm for " + when + " (" + msg + "). Confirm it there."
                    + (explicit ? "" : " I read that as 24-hour time; add am or pm to be specific."), cb);
        } catch (ActivityNotFoundException ex) {
            return done(raw, "No clock app on this phone can set alarms.", cb);
        }
    }

    // ---- calculator ----

    private String calcExpression(String cmd) {
        String e = cmd.toLowerCase(Locale.ROOT);
        String stripped = e.replaceFirst("^(?:calculate|calc|compute|solve|what(?:'s| is)|kitna hota hai)\\s+", "");
        boolean prefixed = !stripped.equals(e);
        e = stripped.replace(",", "");
        e = PERCENT_OF.matcher(e).replaceAll("($1/100)*");
        e = e.replaceAll("\\bplus\\b", "+")
                .replaceAll("\\bminus\\b", "-")
                .replaceAll("\\b(?:times|multiplied by|into)\\b", "*")
                .replaceAll("\\b(?:divided by|over)\\b", "/")
                .replaceAll("\\bto the power of\\b", "^")
                .replace("\u00D7", "*").replace("\u00F7", "/")
                .replaceAll("(?<=[\\d)])\\s*x\\s*(?=[\\d(])", "*")
                .replace("**", "^")
                .trim();
        if (!e.matches("[0-9+\\-*/^().\\s]+")) return null;
        if (!e.matches(".*\\d.*")) return null;
        if (!prefixed && !e.matches(".*[+*/^].*")) return null; // avoid treating "555-1234" as math
        return e;
    }

    // ---- weather (background thread) ----

    private boolean startWeather(String raw, String cityIn, Callback cb) {
        String city = cityIn == null ? "" : cityIn.trim();
        if (city.isEmpty()) city = store.getHomeCity();
        if (city.isEmpty()) {
            return done(raw, "Which city? Say \"weather in Delhi\", or set a home city in Settings.", cb);
        }
        if (!Http.isOnline(activity)) return done(raw, "No internet connection.", cb);
        final String c = city;
        io.execute(() -> {
            String r;
            try {
                r = WeatherService.fetch(c);
            } catch (Exception ex) {
                r = "I couldn't get the weather right now. Check your connection and try again.";
            }
            final String reply = r;
            main.post(() -> done(raw, reply, cb));
        });
        return true;
    }

    // ---- web / phone ----

    private boolean viewUrl(String url) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }

    /** Sensitive: asks for confirmation, then only opens the dialer (the user still presses call). */
    private boolean confirmCall(String raw, String numberIn, Callback cb) {
        final String number = numberIn.replaceAll("[^0-9+]", "");
        new MaterialAlertDialogBuilder(activity)
                .setTitle("Open the dialer?")
                .setMessage(number)
                .setPositiveButton("Open dialer", (d, w) -> {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number))));
                    } catch (ActivityNotFoundException ex) {
                        cb.onReply("No dialer app found on this phone.");
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
        return done(raw, "Waiting for your confirmation to open the dialer for " + number + ".", cb);
    }

    // ---- open apps & settings ----

    /** Returns a reply, or null when nothing matched. */
    private String openTarget(String targetIn) {
        String target = targetIn.replaceAll("(?i)\\s+(?:app|application)$", "").trim();
        Matcher sm = SETTINGS_TARGET.matcher(target);
        if (sm.matches()) {
            String action = settingsAction(sm.group(1).trim().toLowerCase(Locale.ROOT));
            try {
                activity.startActivity(new Intent(action));
                return "Opening " + (sm.group(1).trim().isEmpty() ? "Android" : sm.group(1).trim()) + " settings.";
            } catch (ActivityNotFoundException e) {
                return "That settings screen isn't available on this phone.";
            }
        }
        return openApp(target);
    }

    private String settingsAction(String key) {
        switch (key) {
            case "wifi": case "wi-fi": case "wi fi": case "internet": return Settings.ACTION_WIFI_SETTINGS;
            case "bluetooth": return Settings.ACTION_BLUETOOTH_SETTINGS;
            case "display": case "screen": case "brightness": return Settings.ACTION_DISPLAY_SETTINGS;
            case "sound": case "volume": case "audio": return Settings.ACTION_SOUND_SETTINGS;
            case "battery": return Settings.ACTION_BATTERY_SAVER_SETTINGS;
            case "location": case "gps": return Settings.ACTION_LOCATION_SOURCE_SETTINGS;
            case "airplane": case "flight": return Settings.ACTION_AIRPLANE_MODE_SETTINGS;
            case "app": case "apps": case "application": return Settings.ACTION_APPLICATION_SETTINGS;
            case "language": return Settings.ACTION_LOCALE_SETTINGS;
            case "storage": return Settings.ACTION_INTERNAL_STORAGE_SETTINGS;
            case "nfc": return Settings.ACTION_NFC_SETTINGS;
            case "date": case "time": case "date and time": return Settings.ACTION_DATE_SETTINGS;
            case "accessibility": return Settings.ACTION_ACCESSIBILITY_SETTINGS;
            default: return Settings.ACTION_SETTINGS;
        }
    }

    private String openApp(String name) {
        PackageManager pm = activity.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
        String want = name.toLowerCase(Locale.ROOT);
        String bestPkg = null;
        String bestLabel = null;
        int best = 0;
        for (ResolveInfo ri : apps) {
            String label = ri.loadLabel(pm).toString();
            String l = label.toLowerCase(Locale.ROOT);
            int score = l.equals(want) ? 3 : l.startsWith(want) ? 2 : l.contains(want) ? 1 : 0;
            if (score > best) {
                best = score;
                bestPkg = ri.activityInfo.packageName;
                bestLabel = label;
            }
        }
        if (bestPkg == null) return null;
        Intent launch = pm.getLaunchIntentForPackage(bestPkg);
        if (launch == null) return null;
        try {
            activity.startActivity(launch);
            return "Opening " + bestLabel + ".";
        } catch (ActivityNotFoundException e) {
            return "I couldn't open " + bestLabel + ".";
        }
    }
}
