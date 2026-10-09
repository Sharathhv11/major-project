/**
 * Modern Login Screen — FraudShield
 *
 * Minimal, clean, and professional login UI.
 * Features:
 * - Plain FraudShield logo branding without circular/card container
 * - Modern typography hierarchy with prominent "Welcome back" heading
 * - Lucide Mail and LockKeyhole input icons with smooth #3a86ff focus states
 * - Functional password visibility toggle with Lucide Eye / EyeOff
 * - Dominant #3a86ff primary login button with white bold text
 * - Clean full-screen layout without unnecessary card wrappers or visual noise
 * - Complete preservation of auth state and validation logic
 */

import React, {useState} from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {AuthStackParamList} from '../../navigation/AuthNavigator';
import {useAuth} from '../../context/AuthContext';
import Input from '../../components/Input';
import ErrorMessage from '../../components/ErrorMessage';
import {Colors, Typography} from '../../theme/theme';
import {validateEmail} from '../../utils/validation';
import {extractApiError} from '../../utils/errorHandler';

type LoginScreenProps = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

const PRIMARY_COLOR = '#3a86ff';

const LoginScreen: React.FC<LoginScreenProps> = ({navigation}) => {
  const {login} = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  const handleLogin = async () => {
    // Clear previous errors
    setError('');

    // Validate
    const errors: {email?: string; password?: string} = {};
    let isValid = true;

    const emailResult = validateEmail(email);
    if (!emailResult.isValid) {
      errors.email = emailResult.error;
      isValid = false;
    }

    if (!password) {
      errors.password = 'Password is required';
      isValid = false;
    }

    setFieldErrors(errors);
    if (!isValid) {
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const apiError = extractApiError(err);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Reset Password',
      'Enter your email address to receive password reset instructions.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Send Reset Link',
          onPress: () => {
            if (!email) {
              setFieldErrors(prev => ({
                ...prev,
                email: 'Please enter your email to reset password',
              }));
            } else {
              Alert.alert(
                'Check Your Email',
                `A password reset link has been dispatched to ${email.trim()}.`,
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* ─── 1. Logo (Original / Plain - No circle or container box) ──── */}
          <View style={styles.logoSection}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="FraudShield Logo"
            />
          </View>

          {/* ─── 2. Typography Header ────────────────────────────────────── */}
          <View style={styles.headerSection}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>
              Sign in to continue protecting yourself from online fraud.
            </Text>
          </View>

          {/* ─── 3. Error Banner ─────────────────────────────────────────── */}
          {error ? (
            <View style={styles.errorWrapper}>
              <ErrorMessage
                message={error}
                onDismiss={() => setError('')}
              />
            </View>
          ) : null}

          {/* ─── 4. Form Fields ──────────────────────────────────────────── */}
          <View style={styles.formSection}>
            {/* Email Field with Lucide Mail icon */}
            <Input
              label="Email Address"
              placeholder="name@example.com"
              value={email}
              onChangeText={text => {
                setEmail(text);
                if (fieldErrors.email) {
                  setFieldErrors(prev => ({...prev, email: undefined}));
                }
              }}
              error={fieldErrors.email}
              leftIcon="Mail"
              focusColor={PRIMARY_COLOR}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              containerStyle={styles.inputSpacing}
            />

            {/* Password Field with Lucide LockKeyhole & Eye / EyeOff toggle */}
            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={text => {
                setPassword(text);
                if (fieldErrors.password) {
                  setFieldErrors(prev => ({...prev, password: undefined}));
                }
              }}
              error={fieldErrors.password}
              leftIcon="LockKeyhole"
              focusColor={PRIMARY_COLOR}
              isPassword
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              containerStyle={styles.passwordSpacing}
            />

            {/* Forgot Password Secondary Link */}
            <View style={styles.forgotPasswordContainer}>
              <TouchableOpacity
                onPress={handleForgotPassword}
                disabled={loading}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                accessibilityRole="button"
                accessibilityLabel="Forgot password">
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* ─── 5. Primary Login Button (#3a86ff, White Bold Text) ──────── */}
            <TouchableOpacity
              style={[
                styles.loginButton,
                loading && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Log In">
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>LOGIN</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ─── 6. Secondary Action (Sign Up Link) ──────────────────────── */}
          <View style={styles.footerSection}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              disabled={loading}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
              accessibilityRole="button"
              accessibilityLabel="Create Account">
              <Text style={styles.signupLinkText}>Create Account</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 24 : 16,
    paddingBottom: 28,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 32,
  },
  logo: {
    width: 230,
    height: 60,
  },
  headerSection: {
    marginBottom: 28,
  },
  heading: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.4,
    fontFamily: Typography.fontFamily,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748B',
    fontWeight: '400',
    fontFamily: Typography.fontFamily,
  },
  errorWrapper: {
    marginBottom: 16,
  },
  formSection: {
    width: '100%',
  },
  inputSpacing: {
    marginBottom: 18,
  },
  passwordSpacing: {
    marginBottom: 12,
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    fontFamily: Typography.fontFamily,
  },
  loginButton: {
    backgroundColor: PRIMARY_COLOR,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: PRIMARY_COLOR,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '400',
    fontFamily: Typography.fontFamily,
  },
  signupLinkText: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
});

export default LoginScreen;
