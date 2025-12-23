/**
 * Join Screen - Discover and join nearby rooms
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../src/components/Header';
import { RoomCard } from '../src/components/RoomCard';
import { EmptyState } from '../src/components/EmptyState';
import { Button } from '../src/components/Button';
import { useRoomStore } from '../src/stores/roomStore';
import roomService from '../src/services/RoomService';
import { DiscoveredRoom } from '../src/types';
import { Colors, Spacing, Typography } from '../src/constants/theme';

export default function JoinScreen() {
  const discoveredRooms = useRoomStore((state) => state.discoveredRooms);
  const isScanning = useRoomStore((state) => state.isScanning);
  const clearDiscoveredRooms = useRoomStore((state) => state.clearDiscoveredRooms);

  const [isJoining, setIsJoining] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  // Start scanning on mount
  useEffect(() => {
    startScan();
    return () => {
      roomService.stopScanning();
    };
  }, []);

  const startScan = async () => {
    clearDiscoveredRooms();
    await roomService.startScanning();
  };

  const handleRefresh = () => {
    startScan();
  };

  const handleJoinRoom = async (room: DiscoveredRoom) => {
    setSelectedRoom(room.roomId);
    setIsJoining(true);

    try {
      roomService.stopScanning();
      const success = await roomService.joinRoom(room);

      if (success) {
        router.replace('/room');
      } else {
        Alert.alert(
          'Connessione fallita',
          'Impossibile connettersi alla stanza. Riprova.',
          [{ text: 'OK', onPress: () => setSelectedRoom(null) }]
        );
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore durante la connessione');
      setSelectedRoom(null);
    } finally {
      setIsJoining(false);
    }
  };

  // Sort rooms by signal strength
  const sortedRooms = [...discoveredRooms].sort((a, b) => b.rssi - a.rssi);

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Trova Stanze"
        subtitle={isScanning ? 'Ricerca in corso...' : `${sortedRooms.length} stanze trovate`}
        showBack
        onBack={() => {
          roomService.stopScanning();
          router.back();
        }}
        rightIcon="🔄"
        onRightPress={handleRefresh}
      />

      {/* Scanning Indicator */}
      {isScanning && (
        <View style={styles.scanningBar}>
          <ActivityIndicator size="small" color={Colors.secondary} />
          <Text style={styles.scanningText}>
            Cercando stanze nelle vicinanze...
          </Text>
        </View>
      )}

      {/* Room List */}
      <FlatList
        data={sortedRooms}
        keyExtractor={(item) => item.roomId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor={Colors.secondary}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <RoomCard
              room={item}
              onPress={() => handleJoinRoom(item)}
            />
            {selectedRoom === item.roomId && isJoining && (
              <View style={styles.joiningOverlay}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.joiningText}>Connessione in corso...</Text>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isScanning ? (
            <EmptyState
              icon="📡"
              title="Nessuna stanza trovata"
              description="Assicurati che il Bluetooth sia attivo e che ci siano stanze attive nelle vicinanze."
              actionTitle="Riprova"
              onAction={handleRefresh}
            />
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Tips */}
      {sortedRooms.length === 0 && !isScanning && (
        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>💡 Suggerimenti</Text>
          <Text style={styles.tipText}>• Avvicinati al dispositivo host</Text>
          <Text style={styles.tipText}>• Verifica che il Bluetooth sia attivo</Text>
          <Text style={styles.tipText}>• L'host deve avere la stanza aperta</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  scanningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.secondaryGlow,
    gap: Spacing.sm,
  },

  scanningText: {
    fontSize: Typography.sizes.sm,
    color: Colors.secondary,
    fontWeight: '500',
  },

  listContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },

  cardWrapper: {
    position: 'relative',
  },

  separator: {
    height: Spacing.md,
  },

  joiningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  joiningText: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    fontWeight: '500',
  },

  tips: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  tipsTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  tipText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
});

