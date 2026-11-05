package com.myapp.urldetector;

import android.content.Context;
import android.content.Intent;
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
import android.widget.ScrollView;
import android.widget.TextView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.concurrent.ConcurrentHashMap;

/**
 * OverlayManager
 *
 * Displays full-screen native Android overlay alerts:
 * 1. Insecure HTTP URL detection alerts.
 * 2. Sensitive Website Permission alerts (Camera, Microphone, Location).
 * Provides clear security explanations and 3 action options: Allow, Deny, Learn More.
 * Written purely in Java.
 */
public class OverlayManager {

    // Stay on screen for 4 seconds before auto-dismissing URL alerts, 20 seconds for permissions
    private static final long AUTO_DISMISS_DELAY_MS = 4000;
    private static final long PERMISSION_AUTO_DISMISS_DELAY_MS = 20000;

    // Minimum interval from one alert to another (3,000 ms)
    public static final long SNOOZE_INTERVAL_MS = 3 * 1000;
    public static final long PERMISSION_COOLDOWN_MS = 10 * 1000;

    private static OverlayManager instance;

    private final Context context;
    private final WindowManager windowManager;
    private final Handler mainHandler;

    private View currentOverlayView;
    private boolean isOverlayShowing = false;
    private long overlayShownTimestamp = 0;
    private String currentlyDisplayedUrl = "";

