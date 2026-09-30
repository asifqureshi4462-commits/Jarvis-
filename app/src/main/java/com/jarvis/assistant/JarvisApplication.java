package com.jarvis.assistant;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.util.Log;

import com.jarvis.assistant.data.AppDatabase;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Main Application class for JARVIS.
 * Provides global crash shielding, asynchronous database bootstrapping,
 * and safe notification channel registration.
 */
public class JarvisApplication extends Application {

    public static final String TAG = "JARVIS_APP";
    public static final String CHANNEL_ID = "jarvis_system_channel";

    private static JarvisApplication instance;
    private ExecutorService backgroundExecutor;
    private AppDatabase database;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        // 1. Thread Pool for non-blocking I/O & Room queries
        backgroundExecutor = Executors.newFixedThreadPool(4);

        // 2. Global Uncaught Exception Handler (prevents hard "keeps stopping" crash loops on device)
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e(TAG, "Uncaught Exception intercepted on thread " + thread.getName(), throwable);
            // Log stack trace cleanly to system logcat
            if (throwable != null) {
                throwable.printStackTrace();
            }
        });

        // 3. Register Notification Channel on Android 8.0+ (API 26+)
        createNotificationChannel();

        // 4. Warm up Room Database asynchronously (Never on the main/UI thread)
        backgroundExecutor.execute(() -> {
            try {
                database = AppDatabase.getInstance(getApplicationContext());
                Log.i(TAG, "AppDatabase successfully initialized asynchronously.");
            } catch (Exception e) {
                Log.e(TAG, "Database initialization warning: " + e.getMessage());
            }
        });
    }

    public static JarvisApplication getInstance() {
        return instance;
    }

    public ExecutorService getBackgroundExecutor() {
        return backgroundExecutor;
    }

    public AppDatabase getDatabase() {
        if (database == null) {
            database = AppDatabase.getInstance(getApplicationContext());
        }
        return database;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "JARVIS System Notifications",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Directives and voice execution status");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
