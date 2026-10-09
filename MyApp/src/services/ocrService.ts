/**
 * FraudShield OCR Service
 *
 * Provides on-device OCR extraction and screenshot picking via the native Android OcrModule.
 * Ensures complete privacy: Screenshot image data stays strictly on the local device,
 * and only the extracted textual content is analyzed for fraud.
 */

import { NativeModules, Platform } from 'react-native';

const { OcrModule } = NativeModules;

export interface ScreenshotPickResult {
  uri: string;
}

export interface OcrExtractionResult {
  success: boolean;
  text: string;
  blockCount?: number;
  error?: string;
}

/**
 * Opens the native gallery picker to choose a screenshot.
 */
export async function pickScreenshot(): Promise<ScreenshotPickResult | null> {
  if (Platform.OS !== 'android') {
    throw new Error('Screenshot picking is currently supported on Android.');
  }

  if (!OcrModule || !OcrModule.pickScreenshot) {
    throw new Error('Native OCR module is not available. Please ensure the app is running on Android.');
  }

  try {
    const result = await OcrModule.pickScreenshot();
    if (!result || !result.uri) {
      return null; // User cancelled
    }
    return { uri: result.uri };
  } catch (error: any) {
    console.error('[FraudShield OCR] Failed to pick screenshot:', error);
    throw new Error(error?.message || 'Failed to select image from device gallery');
  }
}

/**
 * Extracts visible text from a selected image URI using on-device ML Kit OCR.
 */
export async function extractTextFromScreenshot(
  imageUri: string,
): Promise<OcrExtractionResult> {
  if (!imageUri) {
    return {
      success: false,
      text: '',
      error: 'No image URI provided',
    };
  }

  if (Platform.OS !== 'android' || !OcrModule || !OcrModule.recognizeText) {
    return {
      success: false,
      text: '',
      error: 'OCR text recognition is only available on Android native runtime.',
    };
  }

  try {
    const result = await OcrModule.recognizeText(imageUri);
    const extractedText = (result?.text || '').trim();

    return {
      success: true,
      text: extractedText,
      blockCount: result?.blockCount || 0,
    };
  } catch (error: any) {
    console.error('[FraudShield OCR] Text recognition failed:', error);
    return {
      success: false,
      text: '',
      error: error?.message || 'Unable to read text from the selected image.',
    };
  }
}
