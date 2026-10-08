package com.myapp.urldetector;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.concurrent.ConcurrentHashMap;

/**
 * OverlayManager
 *
 * Displays a full-screen native Android overlay alert immediately when an insecure HTTP
 * URL is detected. Provides detailed security explanations and enforces a 20-second snooze
 * interval upon dismissal.
 * Written purely in Java.
 */
public class OverlayManager {

    // Stay on screen for at least 4 seconds before auto-dismissing
    private static final long AUTO_DISMISS_DELAY_MS = 4000;

    // 3 seconds snooze interval after user dismisses an alert (3,000 ms)
    public static final long SNOOZE_INTERVAL_MS = 3 * 1000;

    private static OverlayManager instance;

    private final Context context;
    private final WindowManager windowManager;
    private final Handler mainHandler;

    private View currentOverlayView;
    private boolean isOverlayShowing = false;
    private long overlayShownTimestamp = 0;
    private String currentlyDisplayedUrl = "";

    // Snoozed URLs and global snooze timestamp
    private final ConcurrentHashMap<String, Long> snoozedUrls = new ConcurrentHashMap<>();
    private long globalSnoozeUntil = 0;

    private final Runnable autoDismissRunnable = new Runnable() {
        @Override
        public void run() {
            dismissOverlayInternal(true);
        }
    };

