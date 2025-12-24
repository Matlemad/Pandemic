/**
 * Room Screen - Active room view (both host and guest)
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../src/components/Header';
import { FileCard } from '../src/components/FileCard';
import { TransferItem } from '../src/components/TransferItem';
import { EmptyState } from '../src/components/EmptyState';
import { Button } from '../src/components/Button';
import { useRoomStore } from '../src/stores/roomStore';
import { useTransferStore } from '../src/stores/transferStore';
import { useAppStore } from '../src/stores/appStore';
import roomService from '../src/services/RoomService';
import { venueLanTransport } from '../src/venue/transport';
import { RoomRole, SharedFileMetadata, TransferDirection, TransportMode } from '../src/types';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';

type TabType = 'files' | 'transfers' | 'peers';

export default function RoomScreen() {
  const room = useRoomStore((state) => state.room);
  const role = useRoomStore((state) => state.role);
  const peers = useRoomStore((state) => state.peers);
  const sharedFiles = useRoomStore((state) => state.sharedFiles);
  const deviceId = useAppStore((state) => state.deviceId);
  const transfers = useTransferStore((state) => state.transfers);
  const startTransfer = useTransferStore((state) => state.startTransfer);
  const updateProgress = useTransferStore((state) => state.updateProgress);
  const completeTransfer = useTransferStore((state) => state.completeTransfer);
  const cancelTransfer = useTransferStore((state) => state.cancelTransfer);

  const [activeTab, setActiveTab] = useState<TabType>('files');

  // Redirect if not in room
  React.useEffect(() => {
    if (!room) {
      router.replace('/');
    }
  }, [room]);

  // Determine if we're in venue mode
  const isVenueModeCheck = room?.hostAddress?.includes(':8787') || room?.roomId?.includes(':');

  // Setup venue callbacks when in venue mode
  React.useEffect(() => {
    if (!isVenueModeCheck) return;

    console.log('[Room] Setting up venue callbacks');
    const roomStore = useRoomStore.getState();

    // Handle file updates from venue
    venueLanTransport.setOnFilesUpdated((files) => {
      console.log('[Room] Venue files updated:', files.length);
      // Clear existing shared files and add new ones
      roomStore.updateSharedFiles(files.map((f) => ({
        fileId: f.id,
        fileName: f.title,
        title: f.title,
        artist: f.artist || null,
        album: null,
        duration: f.duration || 0,
        format: 'audio/mpeg' as any,
        sizeBytes: f.size,
        bitrate: null,
        sampleRate: null,
        localPath: '',
        addedAt: f.addedAt || Date.now(),
        checksum: f.sha256,
        ownerId: f.ownerPeerId,
        ownerName: f.ownerName,
        ownerAddress: null,
        isSharedByMe: f.ownerPeerId === deviceId,
      })));
    });

    // Handle peer updates
    venueLanTransport.setOnPeerJoined((peer) => {
      console.log('[Room] Venue peer joined:', peer.deviceName);
      roomStore.addPeer({
        peerId: peer.peerId,
        peerName: peer.deviceName,
        address: null,
        joinedAt: peer.joinedAt,
        sharedFileCount: peer.sharedFileCount,
        isOnline: true,
      });
    });

    venueLanTransport.setOnPeerLeft((peerId) => {
      console.log('[Room] Venue peer left:', peerId);
      roomStore.removePeer(peerId);
    });

    // Handle disconnection
    venueLanTransport.setOnDisconnected(() => {
      console.log('[Room] Disconnected from venue host');
      Alert.alert(
        'Disconnesso',
        'La connessione al venue host è stata persa.',
        [{ text: 'OK', onPress: () => {
          roomStore.leaveRoom();
          router.replace('/');
        }}]
      );
    });

    return () => {
      // Cleanup callbacks
      venueLanTransport.setOnFilesUpdated(() => {});
      venueLanTransport.setOnPeerJoined(() => {});
      venueLanTransport.setOnPeerLeft(() => {});
      venueLanTransport.setOnDisconnected(() => {});
    };
  }, [isVenueModeCheck, deviceId]);

  if (!room) return null;

  const isHost = role === RoomRole.HOST;
  // In venue mode (WiFi LAN), everyone can share files
  const isVenueMode = isVenueModeCheck;
  const canShare = isHost || isVenueMode; // Host or venue participant can share
  const myFiles = sharedFiles.filter((f) => f.ownerId === deviceId);
  const otherFiles = sharedFiles.filter((f) => f.ownerId !== deviceId);
  const activeTransfers = transfers.filter(
    (t) => t.state === 'in_progress' || t.state === 'pending' || t.state === 'requesting'
  );

  const handleLeaveRoom = () => {
    Alert.alert(
      isHost ? 'Chiudi stanza?' : 'Esci dalla stanza?',
      isHost
        ? 'Tutti i partecipanti verranno disconnessi.'
        : 'I trasferimenti in corso verranno annullati.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: isHost ? 'Chiudi' : 'Esci',
          style: 'destructive',
          onPress: async () => {
            await roomService.leaveRoom();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleDownloadFile = (file: SharedFileMetadata) => {
    // Start simulated transfer
    const transferId = startTransfer({
      fileId: file.fileId,
      fileName: file.fileName,
      fileSize: file.sizeBytes,
      direction: TransferDirection.DOWNLOAD,
      peerId: file.ownerId,
      peerName: file.ownerName,
      state: 'pending' as any,
      transportMode: TransportMode.WIFI_LAN,
    });

    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        clearInterval(interval);
        completeTransfer(transferId);
      } else {
        updateProgress(
          transferId,
          Math.floor((progress / 100) * file.sizeBytes),
          Math.random() * 500000 + 100000 // Random speed
        );
      }
    }, 500);
  };

  const handleShareFiles = () => {
    router.push('/library');
  };

  const renderTabs = () => (
    <View style={styles.tabs}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'files' && styles.activeTab]}
        onPress={() => setActiveTab('files')}
      >
        <Text style={[styles.tabText, activeTab === 'files' && styles.activeTabText]}>
          🎵 File ({sharedFiles.length})
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'transfers' && styles.activeTab]}
        onPress={() => setActiveTab('transfers')}
      >
        <Text style={[styles.tabText, activeTab === 'transfers' && styles.activeTabText]}>
          📥 Trasferimenti ({activeTransfers.length})
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'peers' && styles.activeTab]}
        onPress={() => setActiveTab('peers')}
      >
        <Text style={[styles.tabText, activeTab === 'peers' && styles.activeTabText]}>
          👥 Peers ({peers.length})
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderFilesTab = () => (
    <FlatList
      data={otherFiles}
      keyExtractor={(item) => item.fileId}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        myFiles.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>I tuoi file condivisi</Text>
            {myFiles.map((file) => (
              <View key={file.fileId} style={styles.fileWrapper}>
                <FileCard file={file} onPress={() => {}} />
              </View>
            ))}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
              File disponibili
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        const transfer = transfers.find((t) => t.fileId === item.fileId);
        return (
          <View style={styles.fileWrapper}>
            <FileCard
              file={item}
              onPress={() => {}}
              onDownload={() => handleDownloadFile(item)}
              isDownloading={
                transfer?.state === 'in_progress' || transfer?.state === 'pending'
              }
              downloadProgress={transfer?.progress || 0}
            />
          </View>
        );
      }}
      ListEmptyComponent={
        <EmptyState
          icon="📂"
          title="Nessun file disponibile"
          description={
            canShare
              ? 'Condividi file dalla tua libreria per iniziare'
              : 'Nessuno sta condividendo file in questa stanza'
          }
          actionTitle={canShare ? 'Condividi file' : undefined}
          onAction={canShare ? handleShareFiles : undefined}
        />
      }
    />
  );

  const renderTransfersTab = () => (
    <FlatList
      data={transfers}
      keyExtractor={(item) => item.transferId}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.transferWrapper}>
          <TransferItem
            transfer={item}
            onCancel={() => cancelTransfer(item.transferId)}
          />
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          icon="📦"
          title="Nessun trasferimento"
          description="I trasferimenti attivi e completati appariranno qui"
        />
      }
    />
  );

  const renderPeersTab = () => (
    <FlatList
      data={peers}
      keyExtractor={(item) => item.peerId}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => (
        <View style={styles.peerCard}>
          <View style={styles.peerAvatar}>
            <Text style={styles.peerAvatarText}>
              {item.peerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.peerInfo}>
            <Text style={styles.peerName}>{item.peerName}</Text>
            <Text style={styles.peerMeta}>
              {item.sharedFileCount} file condivisi • {item.isOnline ? '🟢 Online' : '⚪ Offline'}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          icon="👥"
          title={isHost ? 'In attesa di partecipanti' : 'Solo tu nella stanza'}
          description={
            isHost
              ? 'Altri dispositivi possono unirsi scansionando la stanza'
              : 'Altri partecipanti appariranno qui'
          }
        />
      }
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={room.roomName}
        subtitle={isVenueMode ? '📶 Venue Room' : isHost ? '👑 Host' : `Da: ${room.hostName}`}
        rightIcon="🚪"
        onRightPress={handleLeaveRoom}
      />

      {/* Room Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Text style={styles.statusIcon}>👥</Text>
          <Text style={styles.statusText}>{peers.length + 1} nella stanza</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusIcon}>📁</Text>
          <Text style={styles.statusText}>{sharedFiles.length} file</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusIcon}>
            {room.wifiAvailable ? '📶' : '📡'}
          </Text>
          <Text style={styles.statusText}>
            {room.wifiAvailable ? 'Wi-Fi' : 'BLE'}
          </Text>
        </View>
      </View>

      {/* Tabs */}
      {renderTabs()}

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {activeTab === 'files' && renderFilesTab()}
        {activeTab === 'transfers' && renderTransfersTab()}
        {activeTab === 'peers' && renderPeersTab()}
      </View>

      {/* Share FAB (Host or Venue participant) */}
      {canShare && activeTab === 'files' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleShareFiles}
          activeOpacity={0.8}
        >
          <Text style={styles.fabIcon}>➕</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  statusIcon: {
    fontSize: 14,
  },

  statusText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },

  statusDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },

  activeTab: {
    borderBottomColor: Colors.primary,
  },

  tabText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  activeTabText: {
    color: Colors.primary,
  },

  tabContent: {
    flex: 1,
  },

  // List
  listContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },

  section: {
    marginBottom: Spacing.md,
  },

  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  fileWrapper: {
    marginBottom: Spacing.md,
  },

  transferWrapper: {
    marginBottom: Spacing.md,
  },

  // Peer Card
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  peerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  peerAvatarText: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textInverse,
  },

  peerInfo: {
    flex: 1,
  },

  peerName: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  peerMeta: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  fabIcon: {
    fontSize: 24,
    color: Colors.textInverse,
  },
});

