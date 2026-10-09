package com.myapp.urldetector;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.io.IOException;

/**
 * OcrModule
 *
 * Provides on-device OCR text extraction and screenshot selection for FraudShield:
 * - Device gallery screenshot picking via system ACTION_GET_CONTENT
 * - 100% on-device Google ML Kit text recognition (private, zero external transmission)
 */
public class OcrModule extends ReactContextBaseJavaModule {

    public static final String NAME = "OcrModule";
    private static final String TAG = "FraudShield OCR";
    private static final int REQUEST_PICK_SCREENSHOT = 8844;

    private Promise mPickerPromise;

    private final ActivityEventListener mActivityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode == REQUEST_PICK_SCREENSHOT) {
                if (mPickerPromise != null) {
                    if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                        Uri selectedImageUri = data.getData();
                        WritableMap map = Arguments.createMap();
                        map.putString("uri", selectedImageUri.toString());
                        mPickerPromise.resolve(map);
                    } else {
                        // User cancelled selection
                        mPickerPromise.resolve(null);
                    }
                    mPickerPromise = null;
                }
            }
        }
    };

    public OcrModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(mActivityEventListener);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    /**
     * Opens system photo picker to select a message screenshot from gallery.
     */
    @ReactMethod
    public void pickScreenshot(Promise promise) {
        Activity currentActivity = getCurrentActivity();
        if (currentActivity == null) {
            promise.reject("ACTIVITY_UNAVAILABLE", "Activity is not available to select an image");
            return;
        }

        mPickerPromise = promise;

        try {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("image/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            Intent chooser = Intent.createChooser(intent, "Select Message Screenshot");
            currentActivity.startActivityForResult(chooser, REQUEST_PICK_SCREENSHOT);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start image picker: " + e.getMessage(), e);
            mPickerPromise = null;
            promise.reject("PICKER_ERROR", e.getMessage());
        }
    }

    /**
     * Recognizes and extracts text from an image URI using Google ML Kit on-device.
     */
    @ReactMethod
    public void recognizeText(String imageUriString, Promise promise) {
        try {
            if (imageUriString == null || imageUriString.trim().isEmpty()) {
                promise.reject("INVALID_URI", "Screenshot image URI cannot be empty");
                return;
            }

            Uri uri = Uri.parse(imageUriString);
            ReactApplicationContext context = getReactApplicationContext();

            InputImage image;
            try {
                image = InputImage.fromFilePath(context, uri);
            } catch (IOException ioException) {
                Log.e(TAG, "Could not load image from URI: " + ioException.getMessage(), ioException);
                promise.reject("IMAGE_LOAD_ERROR", "Could not read the selected image file: " + ioException.getMessage());
                return;
            }

            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);

            recognizer.process(image)
                .addOnSuccessListener(visionText -> {
                    String fullText = visionText.getText();
                    WritableMap resultMap = Arguments.createMap();
                    resultMap.putString("text", fullText != null ? fullText : "");
                    resultMap.putInt("blockCount", visionText.getTextBlocks() != null ? visionText.getTextBlocks().size() : 0);
                    Log.i(TAG, "OCR successfully extracted " + (fullText != null ? fullText.length() : 0) + " characters");
                    promise.resolve(resultMap);
                })
                .addOnFailureListener(e -> {
                    Log.e(TAG, "ML Kit OCR failed: " + e.getMessage(), e);
                    promise.reject("OCR_FAILURE", "Failed to extract text from screenshot: " + e.getMessage());
                });

        } catch (Exception e) {
            Log.e(TAG, "Unexpected error in recognizeText: " + e.getMessage(), e);
            promise.reject("UNEXPECTED_ERROR", e.getMessage());
        }
    }
}