    private OverlayManager(Context context) {
        this.context = context.getApplicationContext();
        this.windowManager = (WindowManager) this.context.getSystemService(Context.WINDOW_SERVICE);
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public static synchronized OverlayManager getInstance(Context context) {
        if (instance == null) {
            instance = new OverlayManager(context);
        }
        return instance;
    }

    /**
     * Checks if a URL or alert is currently snoozed (e.g. user clicked close within 3 seconds).
     */
    public boolean isSnoozed(String url) {
        long now = System.currentTimeMillis();

        // Check if an overlay is currently actively showing
        if (isOverlayShowing) {
            return true;
        }

        // Check global snooze
        if (now < globalSnoozeUntil) {
            return true;
        }

        // Check URL-specific snooze
        if (!TextUtils.isEmpty(url) && snoozedUrls.containsKey(url)) {
            Long snoozedTime = snoozedUrls.get(url);
            if (snoozedTime != null && (now - snoozedTime < SNOOZE_INTERVAL_MS)) {
                return true;
            } else {
                snoozedUrls.remove(url);
            }
        }

        return false;
    }

    /**
     * Snoozes future alerts for the specified URL for 3 seconds.
     */
    public void snooze(String url) {
        long now = System.currentTimeMillis();
        globalSnoozeUntil = now + SNOOZE_INTERVAL_MS;
        if (!TextUtils.isEmpty(url)) {
            snoozedUrls.put(url, now);
        }
    }

    /**
     * Displays a full-screen native overlay alert for the detected insecure HTTP URL.
     */
    public void showOverlay(final String url) {
        showCustomOverlay(
            "Warning: HTTP Connection is NOT Secure",
            "This website uses an unencrypted HTTP connection. Any passwords, bank details, credit card numbers, or personal messages entered on this site are transmitted in plain text and can be easily intercepted, viewed, or stolen by attackers on your network.",
            "INSECURE URL:",
            url
        );
    }

    public void showCustomOverlay(final String title, final String explanation, final String label, final String content) {
        if (TextUtils.isEmpty(content)) {
            return;
        }

        // Do not display if currently snoozed
        if (isSnoozed(content)) {
            return;
        }

        // Verify overlay capability before attempting WindowManager operations
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            return;
        }

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    displayFullScreenOverlay(title, explanation, label, content);
                } catch (Exception ignored) {
                    // Safe guard: Never crash host application
                }
            }
        });
    }

    private void displayFullScreenOverlay(final String title, final String explanation, final String label, final String content) {
        long now = System.currentTimeMillis();

        if (isSnoozed(content)) {
            return;
        }

        // If an overlay is already present, safely remove it first synchronously before adding new one
        if (currentOverlayView != null) {
            try {
                mainHandler.removeCallbacks(autoDismissRunnable);
                windowManager.removeView(currentOverlayView);
            } catch (Exception ignored) {
            }
            currentOverlayView = null;
            isOverlayShowing = false;
        }

        currentlyDisplayedUrl = content;

        float density = context.getResources().getDisplayMetrics().density;
        int p20 = (int) (20 * density);
        int p16 = (int) (16 * density);
        int p12 = (int) (12 * density);
        int p8 = (int) (8 * density);
        int p4 = (int) (4 * density);

        // 1. Full Screen Root Layout with dark backdrop
        final FrameLayout fullScreenBackdrop = new FrameLayout(context);
        fullScreenBackdrop.setBackgroundColor(Color.parseColor("#CC0B1120")); // 80% opacity dark slate
        fullScreenBackdrop.setClickable(true);
        fullScreenBackdrop.setFocusable(true);

        // 2. Centered Alert Card Container
        LinearLayout alertCard = new LinearLayout(context);
        alertCard.setOrientation(LinearLayout.VERTICAL);
        alertCard.setPadding(p20, p20, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * density);
        cardBg.setStroke((int) (2 * density), Color.parseColor("#EF4444")); // Red warning border
        alertCard.setBackground(cardBg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            alertCard.setElevation(16 * density);
        }

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (context.getResources().getDisplayMetrics().widthPixels * 0.90),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        alertCard.setLayoutParams(cardParams);

        // ─── Header: Badge & Close Button ────────────────────────
        LinearLayout headerRow = new LinearLayout(context);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.bottomMargin = p12;
        headerRow.setLayoutParams(headerParams);

        // Security Badge Pill (Insecure HTTP)
        LinearLayout badgePill = new LinearLayout(context);
        badgePill.setOrientation(LinearLayout.HORIZONTAL);
        badgePill.setPadding(p12, p4, p12, p4);
        badgePill.setGravity(Gravity.CENTER_VERTICAL);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setCornerRadius(999 * density);
        badgeBg.setColor(Color.parseColor("#FEF2F2"));
        badgeBg.setStroke((int) (1 * density), Color.parseColor("#FECACA"));
        badgePill.setBackground(badgeBg);

        TextView badgeText = new TextView(context);
        if (title != null && (title.contains("Fraud") || title.contains("Scam") || title.contains("AI"))) {
            badgeText.setText("🚨 AI FRAUD SHIELD DETECTED");
        } else {
            badgeText.setText("⚠️ INSECURE HTTP DETECTED");
        }
        badgeText.setTextColor(Color.parseColor("#DC2626"));
        badgeText.setTextSize(12);
        badgeText.setTypeface(Typeface.DEFAULT_BOLD);
        badgePill.addView(badgeText);

        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        badgeParams.weight = 1.0f;
        badgePill.setLayoutParams(badgeParams);
        headerRow.addView(badgePill);

        // Close '✕' Button (Triggers 3-second snooze)
        TextView closeBtn = new TextView(context);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748B"));
        closeBtn.setTextSize(18);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(p8, p4, p8, p4);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Snooze for 3 seconds on close click
                snooze(currentlyDisplayedUrl);
                dismissOverlay();
            }
        });
        headerRow.addView(closeBtn);

        alertCard.addView(headerRow);

        // ─── Main Title ───────────────────────────────────────────
        TextView titleView = new TextView(context);
        titleView.setText(title);
        titleView.setTextColor(Color.parseColor("#DC2626"));
        titleView.setTextSize(17);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.bottomMargin = p8;
        titleView.setLayoutParams(titleParams);
        alertCard.addView(titleView);

        // ─── Detailed Security Explanation ────────────────────────
        TextView explanationView = new TextView(context);
        explanationView.setText(explanation);
        explanationView.setTextColor(Color.parseColor("#991B1B")); // Deep warning red
        explanationView.setTextSize(13);
        explanationView.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams expParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        expParams.bottomMargin = p16;
        explanationView.setLayoutParams(expParams);
        alertCard.addView(explanationView);

        // ─── Detected URL Box ─────────────────────────────────────
        LinearLayout urlBox = new LinearLayout(context);
        urlBox.setOrientation(LinearLayout.VERTICAL);
        urlBox.setPadding(p12, p8, p12, p8);

        GradientDrawable urlBoxBg = new GradientDrawable();
        urlBoxBg.setColor(Color.parseColor("#FEF2F2"));
        urlBoxBg.setCornerRadius(8 * density);
        urlBoxBg.setStroke((int) (1 * density), Color.parseColor("#FECACA"));
        urlBox.setBackground(urlBoxBg);

        TextView urlLabel = new TextView(context);
        urlLabel.setText(label);
        urlLabel.setTextColor(Color.parseColor("#DC2626"));
        urlLabel.setTextSize(10);
        urlLabel.setTypeface(Typeface.DEFAULT_BOLD);
        urlBox.addView(urlLabel);

        TextView urlContent = new TextView(context);
        urlContent.setText(content);
        urlContent.setTextColor(Color.parseColor("#991B1B"));
        urlContent.setTextSize(13);
        urlContent.setTypeface(Typeface.MONOSPACE);
        urlContent.setEllipsize(TextUtils.TruncateAt.END);
        urlContent.setMaxLines(3);
        urlBox.addView(urlContent);

        LinearLayout.LayoutParams urlBoxParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        urlBoxParams.bottomMargin = p16;
        urlBox.setLayoutParams(urlBoxParams);
        alertCard.addView(urlBox);

        // ─── Action Button ("I Understand the Risk") ─────────────
        TextView actionBtn = new TextView(context);
        actionBtn.setText("I Understand the Risk");
        actionBtn.setTextColor(Color.parseColor("#FFFFFF"));
        actionBtn.setTextSize(14);
        actionBtn.setTypeface(Typeface.DEFAULT_BOLD);
        actionBtn.setGravity(Gravity.CENTER);
        actionBtn.setPadding(p16, p12, p16, p12);

        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#DC2626"));
        btnBg.setCornerRadius(10 * density);
        actionBtn.setBackground(btnBg);

        actionBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Snooze for 3 seconds on button click
                snooze(currentlyDisplayedUrl);
                dismissOverlay();
            }
        });

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        actionBtn.setLayoutParams(btnParams);
        alertCard.addView(actionBtn);

        // Snooze indicator note (3 seconds)
        TextView snoozeNote = new TextView(context);
        snoozeNote.setText("Dismissing will snooze alerts for 3 seconds");
        snoozeNote.setTextColor(Color.parseColor("#94A3B8"));
        snoozeNote.setTextSize(11);
        snoozeNote.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        noteParams.topMargin = p8;
        snoozeNote.setLayoutParams(noteParams);
        alertCard.addView(snoozeNote);

        fullScreenBackdrop.addView(alertCard);

        // ─── Full-Screen WindowManager LayoutParams ───────────────
        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_FULLSCREEN,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.CENTER;

        try {
            windowManager.addView(fullScreenBackdrop, params);
            currentOverlayView = fullScreenBackdrop;
            isOverlayShowing = true;
            overlayShownTimestamp = now;

            // Stay for at least AUTO_DISMISS_DELAY_MS (4 seconds) before auto-dismissing
            mainHandler.postDelayed(autoDismissRunnable, AUTO_DISMISS_DELAY_MS);
        } catch (Exception e) {
            currentOverlayView = null;
            isOverlayShowing = false;
        }
    }

    /**
     * Dismisses the current full-screen overlay if showing.
     */
    public void dismissOverlay() {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                dismissOverlayInternal(false);
            }
        });
    }

    private void dismissOverlayInternal(boolean fromAutoDismiss) {
        try {
            mainHandler.removeCallbacks(autoDismissRunnable);
            if (fromAutoDismiss && !TextUtils.isEmpty(currentlyDisplayedUrl)) {
                // Also snooze for 3 seconds on auto-dismiss so continuous screen text doesn't re-trigger immediately
                snooze(currentlyDisplayedUrl);
            }
            if (currentOverlayView != null && windowManager != null) {
                windowManager.removeView(currentOverlayView);
            }
        } catch (Exception ignored) {
        } finally {
            currentOverlayView = null;
            isOverlayShowing = false;
        }
    }
}
