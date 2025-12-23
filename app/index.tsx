/**
 * Home Screen - Main Entry Point
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAppStore } from '../src/stores/appStore';
import { useRoomStore } from '../src/stores/roomStore';
import { useTransferStore } from '../src/stores/transferStore';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../src/constants/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const deviceName = useAppStore((state) => state.deviceName);
  const networkCapabilities = useAppStore((state) => state.networkCapabilities);
  const activeTransferCount = useTransferStore((state) => state.activeTransferCount);
  const room = useRoomStore((state) => state.room);

  // If already in a room, redirect to room screen
  React.useEffect(() => {
    if (room) {
      router.replace('/room');
    }
  }, [room]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <Text style={styles.logo}>🦠</Text>
          <Text style={styles.title}>PANDEMIC</Text>
          <Text style={styles.subtitle}>
            Condividi audio localmente{'\n'}Nessuna connessione internet richiesta
          </Text>
        </View>

        {/* Network Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusIcon}>📱</Text>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Dispositivo</Text>
              <Text style={styles.statusValue}>{deviceName}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.statusIcon}>
              {networkCapabilities.wifiAvailable ? '📶' : '📵'}
            </Text>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Rete Locale</Text>
              <Text style={styles.statusValue}>
                {networkCapabilities.wifiAvailable
                  ? `Wi-Fi (${networkCapabilities.localIpAddress || 'connesso'})`
                  : 'Solo Bluetooth'}
              </Text>
            </View>
          </View>
        </View>

        {/* Main Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionCard, styles.hostCard]}
            onPress={() => router.push('/host')}
            activeOpacity={0.85}
          >
            <View style={styles.actionGlow} />
            <Text style={styles.actionIcon}>🎛️</Text>
            <Text style={styles.actionTitle}>Crea Stanza</Text>
            <Text style={styles.actionDescription}>
              Diventa host e permetti agli altri di connettersi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.joinCard]}
            onPress={() => router.push('/join')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionGlow, styles.joinGlow]} />
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionTitle}>Trova Stanze</Text>
            <Text style={styles.actionDescription}>
              Cerca stanze attive nelle vicinanze
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/library')}
          >
            <Text style={styles.quickLinkIcon}>🎵</Text>
            <Text style={styles.quickLinkText}>La mia libreria</Text>
            <Text style={styles.quickLinkArrow}>→</Text>
          </TouchableOpacity>

          {activeTransferCount > 0 && (
            <TouchableOpacity
              style={[styles.quickLink, styles.transfersLink]}
              onPress={() => router.push('/room')}
            >
              <Text style={styles.quickLinkIcon}>📥</Text>
              <Text style={styles.quickLinkText}>
                {activeTransferCount} trasferiment{activeTransferCount === 1 ? 'o' : 'i'} attiv{activeTransferCount === 1 ? 'o' : 'i'}
              </Text>
              <Text style={styles.quickLinkArrow}>→</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.quickLinkIcon}>⚙️</Text>
            <Text style={styles.quickLinkText}>Impostazioni</Text>
            <Text style={styles.quickLinkArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Offline-first • Locale • Peer-to-peer
          </Text>
          <Text style={styles.version}>v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },

  logo: {
    fontSize: 72,
    marginBottom: Spacing.md,
  },

  title: {
    fontSize: Typography.sizes.display,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 4,
    marginBottom: Spacing.sm,
  },

  subtitle: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Status Card
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },

  statusIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
  },

  statusInfo: {
    flex: 1,
  },

  statusLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },

  statusValue: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },

  // Actions
  actionsSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },

  actionCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    ...Shadows.lg,
  },

  hostCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },

  joinCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.secondary,
  },

  actionGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.primaryGlow,
  },

  joinGlow: {
    backgroundColor: Colors.secondaryGlow,
  },

  actionIcon: {
    fontSize: 40,
    marginBottom: Spacing.md,
  },

  actionTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },

  actionDescription: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  // Quick Links
  quickLinks: {
    marginBottom: Spacing.xl,
  },

  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  transfersLink: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryGlow,
  },

  quickLinkIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },

  quickLinkText: {
    flex: 1,
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
  },

  quickLinkArrow: {
    fontSize: Typography.sizes.lg,
    color: Colors.textMuted,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.lg,
  },

  footerText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },

  version: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
});