    // Snoozed URLs / permissions and global snooze timestamp
    private final ConcurrentHashMap<String, Long> snoozedUrls = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> snoozedPermissions = new ConcurrentHashMap<>();
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
     * Helper to emit bridge events to React Native
     */
    private void emitToReactNative(String eventName, WritableMap eventData) {
        try {
            ReactApplicationContext reactContext = AccessibilityBridgeModule.getReactContextInstance();
            if (reactContext != null) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit(eventName, eventData);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Checks if a URL or alert is currently snoozed.
     */
    public boolean isSnoozed(String url) {
        long now = System.currentTimeMillis();

        if (isOverlayShowing) {
            if (now - overlayShownTimestamp >= SNOOZE_INTERVAL_MS) {
                return false;
            }
            return true;
        }

        if (now < globalSnoozeUntil) {
            return true;
        }

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

    public boolean isPermissionSnoozed(String key) {
        long now = System.currentTimeMillis();
        if (isOverlayShowing) {
            return true;
        }
        if (!TextUtils.isEmpty(key) && snoozedPermissions.containsKey(key)) {
            Long snoozedTime = snoozedPermissions.get(key);
            if (snoozedTime != null && (now - snoozedTime < PERMISSION_COOLDOWN_MS)) {
                return true;
            } else {
                snoozedPermissions.remove(key);
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

        if (isSnoozed(content)) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            return;
        }

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    displayFullScreenOverlay(title, explanation, label, content);
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void displayFullScreenOverlay(final String title, final String explanation, final String label, final String content) {
        long now = System.currentTimeMillis();

        if (isSnoozed(content)) {
            return;
        }

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

        final FrameLayout fullScreenBackdrop = new FrameLayout(context);
        fullScreenBackdrop.setBackgroundColor(Color.parseColor("#CC0B1120")); // 80% opacity dark slate
        fullScreenBackdrop.setClickable(true);
        fullScreenBackdrop.setFocusable(true);

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

        LinearLayout headerRow = new LinearLayout(context);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.bottomMargin = p12;
        headerRow.setLayoutParams(headerParams);

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

        TextView closeBtn = new TextView(context);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748B"));
        closeBtn.setTextSize(18);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(p8, p4, p8, p4);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                snooze(currentlyDisplayedUrl);
                dismissOverlay();
            }
        });
        headerRow.addView(closeBtn);

        alertCard.addView(headerRow);

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

        TextView explanationView = new TextView(context);
        explanationView.setText(explanation);
        explanationView.setTextColor(Color.parseColor("#991B1B"));
        explanationView.setTextSize(13);
        explanationView.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams expParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        expParams.bottomMargin = p16;
        explanationView.setLayoutParams(expParams);
        alertCard.addView(explanationView);

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

            mainHandler.postDelayed(autoDismissRunnable, AUTO_DISMISS_DELAY_MS);
        } catch (Exception e) {
            currentOverlayView = null;
            isOverlayShowing = false;
        }
    }

    // ─── Sensitive Website Permission Protection Alert ────────────────────────

    /**
     * Displays a native FraudShield alert when a website requests camera, mic, or location.
     * Features 3 clear choices: Allow (proceeds to browser prompt), Deny, and Learn More.
     * Never silently overrides user choice.
     */
    public void showWebsitePermissionAlert(
            final String domain,
            final String url,
            final String permissionType,
            final String trustLevel,
            final String explanation,
            final String browserName
    ) {
        final String cacheKey = domain + "#" + permissionType;
        if (isPermissionSnoozed(cacheKey)) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            return;
        }

        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    displayWebsitePermissionOverlay(domain, url, permissionType, trustLevel, explanation, browserName, cacheKey);
                } catch (Exception ignored) {
                }
            }
        });
    }

    private void displayWebsitePermissionOverlay(
            final String domain,
            final String url,
            final String permissionType,
            final String trustLevel,
            final String explanation,
            final String browserName,
            final String cacheKey
    ) {
        long now = System.currentTimeMillis();

        if (currentOverlayView != null) {
            try {
                mainHandler.removeCallbacks(autoDismissRunnable);
                windowManager.removeView(currentOverlayView);
            } catch (Exception ignored) {
            }
            currentOverlayView = null;
            isOverlayShowing = false;
        }

        snoozedPermissions.put(cacheKey, now);

        float density = context.getResources().getDisplayMetrics().density;
        int p20 = (int) (20 * density);
        int p16 = (int) (16 * density);
        int p12 = (int) (12 * density);
        int p10 = (int) (10 * density);
        int p8 = (int) (8 * density);
        int p4 = (int) (4 * density);

        // Dark cybersecurity backdrop (#CC05070D)
        final FrameLayout fullScreenBackdrop = new FrameLayout(context);
        fullScreenBackdrop.setBackgroundColor(Color.parseColor("#D005070D"));
        fullScreenBackdrop.setClickable(true);
        fullScreenBackdrop.setFocusable(true);

        // Card Container in Deep Blue/Black Theme (#0B1220)
        LinearLayout alertCard = new LinearLayout(context);
        alertCard.setOrientation(LinearLayout.VERTICAL);
        alertCard.setPadding(p20, p16, p20, p16);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#0B1220"));
        cardBg.setCornerRadius(18 * density);
        cardBg.setStroke((int) (1.5f * density), Color.parseColor("#1E293B"));
        alertCard.setBackground(cardBg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            alertCard.setElevation(20 * density);
        }

        int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (screenWidth * 0.92),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        alertCard.setLayoutParams(cardParams);

        // 1. Header: Shield Badge & Close Button
        LinearLayout headerRow = new LinearLayout(context);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.bottomMargin = p10;
        headerRow.setLayoutParams(headerParams);

        // Badge pill
        LinearLayout badgePill = new LinearLayout(context);
        badgePill.setOrientation(LinearLayout.HORIZONTAL);
        badgePill.setPadding(p10, p4, p10, p4);
        badgePill.setGravity(Gravity.CENTER_VERTICAL);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setCornerRadius(999 * density);
        badgeBg.setColor(Color.parseColor("#172554")); // Deep navy blue
        badgeBg.setStroke((int) (1 * density), Color.parseColor("#1E40AF"));
        badgePill.setBackground(badgeBg);

        TextView badgeText = new TextView(context);
        badgeText.setText("🛡️ FRAUDSHIELD PERMISSION GUARD");
        badgeText.setTextColor(Color.parseColor("#60A5FA"));
        badgeText.setTextSize(11);
        badgeText.setTypeface(Typeface.DEFAULT_BOLD);
        badgePill.addView(badgeText);

        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        badgeParams.weight = 1.0f;
        badgePill.setLayoutParams(badgeParams);
        headerRow.addView(badgePill);

        TextView closeBtn = new TextView(context);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#94A3B8"));
        closeBtn.setTextSize(18);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(p8, p4, p8, p4);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismissOverlay();
            }
        });
        headerRow.addView(closeBtn);
        alertCard.addView(headerRow);

        // 2. Title
        TextView titleView = new TextView(context);
        titleView.setText("Website Permission Request");
        titleView.setTextColor(Color.parseColor("#FFFFFF"));
        titleView.setTextSize(18);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        titleParams.bottomMargin = p8;
        titleView.setLayoutParams(titleParams);
        alertCard.addView(titleView);

        // 3. Domain & Trust Badge Box
        LinearLayout domainBox = new LinearLayout(context);
        domainBox.setOrientation(LinearLayout.HORIZONTAL);
        domainBox.setGravity(Gravity.CENTER_VERTICAL);
        domainBox.setPadding(p12, p8, p12, p8);

        GradientDrawable domainBoxBg = new GradientDrawable();
        domainBoxBg.setColor(Color.parseColor("#0F172A"));
        domainBoxBg.setCornerRadius(10 * density);
        domainBoxBg.setStroke((int) (1 * density), Color.parseColor("#1E293B"));
        domainBox.setBackground(domainBoxBg);

        TextView domainView = new TextView(context);
        domainView.setText(domain != null ? domain : "Website");
        domainView.setTextColor(Color.parseColor("#38BDF8"));
        domainView.setTextSize(13);
        domainView.setTypeface(Typeface.DEFAULT_BOLD);
        domainView.setEllipsize(TextUtils.TruncateAt.END);
        domainView.setMaxLines(1);
        LinearLayout.LayoutParams domainParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1.0f
        );
        domainView.setLayoutParams(domainParams);
        domainBox.addView(domainView);

        // Trust badge pill
        TextView trustBadge = new TextView(context);
        GradientDrawable trustBg = new GradientDrawable();
        trustBg.setCornerRadius(999 * density);

        if ("VERIFIED".equalsIgnoreCase(trustLevel)) {
            trustBadge.setText("✓ VERIFIED");
            trustBadge.setTextColor(Color.parseColor("#10B981"));
            trustBg.setColor(Color.parseColor("#064E3B"));
            trustBg.setStroke((int) (1 * density), Color.parseColor("#059669"));
        } else if ("SUSPICIOUS".equalsIgnoreCase(trustLevel)) {
            trustBadge.setText("⚠️ SUSPICIOUS");
            trustBadge.setTextColor(Color.parseColor("#EF4444"));
            trustBg.setColor(Color.parseColor("#450A0A"));
            trustBg.setStroke((int) (1 * density), Color.parseColor("#DC2626"));
        } else {
            trustBadge.setText("ℹ️ UNVERIFIED");
            trustBadge.setTextColor(Color.parseColor("#F59E0B"));
            trustBg.setColor(Color.parseColor("#451A03"));
            trustBg.setStroke((int) (1 * density), Color.parseColor("#D97706"));
        }

        trustBadge.setBackground(trustBg);
        trustBadge.setPadding(p8, p4, p8, p4);
        trustBadge.setTextSize(10);
        trustBadge.setTypeface(Typeface.DEFAULT_BOLD);
        domainBox.addView(trustBadge);

        LinearLayout.LayoutParams domainBoxParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        domainBoxParams.bottomMargin = p12;
        domainBox.setLayoutParams(domainBoxParams);
        alertCard.addView(domainBox);

        // 4. Requested Permission Indicator Pill
        LinearLayout permPill = new LinearLayout(context);
        permPill.setOrientation(LinearLayout.HORIZONTAL);
        permPill.setPadding(p12, p6(density), p12, p6(density));
        permPill.setGravity(Gravity.CENTER_VERTICAL);

        GradientDrawable permBg = new GradientDrawable();
        permBg.setColor(Color.parseColor("#1E293B"));
        permBg.setCornerRadius(8 * density);
        permPill.setBackground(permBg);

        String permIcon = "🔒";
        String permLabel = permissionType != null ? permissionType.toUpperCase() : "PERMISSION";
        if (permLabel.contains("CAMERA")) {
            permIcon = "📷";
            permLabel = "CAMERA ACCESS REQUESTED";
        } else if (permLabel.contains("MIC") || permLabel.contains("AUDIO")) {
            permIcon = "🎙️";
            permLabel = "MICROPHONE ACCESS REQUESTED";
        } else if (permLabel.contains("LOCATION") || permLabel.contains("GPS")) {
            permIcon = "📍";
            permLabel = "LOCATION ACCESS REQUESTED";
        }

        TextView permLabelView = new TextView(context);
        permLabelView.setText(permIcon + " " + permLabel);
        permLabelView.setTextColor(Color.parseColor("#F8FAFC"));
        permLabelView.setTextSize(12);
        permLabelView.setTypeface(Typeface.DEFAULT_BOLD);
        permPill.addView(permLabelView);

        LinearLayout.LayoutParams permParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        permParams.bottomMargin = p12;
        permPill.setLayoutParams(permParams);
        alertCard.addView(permPill);

        // 5. Security Explanation
        TextView expView = new TextView(context);
        expView.setText(explanation);
        expView.setTextColor(Color.parseColor("#94A3B8"));
        expView.setTextSize(12);
        expView.setLineSpacing(0, 1.25f);
        LinearLayout.LayoutParams expViewParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        expViewParams.bottomMargin = p16;
        expView.setLayoutParams(expViewParams);
        alertCard.addView(expView);

        // 6. Action Buttons: Allow (proceeds to browser), Deny, Learn More
        LinearLayout actionsLayout = new LinearLayout(context);
        actionsLayout.setOrientation(LinearLayout.VERTICAL);

        // Action 1: Learn More with AI Assistant (Blue Accent)
        TextView learnMoreBtn = new TextView(context);
        learnMoreBtn.setText("🤖 Learn More with AI Assistant");
        learnMoreBtn.setTextColor(Color.parseColor("#FFFFFF"));
        learnMoreBtn.setTextSize(13);
        learnMoreBtn.setTypeface(Typeface.DEFAULT_BOLD);
        learnMoreBtn.setGravity(Gravity.CENTER);
        learnMoreBtn.setPadding(p12, p12, p12, p12);

        GradientDrawable learnMoreBg = new GradientDrawable();
        learnMoreBg.setColor(Color.parseColor("#3a86ff")); // Primary accent
        learnMoreBg.setCornerRadius(10 * density);
        learnMoreBtn.setBackground(learnMoreBg);

        learnMoreBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                WritableMap event = Arguments.createMap();
                event.putString("domain", domain);
                event.putString("url", url);
                event.putString("permissionType", permissionType);
                event.putString("trustLevel", trustLevel);
                event.putString("browser", browserName);
                event.putString("action", "LEARN_MORE");
                event.putDouble("timestamp", System.currentTimeMillis());
                emitToReactNative("onWebsitePermissionUserAction", event);

                dismissOverlay();

                // Open FraudShield app into AssistantChat
                try {
                    Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        intent.putExtra("openAssistant", true);
                        intent.putExtra("permissionType", permissionType);
                        intent.putExtra("domain", domain);
                        intent.putExtra("trustLevel", trustLevel);
                        context.startActivity(intent);
                    }
                } catch (Exception ignored) {
                }
            }
        });

        LinearLayout.LayoutParams lmParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lmParams.bottomMargin = p8;
        learnMoreBtn.setLayoutParams(lmParams);
        actionsLayout.addView(learnMoreBtn);

        // Action 2 & 3: Horizontal row for Allow & Deny
        LinearLayout rowButtons = new LinearLayout(context);
        rowButtons.setOrientation(LinearLayout.HORIZONTAL);

        // Deny button (Red/Dark)
        TextView denyBtn = new TextView(context);
        denyBtn.setText("Deny Access");
        denyBtn.setTextColor(Color.parseColor("#EF4444"));
        denyBtn.setTextSize(13);
        denyBtn.setTypeface(Typeface.DEFAULT_BOLD);
        denyBtn.setGravity(Gravity.CENTER);
        denyBtn.setPadding(p8, p12, p8, p12);

        GradientDrawable denyBg = new GradientDrawable();
        denyBg.setColor(Color.parseColor("#1E293B"));
        denyBg.setCornerRadius(10 * density);
        denyBg.setStroke((int) (1 * density), Color.parseColor("#EF4444"));
        denyBtn.setBackground(denyBg);

        denyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                WritableMap event = Arguments.createMap();
                event.putString("domain", domain);
                event.putString("url", url);
                event.putString("permissionType", permissionType);
                event.putString("trustLevel", trustLevel);
                event.putString("browser", browserName);
                event.putString("action", "DENIED");
                event.putDouble("timestamp", System.currentTimeMillis());
                emitToReactNative("onWebsitePermissionUserAction", event);

                dismissOverlay();
            }
        });

        LinearLayout.LayoutParams denyParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1.0f
        );
        denyParams.rightMargin = p4;
        denyBtn.setLayoutParams(denyParams);
        rowButtons.addView(denyBtn);

        // Allow button (Green)
        TextView allowBtn = new TextView(context);
        allowBtn.setText("Allow (Proceed)");
        allowBtn.setTextColor(Color.parseColor("#FFFFFF"));
        allowBtn.setTextSize(13);
        allowBtn.setTypeface(Typeface.DEFAULT_BOLD);
        allowBtn.setGravity(Gravity.CENTER);
        allowBtn.setPadding(p8, p12, p8, p12);

        GradientDrawable allowBg = new GradientDrawable();
        allowBg.setColor(Color.parseColor("#059669"));
        allowBg.setCornerRadius(10 * density);
        allowBtn.setBackground(allowBg);

        allowBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                WritableMap event = Arguments.createMap();
                event.putString("domain", domain);
                event.putString("url", url);
                event.putString("permissionType", permissionType);
                event.putString("trustLevel", trustLevel);
                event.putString("browser", browserName);
                event.putString("action", "ALLOWED");
                event.putDouble("timestamp", System.currentTimeMillis());
                emitToReactNative("onWebsitePermissionUserAction", event);

                dismissOverlay();
            }
        });

        LinearLayout.LayoutParams allowParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1.0f
        );
        allowParams.leftMargin = p4;
        allowBtn.setLayoutParams(allowParams);
        rowButtons.addView(allowBtn);

        actionsLayout.addView(rowButtons);
        alertCard.addView(actionsLayout);

        // Safety note
        TextView safetyNote = new TextView(context);
        safetyNote.setText("FraudShield informs and educates you. You choose what to allow or deny.");
        safetyNote.setTextColor(Color.parseColor("#64748B"));
        safetyNote.setTextSize(10);
        safetyNote.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        noteParams.topMargin = p8;
        safetyNote.setLayoutParams(noteParams);
        alertCard.addView(safetyNote);

        fullScreenBackdrop.addView(alertCard);

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

            mainHandler.postDelayed(autoDismissRunnable, PERMISSION_AUTO_DISMISS_DELAY_MS);
        } catch (Exception e) {
            currentOverlayView = null;
            isOverlayShowing = false;
        }
    }

    private static int p6(float density) {
        return (int) (6 * density);
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
                snoozedUrls.put(currentlyDisplayedUrl, System.currentTimeMillis());
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
