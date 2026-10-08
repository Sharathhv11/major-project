/**
 * App Entry Point
 *
 * Minimal root: wraps the app in AuthProvider and SafeAreaProvider.
 * All routing handled by RootNavigator.
 *
 * Direct AI Model Fraud Detection Flow:
 * 1. AccessibilityService reads on-screen text OR MessageNotificationService intercepts notifications
 *    → fires 'onIncomingMessage'
 * 2. Directly calls the FastAPI ML model via the Node.js backend (no frontend keyword filtering)
 * 3. On the basis of the score, displays the native fraud alert overlay if isFraud: true
 */

import React, { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { messageFraudProcessor, messageFraudCache, initManualScanListener } from './src/fraudDetection';

interface IncomingMessagePayload {
  packageName?: string;
  sender?: string;
  text: string;
  timestamp?: number;
  notificationKey?: string;
}

const App: React.FC = () => {
  useEffect(() => {
    // Hydrate local cache from device storage if available
    messageFraudCache.initialize().catch((err) => {
      console.warn('Failed to initialize local message fraud cache:', err);
    });

    const subscription = DeviceEventEmitter.addListener(
      'onIncomingMessage',
      (payload: IncomingMessagePayload) => {
        if (!payload || !payload.text) return;

        const text = payload.text.trim();
        if (!text || text.length < 10) return;

        // Restrict message processing strictly to WhatsApp and SMS/Messages
        const pkg = (payload.packageName || '').toLowerCase();
        const isWhatsApp = pkg.includes('whatsapp');
        const isMessaging =
          pkg.includes('messaging') ||
          pkg.includes('mms') ||
          pkg.includes('message') ||
          pkg.includes('truecaller');

        // Ignore text from any other non-messaging applications
        if (pkg && !isWhatsApp && !isMessaging) {
          return;
        }

        const source = isWhatsApp ? 'WHATSAPP' : 'SMS';

        // Execute local cache -> backend -> alert flow
        messageFraudProcessor
          .processMessage(text, {
            source,
            sender: payload.sender,
          })
          .catch((err) => {
            console.warn('Message fraud processing error:', err);
          });
      }
    );

    // Initialize FraudShield floating bot manual scan listener
    const cleanupManualScan = initManualScanListener();

    return () => {
      subscription.remove();
      cleanupManualScan();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default App;
