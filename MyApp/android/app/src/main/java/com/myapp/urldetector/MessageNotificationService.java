package com.myapp.urldetector;

import android.app.Notification;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * MessageNotificationService
 *
 * NotificationListenerService that captures ONLY genuine incoming message notifications
 * (SMS, WhatsApp, Telegram, etc.) for fraud analysis.
 *
 * Eliminates false-positives by ensuring arbitrary screen text (ChatGPT conversations,
 * UI text, PDF filenames, browser contents, user typing) is NEVER sent to the fraud pipeline.
 */
public class MessageNotificationService extends NotificationListenerService {

    private static final String TAG = "MessageNotification";

    // Deduplication window: 3 seconds for identical package + sender + text
    private static final int MAX_CACHE_SIZE = 50;
    private static final long DEDUP_WINDOW_MS = 3000;

    private static final Map<String, Long> sProcessedMessages =
            Collections.synchronizedMap(new LinkedHashMap<String, Long>(MAX_CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_CACHE_SIZE;
                }
            });

    // Known messaging package IDs to guarantee coverage even if notification category is omitted
    private static final Set<String> KNOWN_MESSAGING_PACKAGES;
    static {
        Set<String> pkgs = new HashSet<>();
        pkgs.add("com.google.android.apps.messaging"); // Google Messages (SMS/RCS)
        pkgs.add("com.samsung.android.messaging");      // Samsung Messages
        pkgs.add("com.whatsapp");                      // WhatsApp
        pkgs.add("com.whatsapp.w4b");                  // WhatsApp Business
        pkgs.add("org.telegram.messenger");            // Telegram
        pkgs.add("org.telegram.plus");                 // Telegram Plus
        pkgs.add("com.facebook.orca");                 // Messenger
        pkgs.add("org.thoughtcrime.securesms");         // Signal
        pkgs.add("com.viber.voip");                    // Viber
        pkgs.add("com.skype.raider");                  // Skype
        pkgs.add("com.discord");                       // Discord
        pkgs.add("com.truecaller");                    // Truecaller SMS
        pkgs.add("com.android.mms");                   // AOSP default SMS
        KNOWN_MESSAGING_PACKAGES = Collections.unmodifiableSet(pkgs);
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "NotificationListenerService connected and active");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) {
            return;
        }

        try {
            String packageName = sbn.getPackageName();
            if (packageName == null) {
                return;
            }

            // 1. Ignore our own app's notifications to prevent infinite loops
            String myPackage = getApplicationContext().getPackageName();
            if (packageName.equals(myPackage)) {
                return;
            }

            Notification notification = sbn.getNotification();

            // 2. Ignore ongoing / non-clearable notifications (media player, downloads, active calls)
            if (sbn.isOngoing() || (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) {
                return;
            }

            // 3. Verify that this is an incoming message notification
            if (!isIncomingMessageNotification(notification, packageName)) {
                return;
            }

            // 4. Extract message text and sender
            Bundle extras = notification.extras;
            if (extras == null) {
                return;
            }

            CharSequence titleSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
            if (TextUtils.isEmpty(titleSeq)) {
                titleSeq = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
            }
            if (TextUtils.isEmpty(titleSeq)) {
                titleSeq = extras.getCharSequence("android.title.big");
            }
            String sender = titleSeq != null ? titleSeq.toString().trim() : "Unknown";

            CharSequence textSeq = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (TextUtils.isEmpty(textSeq)) {
                textSeq = extras.getCharSequence(Notification.EXTRA_TEXT);
            }

            // Fallback 1: MessagingStyle messages bundle (can be List<Bundle> or Object[])
            if (TextUtils.isEmpty(textSeq) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                Object messagesObj = extras.get("android.messages");
                if (messagesObj instanceof List) {
                    List<?> messages = (List<?>) messagesObj;
                    if (!messages.isEmpty()) {
                        Object lastMsg = messages.get(messages.size() - 1);
                        if (lastMsg instanceof Bundle) {
                            CharSequence msgText = ((Bundle) lastMsg).getCharSequence("text");
                            if (!TextUtils.isEmpty(msgText)) {
                                textSeq = msgText;
                            }
                        }
                    }
                } else if (messagesObj instanceof Object[]) {
                    Object[] messages = (Object[]) messagesObj;
                    if (messages.length > 0) {
                        Object lastMsg = messages[messages.length - 1];
                        if (lastMsg instanceof Bundle) {
                            CharSequence msgText = ((Bundle) lastMsg).getCharSequence("text");
                            if (!TextUtils.isEmpty(msgText)) {
                                textSeq = msgText;
                            }
                        }
                    }
                }
            }

            // Fallback 2: EXTRA_TEXT_LINES (InboxStyle multi-line messages)
            if (TextUtils.isEmpty(textSeq)) {
                CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if (lines != null && lines.length > 0) {
                    CharSequence lastLine = lines[lines.length - 1];
                    if (!TextUtils.isEmpty(lastLine)) {
                        textSeq = lastLine;
                    }
                }
            }

            // Fallback 3: notification.tickerText (e.g. "Sender: Congratulations! ...")
            if (TextUtils.isEmpty(textSeq) && notification.tickerText != null) {
                String ticker = notification.tickerText.toString().trim();
                int colonIdx = ticker.indexOf(':');
                if (colonIdx != -1 && colonIdx < ticker.length() - 1) {
                    textSeq = ticker.substring(colonIdx + 1).trim();
                    if ("Unknown".equals(sender)) {
                        sender = ticker.substring(0, colonIdx).trim();
                    }
                } else {
                    textSeq = ticker;
                }
            }

            if (TextUtils.isEmpty(textSeq)) {
                return;
            }

            String messageText = textSeq.toString().trim();
            if (messageText.length() == 0) {
                return;
            }

            // 5. Deduplication: skip if identical message was processed recently
            String dedupKey = packageName + "|" + sender + "|" + messageText;
            long now = System.currentTimeMillis();
            Long lastProcessed = sProcessedMessages.get(dedupKey);
            if (lastProcessed != null && (now - lastProcessed < DEDUP_WINDOW_MS)) {
                return;
            }
            sProcessedMessages.put(dedupKey, now);

            Log.i(TAG, "Incoming message captured from " + packageName + " (" + sender + "): " + messageText);

            // 6. Emit structured event to React Native
            ReactApplicationContext reactContext = AccessibilityBridgeModule.getReactContextInstance();
            if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
                WritableMap event = Arguments.createMap();
                event.putString("packageName", packageName);
                event.putString("sender", sender);
                event.putString("text", messageText);
                event.putDouble("timestamp", sbn.getPostTime());
                event.putString("notificationKey", sbn.getKey() != null ? sbn.getKey() : "");

                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("onIncomingMessage", event);
                Log.d(TAG, "Emitted onIncomingMessage to React Native");
            } else {
                Log.w(TAG, "ReactContext not available or catalyst not active yet");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing incoming notification", e);
        }
    }

    /**
     * Identifies whether the notification represents an incoming message.
     * Uses Android's native classification (category and styles) plus known messaging apps.
     */
    private boolean isIncomingMessageNotification(Notification notification, String packageName) {
        if (packageName == null) return false;
        String lowerPkg = packageName.toLowerCase();

        // Standard Android category for messages
        if (Notification.CATEGORY_MESSAGE.equals(notification.category)) {
            return true;
        }

        // MessagingStyle extras
        if (notification.extras != null) {
            if (notification.extras.containsKey("android.messagingStyle")
                    || notification.extras.containsKey(Notification.EXTRA_MESSAGING_PERSON)
                    || notification.extras.containsKey("android.messages")
                    || notification.extras.containsKey("android.conversationTitle")) {
                return true;
            }
        }

        // Known messaging package or pattern match
        if (KNOWN_MESSAGING_PACKAGES.contains(packageName)
                || lowerPkg.contains("whatsapp")
                || lowerPkg.contains("messaging")
                || lowerPkg.contains("telegram")
                || lowerPkg.contains("signal")
                || lowerPkg.contains("mms")) {
            return true;
        }

        return false;
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // No action needed on dismiss
    }
}
