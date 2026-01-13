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
import { venueRelay } from '../src/venue/relay';
import { useLibraryStore } from '../src/stores/libraryStore';
import { lanHostState } from '../src/lanHost/hostState';
import { RoomRole, SharedFileMetadata, TransferDirection, TransportMode, AudioFormat } from '../src/types';
import { documentDirectory, getInfoAsync, makeDirectoryAsync, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
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
        'Disconnected',
        'Connection to venue host was lost.',
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
  // In venue mode (WiFi LAN), everyone can share files unless room is locked
  const isVenueMode = isVenueModeCheck;
  const isRoomLocked = room.locked === true;
  // Check if this device created the phone-hosted room (can bypass lock)
  const isRoomCreator = lanHostState.isHostPeer(deviceId);
  // Host can always share; room creator can always share; others can only share if room is not locked
  const canShare = isHost || isRoomCreator || (isVenueMode && !isRoomLocked);
  
  // Debug logging
  console.log('[Room] canShare check:', { isHost, isRoomCreator, isVenueMode, isRoomLocked, deviceId, canShare });
  const myFiles = sharedFiles.filter((f) => f.ownerId === deviceId);
  const otherFiles = sharedFiles.filter((f) => f.ownerId !== deviceId);
  const activeTransfers = transfers.filter(
    (t) => t.state === 'in_progress' || t.state === 'pending' || t.state === 'requesting'
  );

  const handleLeaveRoom = () => {
    Alert.alert(
      isHost ? 'Close room?' : 'Leave room?',
      isHost
        ? 'All participants will be disconnected.'
        : 'Ongoing transfers will be cancelled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isHost ? 'Close' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            await roomService.leaveRoom();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleDownloadFile = async (file: SharedFileMetadata) => {
    // Check if connected to venue
    const ws = venueLanTransport.getWebSocket?.();
    const isVenueDownload = isVenueModeCheck && ws && ws.readyState === WebSocket.OPEN;
    
    // Start transfer in UI
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

    if (isVenueDownload) {
      // Real download via venue relay
      console.log('[Room] Starting real download via venue relay:', file.fileName);
      
      // Derive mimeType from format
      const mimeType = file.format === AudioFormat.MP3 ? 'audio/mpeg' 
        : file.format === AudioFormat.AAC ? 'audio/aac'
        : file.format === AudioFormat.FLAC ? 'audio/flac'
        : file.format === AudioFormat.WAV ? 'audio/wav'
        : 'audio/mpeg';
      
      venueRelay.requestDownload(
        ws,
        file.fileId,
        {
          size: file.sizeBytes,
          mimeType,
          sha256: '', // Will be verified later
        },
        // Progress callback
        (progress) => {
          console.log('[Room] Download progress:', progress.progress, '%');
          updateProgress(transferId, progress.bytesTransferred, 500000);
        },
        // Complete callback
        async (data) => {
          console.log('[Room] Download complete, saving to library...');
          
          try {
            // Ensure library directory exists
            const libraryDir = `${documentDirectory}library/`;
            const dirInfo = await getInfoAsync(libraryDir);
            if (!dirInfo.exists) {
              await makeDirectoryAsync(libraryDir, { intermediates: true });
            }
            
            // Save file
            const safeFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileUri = `${libraryDir}${safeFileName}`;
            
            // Convert Uint8Array to base64 in chunks to avoid stack overflow
            const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
              const CHUNK_SIZE = 8192;
              let binary = '';
              for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
                binary += String.fromCharCode.apply(null, Array.from(chunk));
              }
              return btoa(binary);
            };
            
            const base64 = uint8ArrayToBase64(data);
            await writeAsStringAsync(fileUri, base64, {
              encoding: EncodingType.Base64,
            });
            
            console.log('[Room] File saved to:', fileUri);
            
            // Add to library
            const addTrack = useLibraryStore.getState().addTrack;
            // Use file.title if available, otherwise extract from fileName
            const trackTitle = file.title || file.fileName.replace(/\.[^/.]+$/, '');
            addTrack({
              title: trackTitle,
              artist: file.ownerName === 'Venue Host' ? undefined : file.ownerName,
              durationMs: (file.duration || 0) * 1000,
              size: file.size,
              mimeType,
              localUri: fileUri,
              source: 'downloaded',
            });
            
            console.log('[Room] Track added to library:', trackTitle);
            
            completeTransfer(transferId);
            Alert.alert('Download complete', `"${trackTitle}" has been added to your library.`);
          } catch (error: any) {
            console.error('[Room] Failed to save downloaded file:', error);
            cancelTransfer(transferId);
            Alert.alert('Error', 'Unable to save downloaded file.');
          }
        },
        // Error callback
        (error) => {
          console.error('[Room] Download error:', error);
          cancelTransfer(transferId);
          Alert.alert('Download error', error);
        }
      );
    } else {
      // Fallback: simulate progress (for non-venue mode)
      console.log('[Room] Simulating download (not in venue mode)');
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
    }
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
          📥 Transfers ({activeTransfers.length})
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
            <Text style={styles.sectionTitle}>Your shared files</Text>
            {myFiles.map((file) => (
              <View key={file.fileId} style={styles.fileWrapper}>
                <FileCard file={file} onPress={() => {}} />
              </View>
            ))}
            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
              Available files
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
          title="No files available"
          description={
            canShare
              ? 'Share files from your library to get started'
              : 'No one is sharing files in this room'
          }
          actionTitle={canShare ? 'Share files' : undefined}
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
          title="No transfers"
          description="Active and completed transfers will appear here"
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
            {item.sharedFileCount} shared file{item.sharedFileCount === 1 ? '' : 's'} • {item.isOnline ? '🟢 Online' : '⚪ Offline'}
          </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <EmptyState
          icon="👥"
          title={isHost ? 'Waiting for participants' : 'Only you in the room'}
          description={
            isHost
              ? 'Other devices can join by scanning for the room'
              : 'Other participants will appear here'
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
          <Text style={styles.statusText}>{peers.length + 1} in room</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <Text style={styles.statusIcon}>📁</Text>
          <Text style={styles.statusText}>{sharedFiles.length} file{sharedFiles.length === 1 ? '' : 's'}</Text>
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

