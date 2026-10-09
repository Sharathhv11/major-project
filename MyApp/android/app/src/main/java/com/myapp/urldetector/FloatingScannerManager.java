package com.myapp.urldetector;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.content.SharedPreferences;
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
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
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
 * - Fully draggable across the screen in both X and Y directions.
 * - Snaps smoothly to nearest left or right screen edge upon release.
 * - Docks with 50% partial visibility (EDGE_VISIBLE_PERCENTAGE = 0.50f).
 * - Dims opacity when docked (DOCKED_ALPHA = 0.65f), restores to 1.0f on interaction.
 * - Distinguishes dragging from tapping cleanly using Android touch slop.
 * - Preserves vertical Y position on docking and persists state in SharedPreferences.
 * - Handles screen rotation, safe areas (status bar, navigation bar), and different DPIs.
 * - Awake / Selecting mode: Scans current screen on-demand via UrlAccessibilityService.
 * - Common fraud pipeline routing and 3-second auto-sleep behavior.
 */
public class FloatingScannerManager {

    private static final String TAG = "FraudShield Helper";
    public static final long MANUAL_SCAN_SLEEP_DELAY_MS = 3000;

    // Edge docking & visibility constants
    private static final float EDGE_VISIBLE_PERCENTAGE = 0.50f; // 50% visible when docked
    private static final float DOCKED_ALPHA = 0.65f;            // Dimmed opacity when docked
    private static final float ACTIVE_ALPHA = 1.0f;            // Full opacity when active/dragging
    private static final long SNAP_ANIMATION_DURATION_MS = 220; // Smooth snap duration in ms

    // Persistence constants
    private static final String PREFS_NAME = "fraudshield_floating_bot_prefs";
    private static final String KEY_DOCKED_EDGE = "docked_edge";
    private static final String KEY_Y_RATIO = "vertical_y_ratio";

    public enum State {
        SLEEPING,
        AWAKE,
        SELECTING,
        ANALYZING,
        RESULT
    }

    public enum DockEdge {
        LEFT,
        RIGHT
    }

    private static FloatingScannerManager sInstance;

    private final Context mContext;
    private final WindowManager mWindowManager;
    private final Handler mMainHandler;

    private View mFloatingButtonView;
    private WindowManager.LayoutParams mFloatingParams;
    private boolean mIsFloatingButtonVisible = false;

    private int mButtonSizePx;
    private float mDensity;
    private DockEdge mCurrentDockEdge = DockEdge.RIGHT;
    private boolean mIsDocked = true;
    private float mSavedYRatio = 0.5f; // Vertical center default
    private ValueAnimator mSnapAnimator;

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

        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        mDensity = dm.density;
        mButtonSizePx = (int) (56 * mDensity);

        loadPositionPreference();
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

    private void loadPositionPreference() {
        try {
            SharedPreferences prefs = mContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String edgeStr = prefs.getString(KEY_DOCKED_EDGE, "RIGHT");
            mCurrentDockEdge = "LEFT".equals(edgeStr) ? DockEdge.LEFT : DockEdge.RIGHT;
            mSavedYRatio = prefs.getFloat(KEY_Y_RATIO, 0.5f);
        } catch (Exception ignored) {
            mCurrentDockEdge = DockEdge.RIGHT;
            mSavedYRatio = 0.5f;
        }
    }

    private void savePositionPreference() {
        try {
            int screenH = getScreenHeight();
            if (screenH > 0 && mFloatingParams != null) {
                mSavedYRatio = (float) mFloatingParams.y / (float) screenH;
            }
            SharedPreferences prefs = mContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                .putString(KEY_DOCKED_EDGE, mCurrentDockEdge.name())
                .putFloat(KEY_Y_RATIO, mSavedYRatio)
                .apply();
        } catch (Exception ignored) {
        }
    }

    private int getScreenWidth() {
        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        return dm.widthPixels;
    }

    private int getScreenHeight() {
        DisplayMetrics dm = mContext.getResources().getDisplayMetrics();
        return dm.heightPixels;
    }

    private int getStatusBarHeight() {
        int resourceId = mContext.getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (resourceId > 0) {
            return mContext.getResources().getDimensionPixelSize(resourceId);
        }
        return (int) (24 * mDensity);
    }

    private int getNavigationBarHeight() {
        int resourceId = mContext.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        if (resourceId > 0) {
            return mContext.getResources().getDimensionPixelSize(resourceId);
        }
        return (int) (48 * mDensity);
    }

