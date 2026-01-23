/**
 * Home Screen - Main Entry Point
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useRootNavigationState } from 'expo-router';
import { useAppStore } from '../src/stores/appStore';
import { useRoomStore } from '../src/stores/roomStore';
import { useTransferStore } from '../src/stores/transferStore';
import { bleService } from '../src/services/BleService';
import { Icon } from '../src/components';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../src/constants/theme';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const deviceName = useAppStore((state) => state.deviceName);
  const networkCapabilities = useAppStore((state) => state.networkCapabilities);
  const activeTransferCount = useTransferStore((state) => state.activeTransferCount);
  const room = useRoomStore((state) => state.room);
  const isInitialized = useAppStore((state) => state.isInitialized);
  
  // Permission states
  const [bleReady, setBleReady] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Request permissions and initialize BLE on mount
  const initializePermissions = useCallback(async () => {
    setIsInitializing(true);
    
    try {
      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version as number;
        console.log('[Home] Requesting permissions (Android', androidVersion, ')');
        
        let permissionsToRequest: any[] = [];
        
        if (androidVersion >= 33) {
          // Android 13+ (needs POST_NOTIFICATIONS)
          permissionsToRequest = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          ];
        } else if (androidVersion >= 31) {
          // Android 12+
          permissionsToRequest = [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];
        } else {
          // Android < 12
          permissionsToRequest = [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];
        }
        
        const results = await PermissionsAndroid.requestMultiple(permissionsToRequest);
        
        // Check location permission
        const locationGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === 'granted';
        setLocationReady(locationGranted);
        
        // Check BLE permissions
        if (androidVersion >= 31) {
          const bleGranted = 
            results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
            results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted';
          setBleReady(bleGranted);
          console.log('[Home] Android 12+ BLE permissions:', bleGranted);
        } else {
          // On older Android, BLE is ready if location is granted
          // Note: User must also have Bluetooth turned ON
          setBleReady(locationGranted);
          console.log('[Home] Android <12 - BLE ready via location:', locationGranted);
        }
        
        console.log('[Home] Permissions granted:', { locationGranted, androidVersion });
      } else {
        // iOS - permissions handled by system automatically
        setBleReady(true);
        setLocationReady(true);
      }
      
      // Initialize BLE service
      try {
        await bleService.initialize();
        console.log('[Home] BLE service initialized');
        setBleReady(true);
      } catch (bleError) {
        console.warn('[Home] BLE initialization failed:', bleError);
      }
      
    } catch (error) {
      console.error('[Home] Permission request failed:', error);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    initializePermissions();
  }, [initializePermissions]);

  // Check if navigation is ready
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;

  // If already in a room, redirect to room screen
  useEffect(() => {
    if (room && navigationReady && isInitialized) {
      // Defer navigation until after layout render
      requestAnimationFrame(() => {
        router.replace('/room');
      });
    }
  }, [room, navigationReady, isInitialized]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <Icon name="pandemic-logo" size={80} color="#09f5d7" />
          </View>
          <Text style={styles.title}>PANDEMIC</Text>
          <Text style={styles.subtitle}>
            Share audio locally{'\n'}No internet connection required
          </Text>
        </View>

        {/* Network Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={styles.statusIconWrap}>
              <Icon name="mobile" size={24} color={Colors.textPrimary} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Device</Text>
              <Text style={styles.statusValue}>{deviceName}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <View style={styles.statusIconWrap}>
              <Icon name="wifi" size={24} color={networkCapabilities.wifiAvailable ? Colors.secondary : Colors.textMuted} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>Local Network</Text>
              <Text style={styles.statusValue}>
                {networkCapabilities.wifiAvailable
                  ? `Wi-Fi (${networkCapabilities.localIpAddress || 'connected'})`
                  : 'Bluetooth Only'}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            {isInitializing ? (
              <>
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginRight: Spacing.md }} />
                <View style={styles.statusInfo}>
                  <Text style={styles.statusLabel}>Initializing...</Text>
                  <Text style={styles.statusValue}>Requesting permissions</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.statusIconWrap}>
                  <Icon 
                    name={bleReady && locationReady ? 'check' : 'warning'} 
                    size={24} 
                    color={bleReady && locationReady ? Colors.secondary : Colors.accent} 
                  />
                </View>
                <View style={styles.statusInfo}>
                  <Text style={styles.statusLabel}>Bluetooth & Location</Text>
                  <Text style={[
                    styles.statusValue,
                    { color: bleReady && locationReady ? Colors.secondary : Colors.accent }
                  ]}>
                    {bleReady && locationReady 
                      ? 'Ready for discovery' 
                      : !bleReady && !locationReady 
                        ? 'Missing permissions'
                        : !bleReady 
                          ? 'Bluetooth not ready'
                          : 'Location not active'}
                  </Text>
                </View>
                {(!bleReady || !locationReady) && (
                  <TouchableOpacity 
                    style={styles.retryButton}
                    onPress={initializePermissions}
                  >
                    <Text style={styles.retryButtonText}>🔄</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Main Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionCard, styles.lanCard]}
            onPress={() => router.push('/lan-host')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionGlow, styles.lanGlow]} />
            <View style={styles.actionIconWrap}>
              <Icon name="radar" size={40} color={Colors.textPrimary} />
            </View>
            <Text style={styles.actionTitle}>Create Room</Text>
            <Text style={styles.actionDescription}>
              Host a Wi-Fi/hotspot room (cross-platform)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, styles.joinCard]}
            onPress={() => router.push('/join')}
            activeOpacity={0.85}
          >
            <View style={[styles.actionGlow, styles.joinGlow]} />
            <View style={styles.actionIconWrap}>
              <Icon name="lens" size={40} color={Colors.textPrimary} />
            </View>
            <Text style={styles.actionTitle}>Find Rooms</Text>
            <Text style={styles.actionDescription}>
              Search for active rooms nearby
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Links */}
        <View style={styles.quickLinks}>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/library')}
          >
            <View style={styles.quickLinkIconWrap}>
              <Icon name="musical-notes" size={20} color={Colors.textPrimary} />
            </View>
            <Text style={styles.quickLinkText}>My Library</Text>
            <Text style={styles.quickLinkArrow}>→</Text>
          </TouchableOpacity>

          {activeTransferCount > 0 && (
            <TouchableOpacity
              style={[styles.quickLink, styles.transfersLink]}
              onPress={() => router.push('/room')}
            >
              <View style={styles.quickLinkIconWrap}>
                <Icon name="download" size={20} color={Colors.textPrimary} />
              </View>
              <Text style={styles.quickLinkText}>
                {activeTransferCount} active transfer{activeTransferCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.quickLinkArrow}>→</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push('/settings')}
          >
            <View style={styles.quickLinkIconWrap}>
              <Icon name="settings" size={20} color={Colors.textPrimary} />
            </View>
            <Text style={styles.quickLinkText}>Settings</Text>
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

  logoContainer: {
    marginBottom: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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

  statusIconWrap: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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

  retryButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.sm,
  },

  retryButtonText: {
    fontSize: 20,
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

  joinCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.secondary,
  },

  lanCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
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

  lanGlow: {
    backgroundColor: Colors.accent + '40',
  },

  actionIconWrap: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
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

  quickLinkIconWrap: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
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

