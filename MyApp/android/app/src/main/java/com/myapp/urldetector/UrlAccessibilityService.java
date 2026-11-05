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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * UrlAccessibilityService
 *
 * Android AccessibilityService implemented in pure Java:
 * 1. Inspects visible node trees to detect unencrypted HTTP URLs and trigger overlay alerts.
 * 2. Monitors web browsers (Google Chrome, Edge, Samsung Internet, Firefox, Brave, etc.)
 *    for sensitive permission requests (Camera, Microphone, Precise & Approximate Location).
 * 3. Reads on-screen text messages from active messaging applications (WhatsApp, SMS, Google Messages)
 *    prioritizing recent messages for AI fraud evaluation.
 * 4. Provides on-demand accessible text extraction for the FraudShield manual scanner.
 */
public class UrlAccessibilityService extends AccessibilityService {

    private static final String TAG = "UrlAccessibilityService";
    private static UrlAccessibilityService sInstance;

    public static UrlAccessibilityService getInstance() {
        return sInstance;
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;
        Log.i(TAG, "UrlAccessibilityService connected and ready");
    }

    // Duplicate suppression window for URLs (3 seconds cooldown)
    private static final long URL_COOLDOWN_MS = 3000;
    private String lastDetectedUrl = "";
    private long lastDetectedTimestamp = 0;

    // Cooldown cache for text emitted to the fraud pipeline (3-second deduplication)
    private static final int MAX_CACHE_SIZE = 50;
    private static final long TEXT_COOLDOWN_MS = 3000;

