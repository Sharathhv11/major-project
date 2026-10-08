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
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.List;

/**
 * FloatingScannerManager
 *
 * Implements the on-screen FraudShield floating bot / manual fraud scanner:
 * - Floating sleeping button: Unobtrusive, draggable, positioned on screen.
 * - Awake / Selecting mode: Scans current screen on-demand via UrlAccessibilityService.
 * - Selection UI: Allows the user to choose which message/text to verify.
 * - Analysis: Forwards selected text through the unified fraud pipeline.
 * - Result & Sleep: Displays risk score, waits 3 seconds (MANUAL_SCAN_SLEEP_DELAY), then sleeps.
 */
public class FloatingScannerManager {

    private static final String TAG = "FraudShield Helper";
    public static final long MANUAL_SCAN_SLEEP_DELAY_MS = 3000;

    public enum State {
        SLEEPING,
        AWAKE,
        SELECTING,
        ANALYZING,
        RESULT
    }

    private static FloatingScannerManager sInstance;

    private final Context mContext;
    private final WindowManager mWindowManager;
    private final Handler mMainHandler;

    private View mFloatingButtonView;
    private WindowManager.LayoutParams mFloatingParams;
    private boolean mIsFloatingButtonVisible = false;

    private View mExpandedOverlayView;
    private boolean mIsExpandedOverlayVisible = false;

    private State mCurrentState = State.SLEEPING;
    private String mSelectedText = "";
    private List<String> mScreenTexts = new ArrayList<>();

    private final Runnable mReturnToSleepRunnable = new Runnable() {
        @Override
        public void run() {
            Log.i(TAG, "Returning to sleep");
            returnToSleepingState();
        }
    };

    private FloatingScannerManager(Context context) {
        mContext = context.getApplicationContext();
        mWindowManager = (WindowManager) mContext.getSystemService(Context.WINDOW_SERVICE);
        mMainHandler = new Handler(Looper.getMainLooper());
    }

    public static synchronized FloatingScannerManager getInstance(Context context) {
        if (sInstance == null) {
            sInstance = new FloatingScannerManager(context);
        }
        return sInstance;
    }

    public State getState() {
        return mCurrentState;
    }

    public boolean isFloatingBotVisible() {
        return mIsFloatingButtonVisible;
    }

