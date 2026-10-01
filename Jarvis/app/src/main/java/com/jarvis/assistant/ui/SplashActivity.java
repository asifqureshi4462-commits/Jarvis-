package com.jarvis.assistant.ui;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;

import androidx.appcompat.app.AppCompatActivity;

import com.jarvis.assistant.R;

public class SplashActivity extends AppCompatActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable goMain = () -> {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);
        View orb = findViewById(R.id.splashOrb);
        orb.setAlpha(0f);
        orb.setScaleX(0.6f);
        orb.setScaleY(0.6f);
        orb.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(900).start();
        handler.postDelayed(goMain, 1400);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(goMain);
        super.onDestroy();
    }
}
