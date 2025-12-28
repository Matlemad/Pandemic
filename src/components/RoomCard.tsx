/**
 * Room Card Component - Displays a discovered room
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DiscoveredRoom } from '../types';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../constants/theme';
import { formatRelativeTime } from '../utils/format';

interface RoomCardProps {
  room: DiscoveredRoom;
  onPress: () => void;
  isBleRoom?: boolean;
}

export function RoomCard({ room, onPress, isBleRoom }: RoomCardProps) {
  const signalStrength = getSignalStrength(room.rssi);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.roomInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.roomName} numberOfLines={1}>
              {room.roomName}
            </Text>
            {isBleRoom && (
              <View style={styles.bleBadge}>
                <Text style={styles.bleBadgeText}>📡</Text>
              </View>
            )}
          </View>
          <Text style={styles.hostName}>
            👤 {room.hostName}
          </Text>
        </View>
        <View style={styles.signalContainer}>
          <SignalBars strength={signalStrength} />
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.badges}>
          {isBleRoom && (
            <View style={[styles.badge, styles.hotspotBadge]}>
              <Text style={styles.badgeText}>🔥 Hotspot</Text>
            </View>
          )}
          {room.wifiAvailable && !isBleRoom && (
            <View style={[styles.badge, styles.wifiBadge]}>
              <Text style={styles.badgeText}>📶 Wi-Fi</Text>
            </View>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {room.peerCount} {room.peerCount === 1 ? 'peer' : 'peers'}
            </Text>
          </View>
        </View>
        <Text style={styles.lastSeen}>
          {formatRelativeTime(room.lastSeen)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function SignalBars({ strength }: { strength: number }) {
  const bars = [1, 2, 3, 4];
  const colors = [
    Colors.signalWeak,
    Colors.signalMedium,
    Colors.signalMedium,
    Colors.signalStrong,
  ];

  return (
    <View style={styles.signalBars}>
      {bars.map((bar) => (
        <View
          key={bar}
          style={[
            styles.signalBar,
            { height: 4 + bar * 4 },
            bar <= strength
              ? { backgroundColor: colors[strength - 1] || Colors.signalWeak }
              : { backgroundColor: Colors.border },
          ]}
        />
      ))}
    </View>
  );
}

function getSignalStrength(rssi: number): number {
  if (rssi >= -50) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },

  roomInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  roomName: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },

  bleBadge: {
    marginBottom: Spacing.xs,
  },

  bleBadgeText: {
    fontSize: 16,
  },

  hostName: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },

  signalContainer: {
    alignItems: 'flex-end',
  },

  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },

  signalBar: {
    width: 4,
    borderRadius: 1,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  badge: {
    backgroundColor: Colors.surfaceHighlight,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },

  wifiBadge: {
    backgroundColor: Colors.secondaryGlow,
  },

  hotspotBadge: {
    backgroundColor: '#FF9500', // Orange for hotspot
  },

  badgeText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },

  lastSeen: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
});

