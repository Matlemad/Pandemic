/**
 * Join Screen - Discover and join nearby rooms (P2P + Venue)
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  TouchableOpacity,
  TextInput,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../src/components/Header';
import { RoomCard } from '../src/components/RoomCard';
import { VenueRoomCard } from '../src/components/VenueRoomCard';
import { EmptyState } from '../src/components/EmptyState';
import { useRoomStore } from '../src/stores/roomStore';
import roomService from '../src/services/RoomService';
import { useVenueDiscovery } from '../src/hooks/useVenueDiscovery';
import { venueLanTransport } from '../src/venue/transport';
import { bleService } from '../src/services/BleService';
import { DiscoveredRoom, TransportMode } from '../src/types';
import { DiscoveredVenueHost } from '../src/venue/types';
import { Colors, Spacing, Typography, BorderRadius } from '../src/constants/theme';

type RoomSection = {
  title: string;
  type: 'p2p' | 'venue';
  data: (DiscoveredRoom | DiscoveredVenueHost)[];
};

export default function JoinScreen() {
  const discoveredRooms = useRoomStore((state) => state.discoveredRooms);
  const isScanning = useRoomStore((state) => state.isScanning);
  const clearDiscoveredRooms = useRoomStore((state) => state.clearDiscoveredRooms);

  const {
    isAvailable: venueAvailable,
    isScanning: venueScanning,
    venueHosts,
    startDiscovery: startVenueDiscovery,
    stopDiscovery: stopVenueDiscovery,
  } = useVenueDiscovery();

  const [isJoining, setIsJoining] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('8787');
  
  // Hotspot credentials modal
  const [showHotspotModal, setShowHotspotModal] = useState(false);
  const [hotspotInfo, setHotspotInfo] = useState<{
    ssid: string;
    password: string;
    roomName: string;
    hostAddress: string;
    wsPort: number;
  } | null>(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  
  // Detect older Android with mDNS issues
  const isOlderAndroid = Platform.OS === 'android' && Platform.Version < 31; // Android < 12
  const [showOldAndroidWarning, setShowOldAndroidWarning] = useState(isOlderAndroid);

  // Start scanning on mount - only once!
  useEffect(() => {
    console.log('[Join] Component mounted, starting discovery');
    startScan(false); // Don't clear existing rooms
    
    return () => {
      console.log('[Join] Component unmounting, stopping discovery');
      roomService.stopScanning();
      // Don't stop venue discovery if we're already connected to a venue
      if (!venueLanTransport.isConnectedToVenue()) {
        stopVenueDiscovery();
      }
    };
  }, []); // Empty deps - only run on mount/unmount
  
  // Separate effect for periodic refresh - uses refs to avoid re-triggering
  const venueHostsRef = useRef(venueHosts);
  const discoveredRoomsRef = useRef(discoveredRooms);
  
  useEffect(() => {
    venueHostsRef.current = venueHosts;
    discoveredRoomsRef.current = discoveredRooms;
  }, [venueHosts, discoveredRooms]);
  
  useEffect(() => {
    // Periodic refresh only if nothing found (for older Android)
    const refreshInterval = setInterval(() => {
      const hasVenueHosts = venueHostsRef.current.length > 0;
      const hasP2pRooms = discoveredRoomsRef.current.length > 0;
      
      if (!hasVenueHosts && !hasP2pRooms) {
        console.log('[Join] No rooms found after 60s, attempting discovery refresh');
        roomService.startScanning();
        if (venueAvailable) {
          startVenueDiscovery();
        }
      }
    }, 60000);
    
    return () => clearInterval(refreshInterval);
  }, [venueAvailable]);

  const startScan = async (clearExisting = true) => {
    if (clearExisting) {
      clearDiscoveredRooms();
    }
    
    // Start P2P discovery
    await roomService.startScanning();
    
    // Start venue discovery if available
    if (venueAvailable) {
      await startVenueDiscovery();
    }
  };

  const handleRefresh = () => {
    startScan();
  };

  // Handle BLE room - try to get hotspot credentials via GATT
  const handleGetHotspotCredentials = async (room: DiscoveredRoom, deviceId: string) => {
    setIsLoadingCredentials(true);
    setSelectedId(room.roomId);
    
    try {
      console.log('[Join] Reading hotspot credentials via GATT for device:', deviceId);
      const roomInfo = await bleService.readRoomInfoViaGATT(deviceId);
      
      if (roomInfo && roomInfo.hotspotSSID) {
        console.log('[Join] Got hotspot credentials:', roomInfo.hotspotSSID);
        setHotspotInfo({
          ssid: roomInfo.hotspotSSID,
          password: roomInfo.hotspotPassword || '',
          roomName: roomInfo.roomName,
          hostAddress: roomInfo.hostAddress || '',
          wsPort: roomInfo.wsPort || 8787,
        });
        setShowHotspotModal(true);
      } else {
        // No hotspot credentials - this is a regular LAN room, try to join directly
        Alert.alert(
          'Stanza LAN Trovata',
          `Per unirti a "${room.roomName}", assicurati di essere sulla stessa rete Wi-Fi dell'host.`,
          [
            { text: 'Annulla', style: 'cancel' },
            { text: 'Prova a Connettersi', onPress: () => handleJoinRoom(room) },
          ]
        );
      }
    } catch (error: any) {
      console.error('[Join] Failed to get credentials:', error);
      Alert.alert('Errore', 'Impossibile ottenere le credenziali hotspot. Riprova.');
    } finally {
      setIsLoadingCredentials(false);
      setSelectedId(null);
    }
  };
  
  // Show password in alert for easy copying
  const handleCopyPassword = () => {
    if (hotspotInfo?.password) {
      Alert.alert(
        'Password Hotspot',
        hotspotInfo.password,
        [{ text: 'OK' }]
      );
    }
  };
  
  // Open Wi-Fi settings
  const openWifiSettings = async () => {
    try {
      if (Platform.OS === 'ios') {
        // iOS: Open Wi-Fi settings directly
        await Linking.openURL('App-Prefs:WIFI');
      } else {
        // Android: Open Wi-Fi settings
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      }
    } catch (error) {
      // Fallback: open general settings
      try {
        if (Platform.OS === 'ios') {
          await Linking.openURL('app-settings:');
        } else {
          await Linking.openSettings();
        }
      } catch {
        Alert.alert('Errore', 'Impossibile aprire le impostazioni Wi-Fi. Aprile manualmente.');
      }
    }
  };
  
  // After user connects to hotspot, try to join the room
  const handleConnectAfterHotspot = async () => {
    if (!hotspotInfo) return;
    
    setShowHotspotModal(false);
    setIsJoining(true);
    
    try {
      // Build the venue URL from hotspot info
      // The host IP on hotspot is typically the gateway (e.g., 192.168.43.1)
      // We try common hotspot gateway IPs
      const commonHotspotIPs = [
        '192.168.43.1',  // Android default
        '172.20.10.1',   // iOS default  
        hotspotInfo.hostAddress, // Try the advertised address too
      ].filter(Boolean);
      
      let connected = false;
      
      for (const ip of commonHotspotIPs) {
        if (!ip) continue;
        console.log('[Join] Trying to connect to hotspot host at:', ip);
        
        try {
          const url = `ws://${ip}:${hotspotInfo.wsPort}`;
          await venueLanTransport.connectToUrl(url);
          connected = true;
          console.log('[Join] Connected to hotspot host at:', ip);
          break;
        } catch (e) {
          console.log('[Join] Failed to connect to', ip, '- trying next');
        }
      }
      
      if (connected) {
        router.replace('/room');
      } else {
        Alert.alert(
          'Connessione Fallita',
          'Non riesco a trovare l\'host. Assicurati di essere connesso all\'hotspot e riprova.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore durante la connessione');
    } finally {
      setIsJoining(false);
      setHotspotInfo(null);
    }
  };

  const handleJoinRoom = async (room: DiscoveredRoom) => {
    setSelectedId(room.roomId);
    setIsJoining(true);

    try {
      roomService.stopScanning();
      // Don't stop venue discovery - let it continue in background
      // to avoid losing pending resolutions
      
      const success = await roomService.joinRoom(room);

      if (success) {
        router.replace('/room');
      } else {
        Alert.alert(
          'Connessione fallita',
          'Impossibile connettersi alla stanza. Riprova.',
          [{ text: 'OK', onPress: () => setSelectedId(null) }]
        );
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore durante la connessione');
      setSelectedId(null);
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinVenue = async (venue: DiscoveredVenueHost) => {
    const venueId = `${venue.host}:${venue.port}`;
    setSelectedId(venueId);
    setIsJoining(true);

    try {
      roomService.stopScanning();
      // Don't stop venue discovery - let it continue in background
      // to avoid losing pending resolutions
      
      // Setup callbacks before connecting
      const roomStore = useRoomStore.getState();
      
      // Handle disconnection from venue host
      venueLanTransport.setOnDisconnected(() => {
        console.log('Disconnected from host');
        Alert.alert(
          'Disconnesso',
          'La connessione al venue host è stata persa.',
          [{ text: 'OK', onPress: () => {
            roomStore.leaveRoom();
            router.replace('/');
          }}]
        );
      });
      
      venueLanTransport.setOnFilesUpdated((files) => {
        console.log('[Venue] Files updated:', files.length);
        // Convert venue files to SharedFileMetadata format
        // Note: We use addSharedFile for each file to match expected interface
        for (const f of files) {
          roomStore.addSharedFile({
            fileId: f.id,
            fileName: f.title,
            title: f.title,
            artist: f.artist || null,
            album: null,
            duration: 0,
            format: 'audio/mpeg' as any,
            sizeBytes: f.size,
            bitrate: null,
            sampleRate: null,
            localPath: '',
            addedAt: Date.now(),
            checksum: f.sha256,
            ownerId: f.ownerPeerId,
            ownerName: f.ownerName,
            ownerAddress: null,
            isSharedByMe: false,
          });
        }
      });
      
      venueLanTransport.setOnPeerJoined((peer) => {
        console.log('[Venue] Peer joined:', peer.deviceName);
        roomStore.addPeer({
          peerId: peer.peerId,
          peerName: peer.deviceName,
          address: null,
          joinedAt: Date.now(),
          sharedFileCount: 0,
          isOnline: true,
        });
      });
      
      venueLanTransport.setOnPeerLeft((peerId) => {
        console.log('[Venue] Peer left:', peerId);
        roomStore.removePeer(peerId);
      });
      
      // Update room info when received from host (includes lock status)
      venueLanTransport.setOnRoomJoined((info) => {
        console.log('[Venue] Room info received, locked:', info.locked);
        const state = useRoomStore.getState();
        const currentRoom = state.room;
        if (currentRoom) {
          // Update locked status from host
          state.joinRoom({
            ...currentRoom,
            locked: info.locked ?? false,
          });
        }
      });
      
      await venueLanTransport.connectToVenueHost(venue);
      
      // Set room in store so room.tsx doesn't redirect back
      roomStore.joinRoom({
        roomId: venueId,
        roomName: venue.txt.room || venue.name,
        hostId: `venue-${venueId}`,
        hostName: venue.name,
        hostAddress: `${venue.host}:${venue.port}`,
        wifiAvailable: true,
        peerCount: 0,
        createdAt: Date.now(),
        locked: venue.txt.lock === '1',
      });
      
      router.replace('/room');
    } catch (error: any) {
      Alert.alert(
        'Connessione Venue fallita',
        error.message || 'Impossibile connettersi al venue host.',
        [{ text: 'OK', onPress: () => setSelectedId(null) }]
      );
    } finally {
      setIsJoining(false);
    }
  };

  // Handle manual venue connection
  const handleManualConnect = async () => {
    if (!manualIp.trim()) {
      Alert.alert('Errore', 'Inserisci un indirizzo IP');
      return;
    }
    
    const port = parseInt(manualPort, 10) || 8787;
    const manualVenue: DiscoveredVenueHost = {
      name: `Manual Venue (${manualIp}:${port})`,
      host: manualIp.trim(),
      port,
      fullName: `_audiowallet._tcp.local.`,
      discoveredAt: Date.now(),
      txt: {
        v: '1',
        room: 'Pandemic Venue',
        relay: '1',
      },
    };
    
    setShowManualConnect(false);
    handleJoinVenue(manualVenue);
  };

  // Sort rooms by signal strength
  const sortedRooms = [...discoveredRooms].sort((a, b) => b.rssi - a.rssi);

  // Build sections
  const sections: RoomSection[] = [];
  
  if (venueHosts.length > 0) {
    sections.push({
      title: '📡 Venue Rooms (Wi-Fi Cross-Platform)',
      type: 'venue',
      data: venueHosts,
    });
  }
  
  if (sortedRooms.length > 0) {
    sections.push({
      title: '📱 Stanze Vicine (P2P)',
      type: 'p2p',
      data: sortedRooms,
    });
  }

  const isAnySanning = isScanning || venueScanning;
  const totalCount = sortedRooms.length + venueHosts.length;

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Trova Stanze"
        subtitle={isAnySanning ? 'Ricerca in corso...' : `${totalCount} stanze trovate`}
        showBack
        onBack={() => {
          roomService.stopScanning();
          stopVenueDiscovery();
          router.back();
        }}
        rightIcon="🔄"
        onRightPress={handleRefresh}
      />

      {/* Scanning Indicator */}
      {isAnySanning && (
        <View style={styles.scanningBar}>
          <ActivityIndicator size="small" color={Colors.secondary} />
          <Text style={styles.scanningText}>
            {venueScanning && isScanning
              ? 'Cercando P2P e Venue...'
              : venueScanning
              ? 'Cercando venue hosts...'
              : 'Cercando stanze P2P...'}
          </Text>
        </View>
      )}
      
      {/* Warning for older Android */}
      {showOldAndroidWarning && totalCount === 0 && (
        <View style={styles.oldAndroidWarning}>
          <View style={styles.warningHeader}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>Android {Platform.Version}</Text>
            <TouchableOpacity onPress={() => setShowOldAndroidWarning(false)}>
              <Text style={styles.warningClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.warningText}>
            La discovery automatica potrebbe non funzionare su questa versione di Android.
          </Text>
          <TouchableOpacity 
            style={styles.warningConnectButton}
            onPress={() => setShowManualConnect(true)}
          >
            <Text style={styles.warningConnectButtonText}>📶 Connetti Manualmente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Room List */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          keyExtractor={(item: DiscoveredRoom | DiscoveredVenueHost, index: number) => 
            'roomId' in item ? item.roomId : `${item.host}:${item.port}`
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor={Colors.secondary}
            />
          }
          renderSectionHeader={({ section }: { section: RoomSection }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.type === 'venue' && (
                <View style={styles.crossPlatformTag}>
                  <Text style={styles.crossPlatformTagText}>🍎↔️🤖</Text>
                </View>
              )}
            </View>
          )}
          renderItem={({ item, section }: { item: DiscoveredRoom | DiscoveredVenueHost; section: RoomSection }) => {
            if (section.type === 'venue') {
              const venue = item as DiscoveredVenueHost;
              const venueId = `${venue.host}:${venue.port}`;
              return (
                <View style={styles.cardWrapper}>
                  <VenueRoomCard
                    venue={venue}
                    onPress={() => handleJoinVenue(venue)}
                    isConnecting={selectedId === venueId && isJoining}
                  />
                  {selectedId === venueId && isJoining && (
                    <View style={styles.joiningOverlay}>
                      <ActivityIndicator size="large" color={Colors.accent} />
                      <Text style={styles.joiningText}>Connessione al Venue...</Text>
                    </View>
                  )}
                </View>
              );
            } else {
              const room = item as DiscoveredRoom;
              // Check if this is a BLE room - try to get hotspot credentials first
              const handleRoomPress = () => {
                if (room.bleDeviceId) {
                  // BLE room - try to get hotspot credentials via GATT
                  handleGetHotspotCredentials(room, room.bleDeviceId);
                } else {
                  // Regular room - join directly
                  handleJoinRoom(room);
                }
              };
              
              return (
                <View style={styles.cardWrapper}>
                  <RoomCard 
                    room={room} 
                    onPress={handleRoomPress}
                    isBleRoom={!!room.bleDeviceId}
                  />
                  {selectedId === room.roomId && (isJoining || isLoadingCredentials) && (
                    <View style={styles.joiningOverlay}>
                      <ActivityIndicator size="large" color={Colors.primary} />
                      <Text style={styles.joiningText}>
                        {isLoadingCredentials ? 'Lettura credenziali...' : 'Connessione in corso...'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
          stickySectionHeadersEnabled={false}
        />
      ) : !isAnySanning ? (
        <EmptyState
          icon="📡"
          title="Nessuna stanza trovata"
          description={
            venueAvailable
              ? 'Assicurati che ci siano stanze P2P vicine o che tu sia connesso alla stessa rete Wi-Fi del venue host.'
              : 'Assicurati che il Bluetooth sia attivo e che ci siano stanze attive nelle vicinanze.'
          }
          actionTitle="Riprova"
          onAction={handleRefresh}
        />
      ) : null}

      {/* Tips */}
      {totalCount === 0 && !isAnySanning && (
        <View style={styles.tips}>
          <Text style={styles.tipsTitle}>💡 Suggerimenti</Text>
          <Text style={styles.tipText}>• Avvicinati al dispositivo host (P2P)</Text>
          <Text style={styles.tipText}>• Connettiti alla stessa rete Wi-Fi del Venue</Text>
          <Text style={styles.tipText}>• Verifica che il Bluetooth sia attivo</Text>
          {venueAvailable && (
            <Text style={styles.tipText}>• I Venue Rooms funzionano anche Android↔iOS</Text>
          )}
        </View>
      )}

      {/* Manual Connect Button */}
      <TouchableOpacity 
        style={styles.manualConnectButton}
        onPress={() => setShowManualConnect(true)}
      >
        <Text style={styles.manualConnectText}>📶 Connetti manualmente a Venue Host</Text>
      </TouchableOpacity>

      {/* Hotspot Credentials Modal */}
      <Modal
        visible={showHotspotModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHotspotModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔥 Connessione Hotspot</Text>
            <Text style={styles.modalSubtitle}>
              Per unirti a "{hotspotInfo?.roomName}", connettiti all'hotspot dell'host:
            </Text>
            
            <View style={styles.hotspotCredentials}>
              <View style={styles.hotspotRow}>
                <Text style={styles.hotspotLabel}>Nome Rete:</Text>
                <Text style={styles.hotspotValue}>{hotspotInfo?.ssid}</Text>
              </View>
              
              <View style={styles.hotspotRow}>
                <Text style={styles.hotspotLabel}>Password:</Text>
                <View style={styles.passwordRow}>
                  <Text style={styles.hotspotValue}>{hotspotInfo?.password || '(nessuna)'}</Text>
                  {hotspotInfo?.password && (
                    <TouchableOpacity onPress={handleCopyPassword} style={styles.copyButton}>
                      <Text style={styles.copyButtonText}>📋</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
            
            <Text style={styles.hotspotInstructions}>
              1. Premi "Apri Wi-Fi" per andare alle impostazioni{'\n'}
              2. Connettiti a "{hotspotInfo?.ssid}"{'\n'}
              3. Torna qui e premi "Sono Connesso"
            </Text>
            
            {/* Open Wi-Fi Settings Button */}
            <TouchableOpacity
              style={styles.openWifiButton}
              onPress={openWifiSettings}
            >
              <Text style={styles.openWifiButtonText}>📶 Apri Impostazioni Wi-Fi</Text>
            </TouchableOpacity>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowHotspotModal(false);
                  setHotspotInfo(null);
                }}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConnectButton}
                onPress={handleConnectAfterHotspot}
                disabled={isJoining}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.modalConnectText}>✅ Sono Connesso</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual Connect Modal */}
      <Modal
        visible={showManualConnect}
        transparent
        animationType="slide"
        onRequestClose={() => setShowManualConnect(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Connessione Manuale</Text>
            <Text style={styles.modalSubtitle}>
              Inserisci l'IP del venue host (visibile nella console del server)
            </Text>
            
            <Text style={styles.inputLabel}>Indirizzo IP</Text>
            <TextInput
              style={styles.textInput}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="es. 192.168.1.5"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
              autoCapitalize="none"
            />
            
            <Text style={styles.inputLabel}>Porta (default: 8787)</Text>
            <TextInput
              style={styles.textInput}
              value={manualPort}
              onChangeText={setManualPort}
              placeholder="8787"
              placeholderTextColor={Colors.textSecondary}
              keyboardType="numeric"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowManualConnect(false)}
              >
                <Text style={styles.modalCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConnectButton}
                onPress={handleManualConnect}
              >
                <Text style={styles.modalConnectText}>Connetti</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },

  sectionTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  crossPlatformTag: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },

  crossPlatformTagText: {
    fontSize: Typography.sizes.sm,
  },

  sectionSeparator: {
    height: Spacing.lg,
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

  manualConnectButton: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },

  manualConnectText: {
    fontSize: Typography.sizes.md,
    color: Colors.secondary,
    fontWeight: '500',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },

  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
  },

  modalTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  modalSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },

  inputLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },

  textInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
  },

  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },

  modalCancelButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },

  modalCancelText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },

  modalConnectButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },

  modalConnectText: {
    fontSize: Typography.sizes.md,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Hotspot modal styles
  hotspotCredentials: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },

  hotspotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },

  hotspotLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },

  hotspotValue: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  copyButton: {
    padding: Spacing.xs,
  },

  copyButtonText: {
    fontSize: 18,
  },

  hotspotInstructions: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginTop: Spacing.sm,
  },

  openWifiButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  openWifiButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.md,
    fontWeight: '600',
  },

  // Old Android warning styles
  oldAndroidWarning: {
    backgroundColor: '#2a2a1e',
    borderWidth: 1,
    borderColor: '#f5a623',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    padding: Spacing.md,
  },

  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },

  warningIcon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },

  warningTitle: {
    flex: 1,
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: '#f5a623',
  },

  warningClose: {
    fontSize: 18,
    color: Colors.textSecondary,
    padding: Spacing.xs,
  },

  warningText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },

  warningConnectButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },

  warningConnectButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
  },
});