    /**
     * Shows the floating bot in its normal sleeping state.
     */
    public void showFloatingBot() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mContext)) {
            Log.w(TAG, "Overlay permission not granted; cannot display floating bot");
            return;
        }

        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (mFloatingButtonView == null) {
                    createFloatingButtonView();
                }
                if (!mIsFloatingButtonVisible && mFloatingButtonView != null) {
                    try {
                        mWindowManager.addView(mFloatingButtonView, mFloatingParams);
                        mIsFloatingButtonVisible = true;
                        mCurrentState = State.SLEEPING;
                        Log.i(TAG, "Bot opened (sleeping state)");
                    } catch (Exception e) {
                        Log.e(TAG, "Error adding floating bot view", e);
                    }
                }
            }
        });
    }

    /**
     * Hides the floating bot completely.
     */
    public void hideFloatingBot() {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                dismissExpandedOverlay();
                if (mIsFloatingButtonVisible && mFloatingButtonView != null) {
                    try {
                        mWindowManager.removeView(mFloatingButtonView);
                    } catch (Exception ignored) {
                    }
                    mIsFloatingButtonVisible = false;
                    mCurrentState = State.SLEEPING;
                }
            }
        });
    }

    /**
     * Creates the small, draggable floating button.
     */
    private void createFloatingButtonView() {
        float density = mContext.getResources().getDisplayMetrics().density;
        int sizePx = (int) (56 * density);

        FrameLayout buttonLayout = new FrameLayout(mContext);

        // Circular background with vibrant shield border
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#0F172A")); // Dark slate navy
        bg.setStroke((int) (2.5f * density), Color.parseColor("#3B82F6")); // Blue border
        buttonLayout.setBackground(bg);

        // Center Icon & Badge
        LinearLayout content = new LinearLayout(mContext);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);

        TextView iconView = new TextView(mContext);
        iconView.setText("🛡️");
        iconView.setTextSize(20);
        iconView.setGravity(Gravity.CENTER);
        content.addView(iconView);

        TextView labelView = new TextView(mContext);
        labelView.setText("SHIELD");
        labelView.setTextSize(7.5f);
        labelView.setTypeface(Typeface.DEFAULT_BOLD);
        labelView.setTextColor(Color.parseColor("#60A5FA")); // Light blue
        labelView.setGravity(Gravity.CENTER);
        content.addView(labelView);

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        );
        contentParams.gravity = Gravity.CENTER;
        buttonLayout.addView(content, contentParams);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            buttonLayout.setElevation(12 * density);
        }

        // Layout parameters
        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        mFloatingParams = new WindowManager.LayoutParams(
            sizePx,
            sizePx,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        mFloatingParams.gravity = Gravity.TOP | Gravity.START;
        mFloatingParams.x = dm.widthPixels - sizePx - (int) (16 * density);
        mFloatingParams.y = dm.heightPixels / 2 - (sizePx / 2);

        // Draggable touch listener with tap detection
        buttonLayout.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = mFloatingParams.x;
                        initialY = mFloatingParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        mFloatingParams.x = initialX + (int) (event.getRawX() - initialTouchX);
                        mFloatingParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                        try {
                            if (mIsFloatingButtonVisible && mFloatingButtonView != null) {
                                mWindowManager.updateViewLayout(mFloatingButtonView, mFloatingParams);
                            }
                        } catch (Exception ignored) {
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        float diffX = Math.abs(event.getRawX() - initialTouchX);
                        float diffY = Math.abs(event.getRawY() - initialTouchY);
                        // Click threshold (touch slop)
                        if (diffX < 12 && diffY < 12) {
                            onFloatingBotTapped();
                        }
                        return true;
                }
                return false;
            }
        });

        mFloatingButtonView = buttonLayout;
    }

    /**
     * Triggered when the user taps the floating bot to wake it up.
     */
    private void onFloatingBotTapped() {
        Log.i(TAG, "Bot wakes - Scanning mode initiated");
        mCurrentState = State.AWAKE;
        mSelectedText = "";

        // Cancel any pending sleep timer
        mMainHandler.removeCallbacks(mReturnToSleepRunnable);

        // Retrieve accessible on-screen text from UrlAccessibilityService
        UrlAccessibilityService service = UrlAccessibilityService.getInstance();
        if (service != null) {
            mScreenTexts = service.getVisibleScreenTexts();
            Log.i(TAG, "Screen text retrieved: " + mScreenTexts.size() + " items");
        } else {
            mScreenTexts = new ArrayList<>();
            Log.w(TAG, "Accessibility service not running; no screen text available");
        }

        mCurrentState = State.SELECTING;
        showSelectionOverlay();
    }

    /**
     * Renders the expanded modal overlay for selecting on-screen text.
     */
    private void showSelectionOverlay() {
        dismissExpandedOverlay();

        float density = mContext.getResources().getDisplayMetrics().density;
        int p20 = (int) (20 * density);
        int p16 = (int) (16 * density);
        int p12 = (int) (12 * density);
        int p8 = (int) (8 * density);
        int p4 = (int) (4 * density);

        // 1. Full-screen scrim backdrop
        FrameLayout backdrop = new FrameLayout(mContext);
        backdrop.setBackgroundColor(Color.parseColor("#990B1120")); // Translucent dark slate
        backdrop.setClickable(true);
        backdrop.setFocusable(true);

        // 2. Centered Card
        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(p20, p16, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * density);
        cardBg.setStroke((int) (1.5f * density), Color.parseColor("#E2E8F0"));
        card.setBackground(cardBg);

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (dm.widthPixels * 0.92),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        card.setLayoutParams(cardParams);

        // Header: Badge & Close Button
        LinearLayout headerRow = new LinearLayout(mContext);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.bottomMargin = p12;
        headerRow.setLayoutParams(headerParams);

        // Shield badge
        TextView badge = new TextView(mContext);
        badge.setText("🛡️ FraudShield Manual Scanner");
        badge.setTextColor(Color.parseColor("#1E40AF")); // Deep blue
        badge.setTextSize(13);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1.0f
        );
        badge.setLayoutParams(badgeParams);
        headerRow.addView(badge);

        // Close button (Cancel -> sleep)
        TextView closeBtn = new TextView(mContext);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.parseColor("#64748B"));
        closeBtn.setTextSize(18);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setPadding(p8, p4, p8, p4);
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Log.i(TAG, "User cancelled selection");
                returnToSleepingState();
            }
        });
        headerRow.addView(closeBtn);
        card.addView(headerRow);

        // Prompt subtitle
        TextView subtitle = new TextView(mContext);
        subtitle.setText("Select the message or text you want to check:");
        subtitle.setTextColor(Color.parseColor("#0F172A"));
        subtitle.setTextSize(15);
        subtitle.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subParams.bottomMargin = p8;
        subtitle.setLayoutParams(subParams);
        card.addView(subtitle);

        // Selected Text Preview Box
        final LinearLayout previewBox = new LinearLayout(mContext);
        previewBox.setOrientation(LinearLayout.VERTICAL);
        previewBox.setPadding(p12, p8, p12, p8);

        final GradientDrawable previewBg = new GradientDrawable();
        previewBg.setColor(Color.parseColor("#F8FAFC"));
        previewBg.setCornerRadius(8 * density);
        previewBg.setStroke((int) (1 * density), Color.parseColor("#CBD5E1"));
        previewBox.setBackground(previewBg);

        final TextView previewLabel = new TextView(mContext);
        previewLabel.setText("SELECTED TEXT:");
        previewLabel.setTextColor(Color.parseColor("#64748B"));
        previewLabel.setTextSize(10);
        previewLabel.setTypeface(Typeface.DEFAULT_BOLD);
        previewBox.addView(previewLabel);

        final TextView previewText = new TextView(mContext);
        previewText.setText("(Tap an item below to select)");
        previewText.setTextColor(Color.parseColor("#94A3B8"));
        previewText.setTextSize(12);
        previewText.setMaxLines(3);
        previewText.setEllipsize(TextUtils.TruncateAt.END);
        previewBox.addView(previewText);

        LinearLayout.LayoutParams previewParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        previewParams.bottomMargin = p12;
        previewBox.setLayoutParams(previewParams);
        card.addView(previewBox);

        // Scan button (initially disabled until text is selected)
        final TextView scanBtn = new TextView(mContext);
        scanBtn.setText("🛡️ SCAN FOR FRAUD");
        scanBtn.setTextColor(Color.parseColor("#FFFFFF"));
        scanBtn.setTextSize(14);
        scanBtn.setTypeface(Typeface.DEFAULT_BOLD);
        scanBtn.setGravity(Gravity.CENTER);
        scanBtn.setPadding(p16, (int) (13 * density), p16, (int) (13 * density));

        final GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#94A3B8")); // Disabled gray
        btnBg.setCornerRadius(10 * density);
        scanBtn.setBackground(btnBg);
        scanBtn.setEnabled(false);

        // Items list or fallback message
        if (mScreenTexts == null || mScreenTexts.isEmpty()) {
            TextView emptyMsg = new TextView(mContext);
            emptyMsg.setText("Unable to detect readable text on this screen.\n\nTry opening a supported message or webpage and tap the FraudShield bot again.");
            emptyMsg.setTextColor(Color.parseColor("#DC2626"));
            emptyMsg.setTextSize(13);
            emptyMsg.setPadding(0, p8, 0, p16);
            card.addView(emptyMsg);
        } else {
            // Scrollable list of text items
            ScrollView scrollView = new ScrollView(mContext);
            LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (int) (180 * density)
            );
            scrollParams.bottomMargin = p12;
            scrollView.setLayoutParams(scrollParams);

            final LinearLayout itemsContainer = new LinearLayout(mContext);
            itemsContainer.setOrientation(LinearLayout.VERTICAL);

            final List<View> itemViews = new ArrayList<>();

            for (int i = 0; i < mScreenTexts.size(); i++) {
                final String textSnippet = mScreenTexts.get(i);

                final LinearLayout itemLayout = new LinearLayout(mContext);
                itemLayout.setOrientation(LinearLayout.VERTICAL);
                itemLayout.setPadding(p12, p8, p12, p8);

                final GradientDrawable itemBg = new GradientDrawable();
                itemBg.setColor(Color.parseColor("#FFFFFF"));
                itemBg.setCornerRadius(8 * density);
                itemBg.setStroke((int) (1 * density), Color.parseColor("#E2E8F0"));
                itemLayout.setBackground(itemBg);

                LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                );
                itemParams.bottomMargin = p8;
                itemLayout.setLayoutParams(itemParams);

                TextView itemText = new TextView(mContext);
                itemText.setText(textSnippet);
                itemText.setTextColor(Color.parseColor("#1E293B"));
                itemText.setTextSize(13);
                itemText.setMaxLines(3);
                itemText.setEllipsize(TextUtils.TruncateAt.END);
                itemLayout.addView(itemText);

                itemLayout.setOnClickListener(new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        mSelectedText = textSnippet;
                        Log.i(TAG, "Text selected (length: " + mSelectedText.length() + ")");

                        // Update selection preview
                        previewText.setText(mSelectedText);
                        previewText.setTextColor(Color.parseColor("#0F172A"));
                        previewBg.setColor(Color.parseColor("#EFF6FF"));
                        previewBg.setStroke((int) (1.5f * density), Color.parseColor("#3B82F6"));

                        // Highlight selected item card
                        for (View otherView : itemViews) {
                            GradientDrawable otherBg = (GradientDrawable) otherView.getBackground();
                            otherBg.setColor(Color.parseColor("#FFFFFF"));
                            otherBg.setStroke((int) (1 * density), Color.parseColor("#E2E8F0"));
                        }
                        itemBg.setColor(Color.parseColor("#F0FDF4"));
                        itemBg.setStroke((int) (1.5f * density), Color.parseColor("#10B981"));

                        // Enable scan button
                        scanBtn.setEnabled(true);
                        btnBg.setColor(Color.parseColor("#2563EB")); // Active Blue
                    }
                });

                itemViews.add(itemLayout);
                itemsContainer.addView(itemLayout);
            }

            scrollView.addView(itemsContainer);
            card.addView(scrollView);
        }

        // Action: Tap [ SCAN FOR FRAUD ]
        scanBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (TextUtils.isEmpty(mSelectedText)) {
                    return;
                }
                triggerManualAnalysis(mSelectedText);
            }
        });

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        scanBtn.setLayoutParams(btnParams);
        card.addView(scanBtn);

        backdrop.addView(card);
        mExpandedOverlayView = backdrop;

        // Display expanded WindowManager overlay
        attachExpandedOverlay(backdrop);
    }

    /**
     * Triggers fraud analysis through the unified React Native fraud pipeline.
     */
    private void triggerManualAnalysis(String textToScan) {
        mCurrentState = State.ANALYZING;
        Log.i(TAG, "Manual scan started");

        showAnalyzingOverlay();

        // Send event to React Native bridge
        try {
            ReactApplicationContext reactContext = AccessibilityBridgeModule.getReactContextInstance();
            if (reactContext != null) {
                UrlAccessibilityService service = UrlAccessibilityService.getInstance();
                String sourcePackage = service != null ? service.getActivePackageName() : "";

                WritableMap event = Arguments.createMap();
                event.putString("text", textToScan);
                event.putString("sourcePackage", sourcePackage);
                event.putDouble("timestamp", System.currentTimeMillis());
                event.putString("scanId", String.valueOf(System.currentTimeMillis()));

                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("onManualScanRequested", event);
            } else {
                Log.e(TAG, "React context is null; unable to execute pipeline");
                showErrorOverlay("Unable to connect to fraud detection service");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error emitting manual scan event", e);
            showErrorOverlay("Analysis error occurred");
        }
    }

    /**
     * Displays loading spinner during AI analysis.
     */
    private void showAnalyzingOverlay() {
        if (mExpandedOverlayView == null) return;

        float density = mContext.getResources().getDisplayMetrics().density;
        int p24 = (int) (24 * density);
        int p16 = (int) (16 * density);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(p24, p24, p24, p24);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * density);
        card.setBackground(cardBg);

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (dm.widthPixels * 0.85),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        card.setLayoutParams(cardParams);

        ProgressBar spinner = new ProgressBar(mContext);
        card.addView(spinner);

        TextView title = new TextView(mContext);
        title.setText("🛡️ Analyzing Message...");
        title.setTextColor(Color.parseColor("#0F172A"));
        title.setTextSize(16);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, p16, 0, (int) (6 * density));
        card.addView(title);

        TextView subtitle = new TextView(mContext);
        subtitle.setText("Running keyword pre-filter & BERT AI model");
        subtitle.setTextColor(Color.parseColor("#64748B"));
        subtitle.setTextSize(12);
        card.addView(subtitle);

        backdrop.addView(card);
    }

    /**
     * Called when the React Native pipeline finishes analyzing the manually selected message.
     */
    public void showScanResult(ReadableMap result) {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (result == null) {
                    showErrorOverlay("Unable to complete analysis");
                    return;
                }

                mCurrentState = State.RESULT;
                Log.i(TAG, "Showing result");

                String status = result.hasKey("status") ? result.getString("status") : "";
                double riskScore = result.hasKey("riskScore") ? result.getDouble("riskScore") : 0.0;
                String classification = result.hasKey("classification") ? result.getString("classification") : "NOT_FRAUD";

                boolean isHighRisk = "PROCESSED_FRAUD".equals(status) || riskScore >= 0.70 || "FRAUD".equalsIgnoreCase(classification);
                boolean isSuspicious = !isHighRisk && (riskScore >= 0.40 && riskScore < 0.70);

                renderResultCard(isHighRisk, isSuspicious, riskScore);

                // Schedule return to sleep after MANUAL_SCAN_SLEEP_DELAY_MS (3 seconds)
                mMainHandler.removeCallbacks(mReturnToSleepRunnable);
                mMainHandler.postDelayed(mReturnToSleepRunnable, MANUAL_SCAN_SLEEP_DELAY_MS);
            }
        });
    }

    /**
     * Renders the final High Risk / Suspicious / Low Risk result card.
     */
    private void renderResultCard(boolean isHighRisk, boolean isSuspicious, double riskScore) {
        if (mExpandedOverlayView == null) return;

        float density = mContext.getResources().getDisplayMetrics().density;
        int p20 = (int) (20 * density);
        int p16 = (int) (16 * density);
        int p12 = (int) (12 * density);
        int p8 = (int) (8 * density);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(p20, p20, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * density);

        String badgeText;
        String badgeColor;
        String badgeBgColor;
        String explanation;
        int scorePct = (int) Math.round(riskScore * 100);

        if (isHighRisk) {
            badgeText = "⚠️ HIGH RISK (" + scorePct + "%)";
            badgeColor = "#DC2626";
            badgeBgColor = "#FEF2F2";
            cardBg.setStroke((int) (2 * density), Color.parseColor("#EF4444"));
            explanation = "This message may be a scam.\n\nAvoid clicking links or sharing OTPs, passwords, bank details, or money.";
        } else if (isSuspicious) {
            badgeText = "⚠️ SUSPICIOUS (" + scorePct + "%)";
            badgeColor = "#D97706";
            badgeBgColor = "#FFFBEB";
            cardBg.setStroke((int) (1.5f * density), Color.parseColor("#F59E0B"));
            explanation = "This message contains suspicious patterns.\n\nVerify directly with the sender before taking any action.";
        } else {
            badgeText = "✓ LOW RISK";
            badgeColor = "#059669";
            badgeBgColor = "#ECFDF5";
            cardBg.setStroke((int) (1.5f * density), Color.parseColor("#10B981"));
            explanation = "We did not detect strong signs of fraud in this text.\n\nStill verify unexpected requests before acting.";
        }

        card.setBackground(cardBg);

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (dm.widthPixels * 0.90),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        card.setLayoutParams(cardParams);

        // Result Pill Badge
        TextView badge = new TextView(mContext);
        badge.setText(badgeText);
        badge.setTextColor(Color.parseColor(badgeColor));
        badge.setTextSize(14);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setPadding(p12, p8, p12, p8);
        GradientDrawable badgeDrawable = new GradientDrawable();
        badgeDrawable.setColor(Color.parseColor(badgeBgColor));
        badgeDrawable.setCornerRadius(999 * density);
        badge.setBackground(badgeDrawable);
        badge.setGravity(Gravity.CENTER);
        card.addView(badge);

        // Explanation text
        TextView explanationView = new TextView(mContext);
        explanationView.setText(explanation);
        explanationView.setTextColor(Color.parseColor("#1E293B"));
        explanationView.setTextSize(14);
        explanationView.setLineSpacing(0, 1.25f);
        explanationView.setPadding(0, p16, 0, p16);
        card.addView(explanationView);

        // Close button
        TextView closeBtn = new TextView(mContext);
        closeBtn.setText("Close");
        closeBtn.setTextColor(Color.parseColor("#FFFFFF"));
        closeBtn.setTextSize(14);
        closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeBtn.setGravity(Gravity.CENTER);
        closeBtn.setPadding(p16, p12, p16, p12);

        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.parseColor(isHighRisk ? "#DC2626" : "#2563EB"));
        closeBg.setCornerRadius(10 * density);
        closeBtn.setBackground(closeBg);

        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mMainHandler.removeCallbacks(mReturnToSleepRunnable);
                returnToSleepingState();
            }
        });
        card.addView(closeBtn);

        // Sleep indicator note
        TextView autoSleepNote = new TextView(mContext);
        autoSleepNote.setText("Returning to sleep in 3s...");
        autoSleepNote.setTextColor(Color.parseColor("#94A3B8"));
        autoSleepNote.setTextSize(11);
        autoSleepNote.setGravity(Gravity.CENTER);
        autoSleepNote.setPadding(0, p8, 0, 0);
        card.addView(autoSleepNote);

        backdrop.addView(card);
    }

    /**
     * Shows error state overlay.
     */
    private void showErrorOverlay(String message) {
        if (mExpandedOverlayView == null) return;

        float density = mContext.getResources().getDisplayMetrics().density;
        int p20 = (int) (20 * density);
        int p12 = (int) (12 * density);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(p20, p20, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * density);
        card.setBackground(cardBg);

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
            (int) (dm.widthPixels * 0.85),
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.gravity = Gravity.CENTER;
        card.setLayoutParams(cardParams);

        TextView errorTitle = new TextView(mContext);
        errorTitle.setText("⚠️ Unable to Complete Check");
        errorTitle.setTextColor(Color.parseColor("#DC2626"));
        errorTitle.setTextSize(15);
        errorTitle.setTypeface(Typeface.DEFAULT_BOLD);
        card.addView(errorTitle);

        TextView errorMsg = new TextView(mContext);
        errorMsg.setText(message + "\nPlease try again later.");
        errorMsg.setTextColor(Color.parseColor("#64748B"));
        errorMsg.setTextSize(13);
        errorMsg.setPadding(0, p12, 0, p12);
        errorMsg.setGravity(Gravity.CENTER);
        card.addView(errorMsg);

        backdrop.addView(card);

        // Auto sleep after 3 seconds on error
        mMainHandler.removeCallbacks(mReturnToSleepRunnable);
        mMainHandler.postDelayed(mReturnToSleepRunnable, MANUAL_SCAN_SLEEP_DELAY_MS);
    }

    /**
     * Helper to attach expanded WindowManager modal view.
     */
    private void attachExpandedOverlay(View view) {
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
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.CENTER;

        try {
            mWindowManager.addView(view, params);
            mIsExpandedOverlayVisible = true;
        } catch (Exception e) {
            Log.e(TAG, "Error attaching expanded overlay", e);
        }
    }

    /**
     * Dismisses the expanded modal overlay.
     */
    private void dismissExpandedOverlay() {
        if (mIsExpandedOverlayVisible && mExpandedOverlayView != null) {
            try {
                mWindowManager.removeView(mExpandedOverlayView);
            } catch (Exception ignored) {
            }
            mIsExpandedOverlayVisible = false;
            mExpandedOverlayView = null;
        }
    }

    /**
     * Returns the bot back to its sleeping floating-button state.
     */
    public void returnToSleepingState() {
        mMainHandler.removeCallbacks(mReturnToSleepRunnable);
        dismissExpandedOverlay();
        mCurrentState = State.SLEEPING;
        mSelectedText = "";
    }
}