    private static final Map<String, Long> sSeenTexts =
            Collections.synchronizedMap(new LinkedHashMap<String, Long>(MAX_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    // Cooldown cache for detected website permission requests (8-second deduplication)
    private static final long PERMISSION_COOLDOWN_MS = 8000;
    private static final Map<String, Long> sSeenPermissions =
            Collections.synchronizedMap(new LinkedHashMap<String, Long>(MAX_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    // Known trusted domain list for instant trust level assessment
    private static final Set<String> TRUSTED_DOMAINS = new HashSet<>();
    static {
        TRUSTED_DOMAINS.add("google.com");
        TRUSTED_DOMAINS.add("meet.google.com");
        TRUSTED_DOMAINS.add("zoom.us");
        TRUSTED_DOMAINS.add("teams.microsoft.com");
        TRUSTED_DOMAINS.add("webex.com");
        TRUSTED_DOMAINS.add("canarabank.in");
        TRUSTED_DOMAINS.add("onlinesbi.sbi");
        TRUSTED_DOMAINS.add("hdfcbank.com");
        TRUSTED_DOMAINS.add("icicibank.com");
        TRUSTED_DOMAINS.add("axisbank.com");
        TRUSTED_DOMAINS.add("github.com");
        TRUSTED_DOMAINS.add("wikipedia.org");
        TRUSTED_DOMAINS.add("apple.com");
        TRUSTED_DOMAINS.add("microsoft.com");
        TRUSTED_DOMAINS.add("youtube.com");
    }

    private static final Pattern DOMAIN_PATTERN =
            Pattern.compile("(?i)(?:https?://)?(?:www\\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\\.[a-zA-Z]{2,}(?::\\d+)?)(?:/[^\\s]*)?");

    /**
     * Internal representation of on-screen text elements with screen coordinates
     * used for bottom-to-top traversal sorting.
     */
    private static class NodeTextElement {
        final String text;
        final String description;
        final String viewId;
        final int bottomY;
        final int topY;
        final boolean isEditable;
        final boolean isEditText;

        NodeTextElement(String text, String description, String viewId, int bottomY, int topY, boolean isEditable, boolean isEditText) {
            this.text = text;
            this.description = description;
            this.viewId = viewId;
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
                    // 1. If active app is a browser, inspect for website permission requests
                    if (isBrowserApp(packageName)) {
                        inspectBrowserForPermissions(rootNode, packageName);
                    }

                    // 2. Inspect window text bottom-to-top for HTTP URLs and fraud messages
                    inspectWindowBottomToTop(rootNode, packageName);
                }
                rootNode.recycle();
            }
        } catch (Exception ignored) {
            // Defensive: ensure accessibility event processing never throws unhandled crashes
        }
    }

    /**
     * Checks if the package corresponds to a supported browser application.
     */
    private boolean isBrowserApp(String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return false;
        }
        String pkgLower = packageName.toLowerCase(Locale.ROOT);
        return pkgLower.contains("chrome") ||
               pkgLower.contains("browser") ||
               pkgLower.contains("firefox") ||
               pkgLower.contains("opera") ||
               pkgLower.equals("com.sec.android.app.sbrowser") ||
               pkgLower.equals("com.microsoft.emmx") ||
               pkgLower.equals("com.brave.browser") ||
               pkgLower.equals("com.kiwibrowser.browser") ||
               pkgLower.equals("com.google.android.browser") ||
               pkgLower.equals("com.android.browser");
    }

    /**
     * Inspects browser window for permission dialogs requesting Camera, Microphone, or Location.
     */
    private void inspectBrowserForPermissions(AccessibilityNodeInfo rootNode, String packageName) {
        if (rootNode == null) {
            return;
        }

        List<NodeTextElement> elements = new ArrayList<>();
        collectTextElements(rootNode, elements);

        if (elements.isEmpty()) {
            return;
        }

        String matchedPromptText = null;
        String permissionType = null;
        String addressBarUrl = null;

        // Traverse elements to detect permission prompt phrases and browser address bar
        for (NodeTextElement el : elements) {
            String text = el.text != null ? el.text.trim() : "";
            String lower = text.toLowerCase(Locale.ROOT);
            String viewId = el.viewId != null ? el.viewId.toLowerCase(Locale.ROOT) : "";

            // Check for browser URL bar to capture the active website
            if (addressBarUrl == null) {
                if (viewId.contains("url_bar") || viewId.contains("location_bar") || viewId.contains("address")) {
                    addressBarUrl = text;
                } else if (text.startsWith("http://") || text.startsWith("https://")) {
                    addressBarUrl = text;
                }
            }

            // Check for permission prompt phrasing
            boolean isCamera = lower.contains("camera") || lower.contains("take pictures") || lower.contains("record video");
            boolean isMic = lower.contains("microphone") || lower.contains("record audio") || lower.contains("mic");
            boolean isLocation = lower.contains("location") || lower.contains("know your location") || lower.contains("device's location");

            boolean isPrompt = lower.contains("wants to") ||
                               lower.contains("permission") ||
                               lower.contains("allow") ||
                               lower.contains("access to") ||
                               lower.contains("requesting access");

            if (isPrompt && (isCamera || isMic || isLocation)) {
                matchedPromptText = text;
                if (isCamera && isMic) {
                    permissionType = "camera & microphone";
                } else if (isCamera) {
                    permissionType = "camera";
                } else if (isMic) {
                    permissionType = "microphone";
                } else {
                    permissionType = "location";
                }
                break;
            }
        }

        if (matchedPromptText == null || permissionType == null) {
            return;
        }

        // Extract domain from prompt text or address bar
        String domain = extractDomain(matchedPromptText);
        if (domain == null && addressBarUrl != null) {
            domain = extractDomain(addressBarUrl);
        }
        if (domain == null) {
            domain = "Active Website";
        }

        String fullUrl = addressBarUrl != null ? addressBarUrl : ("https://" + domain);

        // Deduplication & Debouncing check
        long now = System.currentTimeMillis();
        String cacheKey = domain.toLowerCase(Locale.ROOT) + "#" + permissionType;
        Long lastSeen = sSeenPermissions.get(cacheKey);
        if (lastSeen != null && (now - lastSeen < PERMISSION_COOLDOWN_MS)) {
            return;
        }
        sSeenPermissions.put(cacheKey, now);

        // Evaluate Trust Level
        String trustLevel = evaluateTrustLevel(domain, fullUrl);

        // Generate tailored educational security explanation
        String explanation = buildPermissionExplanation(permissionType, domain, trustLevel);

        String browserFriendlyName = getFriendlyBrowserName(packageName);

        Log.i(TAG, "🛡️ Detected Website Permission Request: " + permissionType + " on " + domain + " (" + trustLevel + ")");

        // 1. Emit event to React Native bridge for history logging & active UI update
        try {
            ReactApplicationContext reactContext = AccessibilityBridgeModule.getReactContextInstance();
            if (reactContext != null) {
                WritableMap event = Arguments.createMap();
                event.putString("domain", domain);
                event.putString("url", fullUrl);
                event.putString("permissionType", permissionType);
                event.putString("trustLevel", trustLevel);
                event.putString("browser", browserFriendlyName);
                event.putString("explanation", explanation);
                event.putDouble("timestamp", now);

                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onWebsitePermissionRequest", event);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error emitting website permission event to React Native", e);
        }

        // 2. Display non-intrusive native FraudShield security overlay
        OverlayManager overlayManager = OverlayManager.getInstance(getApplicationContext());
        overlayManager.showWebsitePermissionAlert(domain, fullUrl, permissionType, trustLevel, explanation, browserFriendlyName);
    }

    /**
     * Extracts domain name from a URL or prompt string.
     */
    private String extractDomain(String text) {
        if (TextUtils.isEmpty(text)) return null;
        Matcher m = DOMAIN_PATTERN.matcher(text);
        if (m.find()) {
            String domain = m.group(1);
            if (!TextUtils.isEmpty(domain)) {
                // Filter out common false-positive words
                String dLower = domain.toLowerCase(Locale.ROOT);
                if (!dLower.equals("wants.to") && !dLower.equals("allow.to") && dLower.contains(".")) {
                    return domain;
                }
            }
        }
        return null;
    }

    /**
     * Evaluates domain trust level (VERIFIED vs SUSPICIOUS vs UNKNOWN).
     */
    private String evaluateTrustLevel(String domain, String url) {
        if (domain == null) return "UNKNOWN";
        String dLower = domain.toLowerCase(Locale.ROOT);

        // Check if unencrypted HTTP
        if (url != null && url.startsWith("http://")) {
            return "SUSPICIOUS";
        }

        // Check known trusted list
        for (String trusted : TRUSTED_DOMAINS) {
            if (dLower.equals(trusted) || dLower.endsWith("." + trusted)) {
                return "VERIFIED";
            }
        }

        // Check IP address or obvious phishing keywords
        if (domain.matches("^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$") ||
            dLower.contains("kyc-") ||
            dLower.contains("free-prize") ||
            dLower.contains("reward-claim")) {
            return "SUSPICIOUS";
        }

        return "UNKNOWN";
    }

    /**
     * Builds educational, non-alarmist explanation tailored to the requested permission.
     */
    private String buildPermissionExplanation(String permissionType, String domain, String trustLevel) {
        String perm = permissionType != null ? permissionType.toLowerCase(Locale.ROOT) : "";

        if (perm.contains("camera")) {
            return "Camera permission allows this website to stream video and capture photos while the page is open. Legitimate sites use this for video calls or KYC verification. Be cautious if an unfamiliar website asks for camera access.";
        } else if (perm.contains("mic") || perm.contains("audio")) {
            return "Microphone permission allows this website to record room audio and conversations. While normal for voice calls, unverified sites can harvest ambient audio without your awareness.";
        } else if (perm.contains("location")) {
            return "Location permission shares your precise physical GPS coordinates. Normal for maps, delivery, and branch finders, but unknown websites can use it for physical profiling and ad-tracking.";
        } else {
            return "This website is requesting access to sensitive device sensors. Always consider whether this site genuinely requires this access before granting.";
        }
    }

    private String getFriendlyBrowserName(String packageName) {
        if (packageName == null) return "Browser";
        String p = packageName.toLowerCase(Locale.ROOT);
        if (p.contains("chrome")) return "Google Chrome";
        if (p.contains("sbrowser")) return "Samsung Internet";
        if (p.contains("firefox")) return "Mozilla Firefox";
        if (p.contains("emmx")) return "Microsoft Edge";
        if (p.contains("brave")) return "Brave Browser";
        if (p.contains("opera")) return "Opera Browser";
        return "Web Browser";
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
            String viewId = node.getViewIdResourceName();

            String text = (textSeq != null && textSeq.length() > 0) ? textSeq.toString() : null;
            String desc = (descSeq != null && descSeq.length() > 0) ? descSeq.toString() : null;

            if (text != null || desc != null) {
                Rect bounds = new Rect();
                node.getBoundsInScreen(bounds);
                elements.add(new NodeTextElement(text, desc, viewId, bounds.bottom, bounds.top, isEditable, isEditText));
            }

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
     */
    private boolean isWhatsAppOrMessagingApp(String packageName) {
        if (packageName == null || packageName.isEmpty()) {
            return false;
        }
        String pkgLower = packageName.toLowerCase(Locale.ROOT);

        if (pkgLower.contains("whatsapp")) {
            return true;
        }

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
     */
    private void processScreenTextForFraud(CharSequence text, String packageName) {
        if (text == null || !isWhatsAppOrMessagingApp(packageName)) return;
        String textString = text.toString().trim();

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

            if (overlayManager.isSnoozed(url)) {
                continue;
            }

            if (url.equals(lastDetectedUrl) && (now - lastDetectedTimestamp < URL_COOLDOWN_MS)) {
                continue;
            }

            lastDetectedUrl = url;
            lastDetectedTimestamp = now;

            overlayManager.showOverlay(url);
            break;
        }
    }

    /**
     * Extracts currently visible, readable text snippets from the active window
     * on-demand for manual scanning in the FraudShield floating bot.
     */
    public List<String> getVisibleScreenTexts() {
        List<String> result = new ArrayList<>();
        try {
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode == null) {
                return result;
            }

            List<NodeTextElement> elements = new ArrayList<>();
            collectTextElements(rootNode, elements);
            rootNode.recycle();

            Collections.sort(elements, new Comparator<NodeTextElement>() {
                @Override
                public int compare(NodeTextElement a, NodeTextElement b) {
                    return Integer.compare(b.bottomY, a.bottomY);
                }
            });

            Set<String> seen = new HashSet<>();
            for (NodeTextElement el : elements) {
                if (el.text != null) {
                    String trimmed = el.text.trim();
                    if (trimmed.length() >= 4 && !seen.contains(trimmed)) {
                        seen.add(trimmed);
                        result.add(trimmed);
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error extracting screen text for manual scan", e);
        }
        return result;
    }

    public String getActivePackageName() {
        try {
            AccessibilityNodeInfo rootNode = getRootInActiveWindow();
            if (rootNode != null) {
                CharSequence pkg = rootNode.getPackageName();
                rootNode.recycle();
                return pkg != null ? pkg.toString() : "";
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sInstance = null;
        try {
            OverlayManager.getInstance(getApplicationContext()).dismissOverlay();
        } catch (Exception ignored) {
        }
    }
}