    private int getSafeMinY() {
        return getStatusBarHeight() + (int) (8 * mDensity);
    }

    private int getSafeMaxY() {
        return getScreenHeight() - getNavigationBarHeight() - mButtonSizePx - (int) (8 * mDensity);
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
                        mIsDocked = true;
                        snapToEdge(false);
                        Log.i(TAG, "Bot opened (sleeping, edge-docked state)");
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
                if (mSnapAnimator != null && mSnapAnimator.isRunning()) {
                    mSnapAnimator.cancel();
                }
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
     * Creates the small, fully draggable floating button with edge-docking support.
     */
    private void createFloatingButtonView() {
        FrameLayout buttonLayout = new FrameLayout(mContext);

        // Circular background with vibrant shield border
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(Color.parseColor("#0F172A")); // Dark slate navy
        bg.setStroke((int) (2.5f * mDensity), Color.parseColor("#3B82F6")); // Blue border
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
            buttonLayout.setElevation(12 * mDensity);
        }

        // Layout parameters
        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        mFloatingParams = new WindowManager.LayoutParams(
            mButtonSizePx,
            mButtonSizePx,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );

        mFloatingParams.gravity = Gravity.TOP | Gravity.START;

        // Calculate initial docked position based on saved edge and Y ratio
        int screenW = getScreenWidth();
        int screenH = getScreenHeight();
        int safeY = Math.max(getSafeMinY(), Math.min((int) (screenH * mSavedYRatio), getSafeMaxY()));
        mFloatingParams.y = safeY;

        if (mCurrentDockEdge == DockEdge.LEFT) {
            mFloatingParams.x = - (int) (mButtonSizePx * (1.0f - EDGE_VISIBLE_PERCENTAGE));
        } else {
            mFloatingParams.x = screenW - (int) (mButtonSizePx * EDGE_VISIBLE_PERCENTAGE);
        }

        buttonLayout.setAlpha(DOCKED_ALPHA);
        mIsDocked = true;

        // Free full-screen dragging touch listener with edge docking & tap detection
        final int touchSlop = ViewConfiguration.get(mContext).getScaledTouchSlop();

        buttonLayout.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;
            private boolean isDragging = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        if (mSnapAnimator != null && mSnapAnimator.isRunning()) {
                            mSnapAnimator.cancel();
                        }
                        initialX = mFloatingParams.x;
                        initialY = mFloatingParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        isDragging = false;

                        // Restore full opacity on touch
                        if (mFloatingButtonView != null) {
                            mFloatingButtonView.setAlpha(ACTIVE_ALPHA);
                        }
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float deltaX = event.getRawX() - initialTouchX;
                        float deltaY = event.getRawY() - initialTouchY;

                        if (!isDragging) {
                            // Check if movement exceeds touch slop threshold
                            if (Math.hypot(deltaX, deltaY) > touchSlop) {
                                isDragging = true;
                                mIsDocked = false;
                            }
                        }

                        if (isDragging) {
                            int screenWidth = getScreenWidth();
                            int rawNewX = initialX + (int) deltaX;
                            int rawNewY = initialY + (int) deltaY;

                            // Allow free dragging in all directions (X, Y, diagonally)
                            // During drag, constrain inside visible screen bounds
                            int clampedX = Math.max(0, Math.min(rawNewX, screenWidth - mButtonSizePx));
                            int clampedY = Math.max(getSafeMinY(), Math.min(rawNewY, getSafeMaxY()));

                            mFloatingParams.x = clampedX;
                            mFloatingParams.y = clampedY;
                            updateFloatingViewLayout();
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (!isDragging) {
                            // Tap gesture detected!
                            if (mIsDocked) {
                                restoreFromDockedAndWake();
                            } else {
                                onFloatingBotTapped();
                            }
                        } else {
                            // Drag gesture ended: Snap smoothly to closest horizontal edge
                            snapToEdge(true);
                        }
                        return true;
                }
                return false;
            }
        });

        // Handle screen rotation / orientation changes gracefully
        buttonLayout.addOnLayoutChangeListener(new View.OnLayoutChangeListener() {
            private int mLastWidth = 0;
            private int mLastHeight = 0;

            @Override
            public void onLayoutChange(View v, int left, int top, int right, int bottom,
                                       int oldLeft, int oldTop, int oldRight, int oldBottom) {
                int currentW = getScreenWidth();
                int currentH = getScreenHeight();
                if (mLastWidth != currentW || mLastHeight != currentH) {
                    mLastWidth = currentW;
                    mLastHeight = currentH;
                    if (mIsDocked && mIsFloatingButtonVisible) {
                        snapToEdge(false);
                    }
                }
            }
        });

        mFloatingButtonView = buttonLayout;
    }

    private void updateFloatingViewLayout() {
        if (mIsFloatingButtonVisible && mFloatingButtonView != null && mFloatingParams != null) {
            try {
                mWindowManager.updateViewLayout(mFloatingButtonView, mFloatingParams);
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * Smoothly animates the floating button to snap to the nearest horizontal edge (left or right),
     * preserves the user's vertical Y position, docks 50% outside screen, and dims opacity.
     */
    private void snapToEdge(final boolean animate) {
        if (mFloatingButtonView == null || !mIsFloatingButtonVisible || mFloatingParams == null) {
            return;
        }

        if (mSnapAnimator != null && mSnapAnimator.isRunning()) {
            mSnapAnimator.cancel();
        }

        int screenW = getScreenWidth();
        int currentCenterX = mFloatingParams.x + (mButtonSizePx / 2);
        int screenCenterX = screenW / 2;

        final DockEdge targetEdge = (currentCenterX < screenCenterX) ? DockEdge.LEFT : DockEdge.RIGHT;
        mCurrentDockEdge = targetEdge;

        final int startX = mFloatingParams.x;
        final int targetX = (targetEdge == DockEdge.LEFT)
            ? - (int) (mButtonSizePx * (1.0f - EDGE_VISIBLE_PERCENTAGE))
            : screenW - (int) (mButtonSizePx * EDGE_VISIBLE_PERCENTAGE);

        final float startAlpha = mFloatingButtonView.getAlpha();
        final float targetAlpha = DOCKED_ALPHA;

        // Ensure vertical Y coordinate is safely clamped within screen bounds
        int safeY = Math.max(getSafeMinY(), Math.min(mFloatingParams.y, getSafeMaxY()));
        mFloatingParams.y = safeY;

        if (!animate) {
            mFloatingParams.x = targetX;
            mFloatingButtonView.setAlpha(targetAlpha);
            mIsDocked = true;
            updateFloatingViewLayout();
            savePositionPreference();
            return;
        }

        mSnapAnimator = ValueAnimator.ofFloat(0f, 1f);
        mSnapAnimator.setDuration(SNAP_ANIMATION_DURATION_MS);
        mSnapAnimator.setInterpolator(new DecelerateInterpolator());
        mSnapAnimator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                float fraction = animation.getAnimatedFraction();
                mFloatingParams.x = (int) (startX + (targetX - startX) * fraction);
                if (mFloatingButtonView != null) {
                    mFloatingButtonView.setAlpha(startAlpha + (targetAlpha - startAlpha) * fraction);
                }
                updateFloatingViewLayout();
            }
        });
        mSnapAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                mFloatingParams.x = targetX;
                if (mFloatingButtonView != null) {
                    mFloatingButtonView.setAlpha(targetAlpha);
                }
                mIsDocked = true;
                updateFloatingViewLayout();
                savePositionPreference();
                mSnapAnimator = null;
            }
        });
        mSnapAnimator.start();
    }

    /**
     * When user taps a docked button, smoothly slides it fully onto screen and restores full opacity
     * before opening the manual scanner interface.
     */
    private void restoreFromDockedAndWake() {
        if (mSnapAnimator != null && mSnapAnimator.isRunning()) {
            mSnapAnimator.cancel();
        }

        int screenW = getScreenWidth();
        int paddingPx = (int) (12 * mDensity);

        final int startX = mFloatingParams.x;
        final int targetX = (mCurrentDockEdge == DockEdge.LEFT)
            ? paddingPx
            : screenW - mButtonSizePx - paddingPx;

        final float startAlpha = mFloatingButtonView.getAlpha();
        final float targetAlpha = ACTIVE_ALPHA;

        ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(160);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator animation) {
                float fraction = animation.getAnimatedFraction();
                mFloatingParams.x = (int) (startX + (targetX - startX) * fraction);
                if (mFloatingButtonView != null) {
                    mFloatingButtonView.setAlpha(startAlpha + (targetAlpha - startAlpha) * fraction);
                }
                updateFloatingViewLayout();
            }
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                mFloatingParams.x = targetX;
                if (mFloatingButtonView != null) {
                    mFloatingButtonView.setAlpha(ACTIVE_ALPHA);
                }
                mIsDocked = false;
                updateFloatingViewLayout();
                onFloatingBotTapped();
            }
        });
        animator.start();
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

        int p20 = (int) (20 * mDensity);
        int p16 = (int) (16 * mDensity);
        int p12 = (int) (12 * mDensity);
        int p8 = (int) (8 * mDensity);
        int p4 = (int) (4 * mDensity);

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
        cardBg.setCornerRadius(18 * mDensity);
        cardBg.setStroke((int) (1.5f * mDensity), Color.parseColor("#E2E8F0"));
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
        previewBg.setCornerRadius(8 * mDensity);
        previewBg.setStroke((int) (1 * mDensity), Color.parseColor("#CBD5E1"));
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
        scanBtn.setPadding(p16, (int) (13 * mDensity), p16, (int) (13 * mDensity));

        final GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(Color.parseColor("#94A3B8")); // Disabled gray
        btnBg.setCornerRadius(10 * mDensity);
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
                (int) (180 * mDensity)
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
                itemBg.setCornerRadius(8 * mDensity);
                itemBg.setStroke((int) (1 * mDensity), Color.parseColor("#E2E8F0"));
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
                        previewBg.setStroke((int) (1.5f * mDensity), Color.parseColor("#3B82F6"));

                        // Highlight selected item card
                        for (View otherView : itemViews) {
                            GradientDrawable otherBg = (GradientDrawable) otherView.getBackground();
                            otherBg.setColor(Color.parseColor("#FFFFFF"));
                            otherBg.setStroke((int) (1 * mDensity), Color.parseColor("#E2E8F0"));
                        }
                        itemBg.setColor(Color.parseColor("#F0FDF4"));
                        itemBg.setStroke((int) (1.5f * mDensity), Color.parseColor("#10B981"));

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

        int p24 = (int) (24 * mDensity);
        int p16 = (int) (16 * mDensity);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(p24, p24, p24, p24);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * mDensity);
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
        title.setPadding(0, p16, 0, (int) (6 * mDensity));
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

        int p20 = (int) (20 * mDensity);
        int p16 = (int) (16 * mDensity);
        int p12 = (int) (12 * mDensity);
        int p8 = (int) (8 * mDensity);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(p20, p20, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * mDensity);

        String badgeText;
        String badgeColor;
        String badgeBgColor;
        String explanation;
        int scorePct = (int) Math.round(riskScore * 100);

        if (isHighRisk) {
            badgeText = "⚠️ HIGH RISK (" + scorePct + "%)";
            badgeColor = "#DC2626";
            badgeBgColor = "#FEF2F2";
            cardBg.setStroke((int) (2 * mDensity), Color.parseColor("#EF4444"));
            explanation = "This message may be a scam.\n\nAvoid clicking links or sharing OTPs, passwords, bank details, or money.";
        } else if (isSuspicious) {
            badgeText = "⚠️ SUSPICIOUS (" + scorePct + "%)";
            badgeColor = "#D97706";
            badgeBgColor = "#FFFBEB";
            cardBg.setStroke((int) (1.5f * mDensity), Color.parseColor("#F59E0B"));
            explanation = "This message contains suspicious patterns.\n\nVerify directly with the sender before taking any action.";
        } else {
            badgeText = "✓ LOW RISK";
            badgeColor = "#059669";
            badgeBgColor = "#ECFDF5";
            cardBg.setStroke((int) (1.5f * mDensity), Color.parseColor("#10B981"));
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
        badgeDrawable.setCornerRadius(999 * mDensity);
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
        closeBg.setCornerRadius(10 * mDensity);
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

        int p20 = (int) (20 * mDensity);
        int p12 = (int) (12 * mDensity);

        FrameLayout backdrop = (FrameLayout) mExpandedOverlayView;
        backdrop.removeAllViews();

        LinearLayout card = new LinearLayout(mContext);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(p20, p20, p20, p20);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#FFFFFF"));
        cardBg.setCornerRadius(18 * mDensity);
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
     * Returns the bot back to its sleeping floating-button state docked at the screen edge.
     */
    public void returnToSleepingState() {
        mMainHandler.removeCallbacks(mReturnToSleepRunnable);
        dismissExpandedOverlay();
        mCurrentState = State.SLEEPING;
        mSelectedText = "";

        // Ensure floating button is docked to the edge and dimmed
        snapToEdge(true);
    }
}
