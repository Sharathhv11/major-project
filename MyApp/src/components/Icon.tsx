/**
 * Pure React Native Lucide-Standard Icon System
 *
 * Implements 24x24 Lucide icon geometries with consistent stroke widths,
 * accurate proportions, and responsive scaling.
 * 100% self-contained: Requires zero native modules or unlinked binaries.
 */

import React from 'react';
import {View, StyleSheet, ViewStyle} from 'react-native';
import Colors from '../theme/colors';

export type IconName =
  | 'Home'
  | 'User'
  | 'Settings'
  | 'Shield'
  | 'ShieldCheck'
  | 'Lock'
  | 'LockKeyhole'
  | 'Mail'
  | 'Phone'
  | 'Eye'
  | 'EyeOff'
  | 'LogOut'
  | 'ChevronRight'
  | 'ChevronLeft'
  | 'AlertCircle'
  | 'CheckCircle2'
  | 'Check'
  | 'KeyRound'
  | 'Activity'
  | 'Sparkles'
  | 'Clock'
  | 'Calendar'
  | 'Edit3'
  | 'Info'
  | 'X'
  | 'ArrowRight'
  | 'Image'
  | 'Upload'
  | 'Search'
  | 'Scan'
  | 'AlertTriangle'
  | 'RefreshCw'
  | 'Trash2'
  | 'FileText'
  | 'Link'
  | 'Send'
  | 'HelpCircle'
  | 'Bot'
  | 'MessageSquare';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: ViewStyle;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 22,
  color = Colors.textPrimary,
  strokeWidth = 2,
  style,
}) => {
  const scale = size / 24;

  const renderIconContent = () => {
    switch (name) {
      case 'Mail':
        return (
          <View style={iconStyles.canvas}>
            {/* Outer envelope body */}
            <View
              style={{
                position: 'absolute',
                top: 4.5,
                left: 2,
                width: 20,
                height: 15,
                borderRadius: 2.5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Symmetrical masked V-flap */}
            <View
              style={{
                position: 'absolute',
                top: 4.5,
                left: 2,
                width: 20,
                height: 8.5,
                overflow: 'hidden',
                alignItems: 'center',
              }}>
              <View
                style={{
                  width: 13,
                  height: 13,
                  borderBottomWidth: strokeWidth,
                  borderRightWidth: strokeWidth,
                  borderColor: color,
                  transform: [{translateY: -7}, {rotate: '45deg'}],
                }}
              />
            </View>
          </View>
        );

      case 'Lock':
      case 'LockKeyhole':
        return (
          <View style={iconStyles.canvas}>
            {/* Shackle */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 6.5,
                width: 11,
                height: 9,
                borderTopLeftRadius: 5.5,
                borderTopRightRadius: 5.5,
                borderWidth: strokeWidth,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
            {/* Body */}
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 3.5,
                width: 17,
                height: 11,
                borderRadius: 2.5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Keyhole */}
            <View
              style={{
                position: 'absolute',
                bottom: 7.5,
                left: 10.5,
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 5,
                left: 11,
                width: 2,
                height: 3,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'Eye':
        return (
          <View style={iconStyles.canvas}>
            {/* Eye Contour */}
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 2,
                width: 20,
                height: 12,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Pupil */}
            <View
              style={{
                position: 'absolute',
                top: 9,
                left: 9,
                width: 6,
                height: 6,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
          </View>
        );

      case 'EyeOff':
        return (
          <View style={iconStyles.canvas}>
            {/* Eye Contour */}
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 2,
                width: 20,
                height: 12,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Pupil */}
            <View
              style={{
                position: 'absolute',
                top: 9,
                left: 9,
                width: 6,
                height: 6,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Slash */}
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 0,
                width: 24,
                height: strokeWidth,
                backgroundColor: color,
                transform: [{rotate: '-45deg'}],
                borderRadius: strokeWidth / 2,
              }}
            />
          </View>
        );

      case 'Shield':
      case 'ShieldCheck':
        return (
          <View style={iconStyles.canvas}>
            {/* Shield Outline */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 4,
                width: 16,
                height: 14,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {name === 'ShieldCheck' ? (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  width: 8,
                  height: 4,
                  borderLeftWidth: strokeWidth,
                  borderBottomWidth: strokeWidth,
                  borderColor: color,
                  transform: [{rotate: '-45deg'}],
                }}
              />
            ) : null}
          </View>
        );

      case 'Home':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 6,
                width: 12,
                height: 12,
                borderTopWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
                borderTopLeftRadius: 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 5,
                width: 14,
                height: 10,
                borderLeftWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 9,
                width: 6,
                height: 6,
                borderTopWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                borderTopLeftRadius: 1,
                borderTopRightRadius: 1,
              }}
            />
          </View>
        );

      case 'User':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 8,
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 4,
                width: 16,
                height: 8,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderTopWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
              }}
            />
          </View>
        );

      case 'Settings':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
          </View>
        );

      case 'Phone':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 6,
                width: 12,
                height: 18,
                borderRadius: 3.5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 10,
                width: 4,
                height: 1.5,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 5,
                left: 10.5,
                width: 3,
                height: 3,
                borderRadius: 1.5,
                borderWidth: 1,
                borderColor: color,
              }}
            />
          </View>
        );

      case 'ArrowRight':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 4,
                width: 15,
                height: strokeWidth,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 7.5,
                right: 4.5,
                width: 9,
                height: 9,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'ChevronRight':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 7.5,
                left: 8,
                width: 9,
                height: 9,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'ChevronLeft':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 7.5,
                right: 8,
                width: 9,
                height: 9,
                borderBottomWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'AlertCircle':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 11,
                width: strokeWidth,
                height: 7,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 5.5,
                left: 10.75,
                width: strokeWidth + 0.5,
                height: strokeWidth + 0.5,
                borderRadius: (strokeWidth + 0.5) / 2,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'CheckCircle2':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 7.5,
                width: 8,
                height: 5,
                borderLeftWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '-45deg'}],
              }}
            />
          </View>
        );

      case 'Check':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 7,
                left: 5,
                width: 12,
                height: 7,
                borderLeftWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '-45deg'}],
              }}
            />
          </View>
        );

      case 'KeyRound':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: 10,
                height: 10,
                borderRadius: 5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 11,
                width: 8,
                height: strokeWidth,
                backgroundColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 4,
                right: 5,
                width: strokeWidth,
                height: 4,
                backgroundColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'Activity':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 2,
                width: 5,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 7,
                width: 5,
                height: 11,
                borderLeftWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '-30deg'}],
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                right: 2,
                width: 6,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'Clock':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 11,
                width: strokeWidth,
                height: 6.5,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 11,
                width: 5,
                height: strokeWidth,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
          </View>
        );

      case 'Calendar':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 3,
                width: 18,
                height: 16,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 3,
                width: 18,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 7,
                width: strokeWidth,
                height: 4,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 2,
                right: 7,
                width: strokeWidth,
                height: 4,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
          </View>
        );

      case 'Edit3':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 5,
                left: 8,
                width: 12,
                height: strokeWidth * 2,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
                borderRadius: 1,
              }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 3,
                width: 18,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'Info':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 10.75,
                width: strokeWidth + 0.5,
                height: strokeWidth + 0.5,
                borderRadius: (strokeWidth + 0.5) / 2,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 10,
                left: 11,
                width: strokeWidth,
                height: 7,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
          </View>
        );

      case 'X':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 3,
                width: 18,
                height: strokeWidth,
                backgroundColor: color,
                transform: [{rotate: '45deg'}],
                borderRadius: strokeWidth / 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 3,
                width: 18,
                height: strokeWidth,
                backgroundColor: color,
                transform: [{rotate: '-45deg'}],
                borderRadius: strokeWidth / 2,
              }}
            />
          </View>
        );

      case 'LogOut':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 4,
                width: 10,
                height: 18,
                borderLeftWidth: strokeWidth,
                borderTopWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                borderTopLeftRadius: 3,
                borderBottomLeftRadius: 3,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 9,
                width: 10,
                height: strokeWidth,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 8.5,
                right: 3,
                width: 6,
                height: 6,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'Sparkles':
      default:
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 7,
                left: 7,
                width: 10,
                height: 10,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
                borderRadius: 2,
              }}
            />
          </View>
        );

      case 'Image':
        return (
          <View style={iconStyles.canvas}>
            {/* Outer rect frame */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                width: 18,
                height: 18,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Sun circle */}
            <View
              style={{
                position: 'absolute',
                top: 6.5,
                left: 7,
                width: 3.5,
                height: 3.5,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
            {/* Mountain peak */}
            <View
              style={{
                position: 'absolute',
                bottom: 5,
                left: 5,
                width: 14,
                height: 7,
                overflow: 'hidden',
              }}>
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderTopWidth: strokeWidth,
                  borderLeftWidth: strokeWidth,
                  borderColor: color,
                  transform: [{rotate: '45deg'}, {translateY: 2}],
                }}
              />
            </View>
          </View>
        );

      case 'Upload':
        return (
          <View style={iconStyles.canvas}>
            {/* Bottom tray line */}
            <View
              style={{
                position: 'absolute',
                bottom: 3.5,
                left: 4,
                width: 16,
                height: 6,
                borderBottomWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                borderBottomLeftRadius: 3,
                borderBottomRightRadius: 3,
              }}
            />
            {/* Vertical stem */}
            <View
              style={{
                position: 'absolute',
                top: 5,
                left: 11,
                width: strokeWidth,
                height: 10,
                backgroundColor: color,
              }}
            />
            {/* Up arrow chevron head */}
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 7.5,
                width: 9,
                height: 9,
                borderTopWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'Search':
        return (
          <View style={iconStyles.canvas}>
            {/* Circular lens */}
            <View
              style={{
                position: 'absolute',
                top: 3.5,
                left: 3.5,
                width: 12.5,
                height: 12.5,
                borderRadius: 7,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Diagonal handle */}
            <View
              style={{
                position: 'absolute',
                bottom: 3.5,
                right: 3.5,
                width: 6.5,
                height: strokeWidth,
                backgroundColor: color,
                transform: [{rotate: '45deg'}],
              }}
            />
          </View>
        );

      case 'Scan':
        return (
          <View style={iconStyles.canvas}>
            {/* Top-Left corner */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                width: 6,
                height: 6,
                borderTopWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderColor: color,
                borderTopLeftRadius: 2,
              }}
            />
            {/* Top-Right corner */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                right: 3,
                width: 6,
                height: 6,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                borderTopRightRadius: 2,
              }}
            />
            {/* Bottom-Left corner */}
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                left: 3,
                width: 6,
                height: 6,
                borderBottomWidth: strokeWidth,
                borderLeftWidth: strokeWidth,
                borderColor: color,
                borderBottomLeftRadius: 2,
              }}
            />
            {/* Bottom-Right corner */}
            <View
              style={{
                position: 'absolute',
                bottom: 3,
                right: 3,
                width: 6,
                height: 6,
                borderBottomWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                borderBottomRightRadius: 2,
              }}
            />
            {/* Horizontal scan center beam */}
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 6,
                width: 12,
                height: Math.max(1, strokeWidth - 0.5),
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'AlertTriangle':
        return (
          <View style={iconStyles.canvas}>
            {/* Warning triangle contour */}
            <View
              style={{
                position: 'absolute',
                top: 2.5,
                left: 2,
                width: 20,
                height: 19,
                alignItems: 'center',
              }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderWidth: strokeWidth,
                  borderColor: color,
                  borderTopLeftRadius: 3,
                  transform: [{rotate: '45deg'}, {scaleY: 0.95}],
                }}
              />
            </View>
            {/* Exclamation vertical bar */}
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 11,
                width: strokeWidth,
                height: 5,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
            {/* Exclamation dot */}
            <View
              style={{
                position: 'absolute',
                bottom: 6,
                left: 11,
                width: strokeWidth,
                height: strokeWidth,
                borderRadius: 1,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'RefreshCw':
        return (
          <View style={iconStyles.canvas}>
            {/* Circular arc */}
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: strokeWidth,
                borderColor: color,
                borderBottomColor: 'transparent',
              }}
            />
            {/* Arrowhead */}
            <View
              style={{
                position: 'absolute',
                top: 2,
                right: 3,
                width: 5,
                height: 5,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '25deg'}],
              }}
            />
          </View>
        );

      case 'Trash2':
        return (
          <View style={iconStyles.canvas}>
            {/* Top horizontal lid bar */}
            <View
              style={{
                position: 'absolute',
                top: 5,
                left: 3,
                width: 18,
                height: strokeWidth,
                backgroundColor: color,
                borderRadius: 1,
              }}
            />
            {/* Handle */}
            <View
              style={{
                position: 'absolute',
                top: 2.5,
                left: 9,
                width: 6,
                height: 3,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
                borderWidth: strokeWidth,
                borderBottomWidth: 0,
                borderColor: color,
              }}
            />
            {/* Bin body */}
            <View
              style={{
                position: 'absolute',
                bottom: 3.5,
                left: 5,
                width: 14,
                height: 13,
                borderBottomLeftRadius: 3,
                borderBottomRightRadius: 3,
                borderWidth: strokeWidth,
                borderTopWidth: 0,
                borderColor: color,
              }}
            />
          </View>
        );

      case 'FileText':
        return (
          <View style={iconStyles.canvas}>
            {/* Page rect */}
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 4.5,
                width: 15,
                height: 18,
                borderRadius: 2.5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Top text line */}
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                width: 8,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
            {/* Bottom text line */}
            <View
              style={{
                position: 'absolute',
                top: 12,
                left: 8,
                width: 6,
                height: strokeWidth,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'Link':
        return (
          <View style={iconStyles.canvas}>
            {/* Left link loop */}
            <View
              style={{
                position: 'absolute',
                top: 7,
                left: 3.5,
                width: 10,
                height: 6,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '-45deg'}],
              }}
            />
            {/* Right link loop */}
            <View
              style={{
                position: 'absolute',
                bottom: 7,
                right: 3.5,
                width: 10,
                height: 6,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{rotate: '-45deg'}],
              }}
            />
          </View>
        );

      case 'Send':
        return (
          <View style={iconStyles.canvas}>
            {/* Arrowhead chevron pointing upper-right */}
            <View
              style={{
                position: 'absolute',
                top: 3.5,
                right: 3.5,
                width: 10,
                height: 10,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Diagonal thrust line */}
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 3.5,
                width: 15,
                height: strokeWidth,
                backgroundColor: color,
                borderRadius: strokeWidth / 2,
                transform: [{ rotate: '-45deg' }],
              }}
            />
          </View>
        );

      case 'HelpCircle':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Question curve */}
            <View
              style={{
                position: 'absolute',
                top: 6,
                left: 8.5,
                width: 7,
                height: 6,
                borderTopWidth: strokeWidth,
                borderRightWidth: strokeWidth,
                borderTopRightRadius: 3.5,
                borderColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 11,
                left: 11,
                width: strokeWidth,
                height: 3,
                backgroundColor: color,
              }}
            />
            {/* Question dot */}
            <View
              style={{
                position: 'absolute',
                bottom: 5.5,
                left: 10.75,
                width: strokeWidth + 0.5,
                height: strokeWidth + 0.5,
                borderRadius: (strokeWidth + 0.5) / 2,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'Bot':
        return (
          <View style={iconStyles.canvas}>
            {/* Antenna ball */}
            <View
              style={{
                position: 'absolute',
                top: 2,
                left: 10.5,
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: color,
              }}
            />
            {/* Antenna stem */}
            <View
              style={{
                position: 'absolute',
                top: 4,
                left: 11,
                width: strokeWidth,
                height: 3,
                backgroundColor: color,
              }}
            />
            {/* Bot head */}
            <View
              style={{
                position: 'absolute',
                top: 7,
                left: 3.5,
                width: 17,
                height: 14,
                borderRadius: 3.5,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Eye left */}
            <View
              style={{
                position: 'absolute',
                top: 11.5,
                left: 7.5,
                width: 2.5,
                height: 2.5,
                borderRadius: 1.25,
                backgroundColor: color,
              }}
            />
            {/* Eye right */}
            <View
              style={{
                position: 'absolute',
                top: 11.5,
                left: 14,
                width: 2.5,
                height: 2.5,
                borderRadius: 1.25,
                backgroundColor: color,
              }}
            />
          </View>
        );

      case 'MessageSquare':
        return (
          <View style={iconStyles.canvas}>
            <View
              style={{
                position: 'absolute',
                top: 3,
                left: 3,
                width: 18,
                height: 14,
                borderRadius: 3,
                borderWidth: strokeWidth,
                borderColor: color,
              }}
            />
            {/* Tail */}
            <View
              style={{
                position: 'absolute',
                top: 15,
                left: 6,
                width: 5,
                height: 4,
                borderLeftWidth: strokeWidth,
                borderBottomWidth: strokeWidth,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        );
    }
  };

  return (
    <View
      style={[
        iconStyles.wrapper,
        {
          width: size,
          height: size,
        },
        style,
      ]}>
      <View
        style={[
          iconStyles.scaler,
          {
            transform: [{scale}],
          },
        ]}>
        {renderIconContent()}
      </View>
    </View>
  );
};

const iconStyles = StyleSheet.create({
  wrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scaler: {
    width: 24,
    height: 24,
  },
  canvas: {
    width: 24,
    height: 24,
    position: 'relative',
  },
});

export default Icon;
