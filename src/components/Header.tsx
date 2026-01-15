/**
 * Header Component
 */

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography } from '../constants/theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string | ReactNode;
  onLeftPress?: () => void;
  rightIcon?: string | ReactNode;
  onRightPress?: () => void;
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  showBack = false,
  onBack,
}: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity style={styles.iconButton} onPress={onBack}>
            <Text style={styles.icon}>←</Text>
          </TouchableOpacity>
        )}
        {leftIcon && !showBack && (
          <TouchableOpacity style={styles.iconButton} onPress={onLeftPress}>
            {typeof leftIcon === 'string' ? <Text style={styles.icon}>{leftIcon}</Text> : leftIcon}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.right}>
        {rightIcon && (
          <TouchableOpacity style={styles.iconButton} onPress={onRightPress}>
            {typeof rightIcon === 'string' ? <Text style={styles.icon}>{rightIcon}</Text> : rightIcon}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  left: {
    width: 48,
    alignItems: 'flex-start',
  },

  center: {
    flex: 1,
    alignItems: 'center',
  },

  right: {
    width: 48,
    alignItems: 'flex-end',
  },

  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  icon: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
});

