package com.myapp.urldetector;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.accessibility.AccessibilityManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

import java.util.List;

/**
 * AccessibilityBridgeModule
 *
 * React Native Java bridge for querying AccessibilityService and Overlay permission states
 * and opening Android system settings.
 */
public class AccessibilityBridgeModule extends ReactContextBaseJavaModule {

    public static final String NAME = "AccessibilityBridgeModule";

    private static ReactApplicationContext sReactContext;

    public AccessibilityBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        sReactContext = reactContext;
    }

    public static ReactApplicationContext getReactContextInstance() {
        return sReactContext;
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void isAccessibilityServiceEnabled(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AccessibilityManager am = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (am == null) {
                promise.resolve(false);
                return;
            }

            List<AccessibilityServiceInfo> enabledServices = am.getEnabledAccessibilityServiceList(
                AccessibilityServiceInfo.FEEDBACK_GENERIC | AccessibilityServiceInfo.FEEDBACK_ALL_MASK
            );

            String expectedPackage = context.getPackageName();
            boolean isEnabled = false;

            if (enabledServices != null) {
                for (AccessibilityServiceInfo service : enabledServices) {
                    if (service != null && service.getId() != null && service.getId().contains(expectedPackage)) {
                        isEnabled = true;
                        break;
                    }
                }
            }

            // Fallback check through Secure Settings
            if (!isEnabled) {
                String settingValue = Settings.Secure.getString(
                    context.getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                );
                if (settingValue != null && settingValue.contains(expectedPackage)) {
                    isEnabled = true;
                }
            }

            promise.resolve(isEnabled);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void openAccessibilitySettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isOverlayPermissionGranted(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(Settings.canDrawOverlays(context));
            } else {
                promise.resolve(true);
            }
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void openOverlaySettings(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + context.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isNotificationListenerEnabled(Promise promise) {
        try {
            Context context = getReactApplicationContext();
            String packageName = context.getPackageName();
            String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
            boolean enabled = flat != null && flat.contains(packageName);
            promise.resolve(enabled);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void openNotificationListenerSettings(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SETTINGS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void showFraudOverlay(String title, String explanation, String suspiciousContent, Promise promise) {
        try {
            OverlayManager.getInstance(getReactApplicationContext()).showCustomOverlay(title, explanation, "SUSPICIOUS CONTENT:", suspiciousContent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("OVERLAY_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void showFloatingBot(Promise promise) {
        try {
            FloatingScannerManager.getInstance(getReactApplicationContext()).showFloatingBot();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("FLOATING_BOT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void hideFloatingBot(Promise promise) {
        try {
            FloatingScannerManager.getInstance(getReactApplicationContext()).hideFloatingBot();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("FLOATING_BOT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isFloatingBotVisible(Promise promise) {
        try {
            boolean visible = FloatingScannerManager.getInstance(getReactApplicationContext()).isFloatingBotVisible();
            promise.resolve(visible);
        } catch (Exception e) {
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void reportManualScanResult(ReadableMap result, Promise promise) {
        try {
            FloatingScannerManager.getInstance(getReactApplicationContext()).showScanResult(result);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("RESULT_ERROR", e.getMessage());
        }
    }
}
