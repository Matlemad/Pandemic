/**
 * VenueRoomCard — Card component for displaying discovered venue hosts
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { DiscoveredVenueHost } from '../venue/types';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../constants/theme';

interface VenueRoomCardProps {
  venue: DiscoveredVenueHost;
  onPress: () => void;
  isConnecting?: boolean;
}

export const VenueRoomCard: React.FC<VenueRoomCardProps> = ({
  venue,
  onPress,
  isConnecting = false,
}) => {
  const roomName = venue.txt.room || venue.name;
  const supportsRelay = venue.txt.relay === '1';
  
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isConnecting && styles.containerConnecting,
      ]}
      onPress={onPress}
      disabled={isConnecting}
      activeOpacity={0.8}
    >
      {/* Venue Badge */}
      <View style={styles.badgeRow}>
        <View style={styles.venueBadge}>
          <Text style={styles.badgeIcon}>📡</Text>
          <Text style={styles.badgeText}>VENUE</Text>
        </View>
        {supportsRelay && (
          <View style={styles.relayBadge}>
            <Text style={styles.relayText}>RELAY</Text>
          </View>
        )}
      </View>
      
      {/* Room Info */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.roomName} numberOfLines={1}>
            {roomName}
          </Text>
          <View style={styles.wifiIndicator}>
            <Text style={styles.wifiIcon}>📶</Text>
          </View>
        </View>
        
        <Text style={styles.hostInfo}>
          {venue.name}
        </Text>
        
        <View style={styles.footer}>
          <View style={styles.connectionInfo}>
            <Text style={styles.connectionLabel}>Address:</Text>
            <Text style={styles.connectionValue}>
              {venue.host}:{venue.port}
            </Text>
          </View>
          
          <View style={styles.crossPlatformBadge}>
            <Text style={styles.crossPlatformText}>🍎 🤖 Cross-Platform</Text>
          </View>
        </View>
      </View>
      
      {/* Action Arrow */}
      <View style={styles.action}>
        <Text style={styles.actionArrow}>→</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.accent,
    overflow: 'hidden',
    ...Shadows.md,
  },
  
  containerConnecting: {
    opacity: 0.6,
  },
  
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  
  venueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  
  badgeIcon: {
    fontSize: 12,
  },
  
  badgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '700',
    color: Colors.background,
    letterSpacing: 1,
  },
  
  relayBadge: {
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  
  relayText: {
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    color: Colors.background,
    letterSpacing: 0.5,
  },
  
  content: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  
  roomName: {
    flex: 1,
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  
  wifiIndicator: {
    marginLeft: Spacing.sm,
  },
  
  wifiIcon: {
    fontSize: 20,
  },
  
  hostInfo: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  
  connectionInfo: {
    flex: 1,
  },
  
  connectionLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  
  connectionValue: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
  },
  
  crossPlatformBadge: {
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  
  crossPlatformText: {
    fontSize: Typography.sizes.xs,
    color: Colors.primary,
    fontWeight: '500',
  },
  
  action: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -12,
  },
  
  actionArrow: {
    fontSize: 24,
    color: Colors.accent,
    fontWeight: '300',
  },
});

