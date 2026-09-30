# Room
-keepclassmembers class * extends androidx.room.RoomDatabase {
    public static abstract ** createOpenHelper(androidx.sqlite.db.SupportSQLiteOpenHelper$Configuration);
}

# Gson
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
