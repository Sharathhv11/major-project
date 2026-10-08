package com.myapp.urldetector;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Rect;
import android.text.TextUtils;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * UrlAccessibilityService
 *
 * Android AccessibilityService implemented in pure Java.
 * 1. Inspects visible node trees to detect unencrypted HTTP URLs and trigger overlay alerts.
 * 2. Reads on-screen text messages from active applications (excluding our own app and active keyboard typing)
 *    from BOTTOM to TOP (prioritizing the newest incoming messages at the bottom of WhatsApp/SMS)
 *    and forwards them directly to the React Native bridge for AI fraud score evaluation.
 */
public class UrlAccessibilityService extends AccessibilityService {

    private static final String TAG = "UrlAccessibilityService";

    // Duplicate suppression window for URLs
    private static final long URL_COOLDOWN_MS = 5000;

    private String lastDetectedUrl = "";
    private long lastDetectedTimestamp = 0;

    // Cooldown cache for text emitted to the fraud pipeline (10-second deduplication)
    private static final int MAX_CACHE_SIZE = 50;
    private static final long TEXT_COOLDOWN_MS = 10000;

    private static final Map<String, Long> sSeenTexts =
            Collections.synchronizedMap(new LinkedHashMap<String, Long>(MAX_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    /**
     * Internal representation of on-screen text elements with screen coordinates
     * used for bottom-to-top traversal sorting.
     */
    private static class NodeTextElement {
        final String text;
        final String description;
        final int bottomY;
        final int topY;
        final boolean isEditable;
        final boolean isEditText;

        NodeTextElement(String text, String description, int bottomY, int topY, boolean isEditable, boolean isEditText) {
            this.text = text;
            this.description = description;
            this.bottomY = bottomY;
            this.topY = topY;
            this.isEditable = isEditable;
            this.isEditText = isEditText;
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) {
            return;
        }

        try {
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode == null) {
                rootNode = event.getSource();
            }

            if (rootNode != null) {
                CharSequence pkgSeq = rootNode.getPackageName();
                String packageName = pkgSeq != null ? pkgSeq.toString() : "";

                // Never analyze our own app
                String myPackage = getApplicationContext().getPackageName();
                if (!myPackage.equals(packageName)) {
                    inspectWindowBottomToTop(rootNode, packageName);
                }
                rootNode.recycle();
            }
        } catch (Exception ignored) {
            // Defensive: ensure accessibility event processing never throws unhandled crashes
        }
    }

    /**
     * Inspects visible on-screen nodes from BOTTOM to TOP.
     * In messaging apps (WhatsApp, SMS, Google Messages), newer messages are displayed
     * at the bottom of the conversation window. Sorting and traversing from bottom to top
     * ensures recent incoming messages are prioritized for fraud analysis and URL detection.
     */
    private void inspectWindowBottomToTop(AccessibilityNodeInfo rootNode, String packageName) {
        if (rootNode == null) {
            return;
        }

        List<NodeTextElement> elements = new ArrayList<>();
        collectTextElements(rootNode, elements);

        if (elements.isEmpty()) {
            return;
        }

        // Sort elements strictly from bottom to top based on screen Y coordinates.
        // Elements near the bottom of the screen (larger bottomY) appear first.
        Collections.sort(elements, new Comparator<NodeTextElement>() {
            @Override
            public int compare(NodeTextElement a, NodeTextElement b) {
                int cmp = Integer.compare(b.bottomY, a.bottomY);
                if (cmp != 0) {
                    return cmp;
                }
                return Integer.compare(b.topY, a.topY);
            }
        });

        // Process elements in prioritized bottom-to-top order
        for (NodeTextElement element : elements) {
            if (element.text != null && element.text.length() > 0) {
                // 1. Check for insecure HTTP URLs
                processTextForUrls(element.text);

                // 2. Read on-screen text for AI fraud evaluation (restricted strictly to WhatsApp and Messages apps)
                if (!element.isEditable && !element.isEditText && isWhatsAppOrMessagingApp(packageName)) {
                    processScreenTextForFraud(element.text, packageName);
                }
            }

            // Check accessibility content description for HTTP URLs
            if (element.description != null && element.description.length() > 0) {
                processTextForUrls(element.description);
            }
        }
    }

    /**
     * Traverses the accessibility node tree and extracts all text-bearing nodes
     * along with their on-screen vertical bounding coordinates.
     * Children are traversed in reverse order (bottom-most child index first).
     */
    private void collectTextElements(AccessibilityNodeInfo node, List<NodeTextElement> elements) {
        if (node == null) {
            return;
        }

        try {
            boolean isEditable = node.isEditable();
            CharSequence className = node.getClassName();
            boolean isEditText = className != null && className.toString().contains("EditText");

            CharSequence textSeq = node.getText();
            CharSequence descSeq = node.getContentDescription();

            String text = (textSeq != null && textSeq.length() > 0) ? textSeq.toString() : null;
            String desc = (descSeq != null && descSeq.length() > 0) ? descSeq.toString() : null;

            if (text != null || desc != null) {
                Rect bounds = new Rect();
                node.getBoundsInScreen(bounds);
                elements.add(new NodeTextElement(text, desc, bounds.bottom, bounds.top, isEditable, isEditText));
            }

            // Traverse child nodes in reverse order (bottom-most child first)
            int childCount = node.getChildCount();
            for (int i = childCount - 1; i >= 0; i--) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    collectTextElements(child, elements);
                    child.recycle();
                }
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Checks if the package corresponds to WhatsApp or an SMS/Messaging application.
     * Restricts screen text inspection strictly to these target communication channels.
     */
    private boolean isWhatsAppOrMessagingApp(String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return false;
        }
        String pkgLower = packageName.toLowerCase();

        // 1. WhatsApp / WhatsApp Business
        if (pkgLower.contains("whatsapp")) {
            return true;
        }

        // 2. SMS and standard messaging applications (Google Messages, Samsung, AOSP, OEM MMS apps)
        if (pkgLower.contains("messaging") ||
            pkgLower.contains("mms") ||
            pkgLower.contains("message") ||
            pkgLower.equals("com.truecaller") ||
            pkgLower.equals("com.google.android.apps.messaging") ||
            pkgLower.equals("com.samsung.android.messaging") ||
            pkgLower.equals("com.android.mms")) {
            return true;
        }

        return false;
    }

    /**
     * Forwards on-screen text directly to React Native to evaluate with the AI model.
     * Restricted strictly to WhatsApp and SMS/Messages apps.
     */
    private void processScreenTextForFraud(CharSequence text, String packageName) {
        if (text == null || !isWhatsAppOrMessagingApp(packageName)) return;
        String textString = text.toString().trim();

        // Skip very short strings (single words, symbols, timestamps) to avoid spamming the model
        if (textString.length() < 10) {
            return;
        }

        long now = System.currentTimeMillis();
        Long lastSeen = sSeenTexts.get(textString);
        if (lastSeen != null && (now - lastSeen < TEXT_COOLDOWN_MS)) {
            return;
        }
        sSeenTexts.put(textString, now);

        try {
            ReactApplicationContext reactContext = AccessibilityBridgeModule.getReactContextInstance();
            if (reactContext != null) {
                WritableMap event = Arguments.createMap();
                event.putString("text", textString);
                event.putString("packageName", packageName);
                event.putString("sender", "Screen");
                event.putDouble("timestamp", now);

                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onIncomingMessage", event);
                Log.i(TAG, "Forwarded screen text to AI fraud engine: " + (textString.length() > 50 ? textString.substring(0, 50) + "..." : textString));
            }
        } catch (Exception e) {
            Log.e(TAG, "Error emitting screen text to JS", e);
        }
    }

    /**
     * Extracts URLs from given text and enforces duplicate/snooze checks before showing the overlay alert.
     */
    private void processTextForUrls(CharSequence text) {
        if (text == null) return;
        String textString = text.toString().trim();
        if (textString.length() == 0) return;

        List<String> detectedUrls = UrlDetector.extractUrls(text);
        if (detectedUrls == null || detectedUrls.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        OverlayManager overlayManager = OverlayManager.getInstance(getApplicationContext());

        for (String url : detectedUrls) {
            if (TextUtils.isEmpty(url)) {
                continue;
            }

            // 1. Check if this URL or alerts are currently snoozed
            if (overlayManager.isSnoozed(url)) {
                continue;
            }

            // 2. Duplicate cooldown check: ignore identical URL within cooldown window
            if (url.equals(lastDetectedUrl) && (now - lastDetectedTimestamp < URL_COOLDOWN_MS)) {
                continue;
            }

            // Record latest detection
            lastDetectedUrl = url;
            lastDetectedTimestamp = now;

            // Trigger immediate native overlay over active app
            overlayManager.showOverlay(url);
            break;
        }
    }

    @Override
    public void onInterrupt() {
        // No-op
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        try {
            OverlayManager.getInstance(getApplicationContext()).dismissOverlay();
        } catch (Exception ignored) {
        }
    }
}
