/**
 * LAN Host Screen - Create and manage a phone-hosted LAN room
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Switch,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Network from 'expo-network';
import { Header } from '../src/components/Header';
import { Button } from '../src/components/Button';
import { useAppStore } from '../src/stores/appStore';
import { lanHostState } from '../src/lanHost/hostState';
import { phoneHostServer } from '../src/lanHost/PhoneHostServer';
import '../src/lanHost/wsHandler'; // Initialize WS handler
import { venueDiscovery, VENUE_SERVICE_TYPE } from '../src/venue/discovery';
import { bleAdvertisingNative } from '../src/services/native/BleAdvertisingNative';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';

export default function LanHostScreen() {
  const deviceName = useAppStore((state) => state.deviceName);
  
  const [roomName, setRoomName] = useState(`${deviceName}'s LAN Room`);
  const [locked, setLocked] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [isAdvertising, setIsAdvertising] = useState(false);
  const [wifiAvailable, setWifiAvailable] = useState(true); // Optimistic default
  const [localIp, setLocalIp] = useState<string | null>(null);
  
  // Hotspot credentials for BLE bootstrap
  const [hotspotSSID, setHotspotSSID] = useState('');
  const [hotspotPassword, setHotspotPassword] = useState('');
  const [isHotspotMode, setIsHotspotMode] = useState(false);
  const [isBleAdvertising, setIsBleAdvertising] = useState(false);
  
  const currentRoom = lanHostState.getRoom();
  
  // Check network state
  const checkNetworkState = useCallback(async () => {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const ip = await Network.getIpAddressAsync();
      
      // Wi-Fi with valid IP
      const hasWifiWithIp = networkState.type === Network.NetworkStateType.WIFI && 
                            ip && ip !== '0.0.0.0';
      
      // Hotspot mode: cellular/connected but IP might be 0.0.0.0 or unavailable
      // In this case, we still allow trying - the server will use the actual hotspot IP
      const mightBeHotspot = networkState.type === Network.NetworkStateType.CELLULAR ||
                             networkState.isConnected;
      
      // Be permissive: allow if we have wifi+ip OR might be hotspot mode
      setWifiAvailable(hasWifiWithIp || mightBeHotspot);
      setLocalIp(ip && ip !== '0.0.0.0' ? ip : null);
      
      console.log('[LanHost] Network check:', { 
        type: networkState.type, 
        isConnected: networkState.isConnected, 
        ip,
        hasWifiWithIp,
        mightBeHotspot
      });
    } catch (error) {
      console.warn('[LanHost] Network check failed:', error);
      // Be permissive - allow trying even if check fails
      setWifiAvailable(true);
    }
  }, []);
  
  // Load existing room state and check network
  useEffect(() => {
    checkNetworkState();
    
    if (currentRoom) {
      setRoomName(currentRoom.name);
      setLocked(currentRoom.locked);
      setIsHosting(true);
      checkServerStatus();
    }
    
    // Subscribe to state changes
    const unsubscribe = lanHostState.onChange((state) => {
      if (state.room) {
        setRoomName(state.room.name);
        setLocked(state.room.locked);
        setIsHosting(true);
        setPeerCount(lanHostState.getPeers().length);
      } else {
        setIsHosting(false);
        setPeerCount(0);
        setIsAdvertising(false);
      }
    });
    
    // Re-check network periodically
    const networkInterval = setInterval(checkNetworkState, 5000);
    
    return () => {
      unsubscribe();
      clearInterval(networkInterval);
    };
  }, [checkNetworkState]);
  
  // Check server and advertising status
  const checkServerStatus = async () => {
    const serverRunning = phoneHostServer.isServerRunning();
    const advertising = await venueDiscovery.isAdvertiseActive();
    setIsHosting(serverRunning);
    setIsAdvertising(advertising);
  };
  
  // Note: Server callbacks are managed by wsHandler.ts
  // UI updates come from lanHostState.onChange() subscription above
  
  const handleStartHosting = async () => {
    if (!roomName.trim()) {
      Alert.alert('Errore', 'Inserisci un nome per la stanza');
      return;
    }
    
    // Re-check network before starting
    await checkNetworkState();
    
    if (!wifiAvailable) {
      Alert.alert(
        'Rete Richiesta',
        'Per ospitare una LAN room, devi essere connesso a una rete Wi-Fi o avere un hotspot attivo.\n\nAttiva l\'hotspot dal tuo dispositivo o connettiti a una rete Wi-Fi.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setIsStarting(true);
    
    try {
      // Create/update room in state
      const room = lanHostState.createOrUpdateRoom(roomName.trim(), locked, 8787);
      
      // Start WebSocket server
      const serverStarted = await phoneHostServer.start(room);
      if (!serverStarted) {
        throw new Error('Impossibile avviare il server WebSocket');
      }
      
      // Start mDNS advertisement
      const txt: Record<string, string> = {
        v: '1',
        room: room.name,
        roomId: room.id,
        lock: locked ? '1' : '0',
        relay: '1',
        port: '8787',
      };
      
      const advertised = await venueDiscovery.startAdvertise(
        VENUE_SERVICE_TYPE,
        room.name,
        room.port,
        txt
      );
      
      if (!advertised) {
        console.warn('[LanHost] Failed to start mDNS advertisement, but server is running');
      }
      
      // Start BLE advertising if hotspot mode is enabled
      let bleStarted = false;
      if (isHotspotMode && hotspotSSID.trim()) {
        try {
          // Request BLE permissions on Android 12+
          if (Platform.OS === 'android') {
            const apiLevel = Platform.Version;
            if (typeof apiLevel === 'number' && apiLevel >= 31) {
              console.log('[LanHost] Requesting BLE permissions for Android 12+');
              const permissions = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              ]);
              
              const advertiseGranted = permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE] === 'granted';
              const connectGranted = permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted';
              
              if (!advertiseGranted || !connectGranted) {
                console.warn('[LanHost] BLE permissions not granted:', permissions);
                Alert.alert(
                  'Permessi BLE Richiesti',
                  'Per permettere ad altri di trovarti via Bluetooth, devi concedere i permessi Bluetooth nelle impostazioni.',
                  [{ text: 'OK' }]
                );
              }
            }
          }
          
          if (bleAdvertisingNative.isAvailable()) {
            const deviceId = useAppStore.getState().deviceId;
            bleStarted = await bleAdvertisingNative.startAdvertising({
              roomId: room.id,
              roomName: room.name,
              hostId: deviceId,
              hostName: deviceName,
              hostAddress: localIp,
              wifiAvailable: true,
              version: 1,
              hotspotSSID: hotspotSSID.trim(),
              hotspotPassword: hotspotPassword,
              wsPort: 8787,
            });
            console.log('[LanHost] BLE advertising started:', bleStarted);
          } else {
            console.warn('[LanHost] BLE advertising not available on this device');
          }
        } catch (bleError) {
          console.warn('[LanHost] BLE advertising failed:', bleError);
        }
      }
      setIsBleAdvertising(bleStarted);
      
      setIsHosting(true);
      setIsAdvertising(advertised);
      setPeerCount(0);
      
      const message = isHotspotMode && hotspotSSID.trim()
        ? `La stanza "${room.name}" è ora attiva.\n\n` +
          `📡 Hotspot: ${hotspotSSID}\n` +
          (bleStarted ? '✅ BLE attivo - altri device possono trovarti via Bluetooth' : '⚠️ BLE non disponibile') +
          '\n\nAltri dispositivi possono trovarti e connettersi all\'hotspot automaticamente.'
        : `La stanza "${room.name}" è ora attiva.\n\nAltri dispositivi sulla stessa rete Wi-Fi/hotspot possono trovarla e unirsi.`;
      
      Alert.alert('Stanza Creata', message, [{ text: 'OK' }]);
    } catch (error: any) {
      console.error('[LanHost] Failed to start hosting:', error);
      Alert.alert('Errore', error.message || 'Impossibile avviare la stanza');
      setIsHosting(false);
    } finally {
      setIsStarting(false);
    }
  };
  
  const handleStopHosting = async () => {
    Alert.alert(
      'Chiudere Stanza?',
      'Tutti i peer verranno disconnessi e la stanza non sarà più visibile.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Chiudi',
          style: 'destructive',
          onPress: async () => {
            setIsStopping(true);
            try {
              // Stop BLE advertising
              if (isBleAdvertising) {
                try {
                  await bleAdvertisingNative.stopAdvertising();
                } catch (bleError) {
                  console.warn('[LanHost] Failed to stop BLE:', bleError);
                }
              }
              
              // Stop mDNS advertisement
              await venueDiscovery.stopAdvertise();
              
              // Stop WebSocket server
              await phoneHostServer.stop();
              
              // Close room in state
              lanHostState.closeRoom();
              
              setIsHosting(false);
              setIsAdvertising(false);
              setIsBleAdvertising(false);
              setPeerCount(0);
            } catch (error: any) {
              console.error('[LanHost] Failed to stop hosting:', error);
              Alert.alert('Errore', error.message || 'Impossibile fermare la stanza');
            } finally {
              setIsStopping(false);
            }
          },
        },
      ]
    );
  };
  
  const handleToggleLock = async () => {
    if (!isHosting) {
      setLocked(!locked);
      return;
    }
    
    // Update lock state
    lanHostState.setRoomLock(!locked);
    setLocked(!locked);
    
    // Update mDNS advertisement with new lock state
    const room = lanHostState.getRoom();
    if (room) {
      const txt: Record<string, string> = {
        v: '1',
        room: room.name,
        roomId: room.id,
        lock: (!locked) ? '1' : '0',
        relay: '1',
        port: '8787',
      };
      
      // Restart advertisement with new TXT
      await venueDiscovery.stopAdvertise();
      await venueDiscovery.startAdvertise(VENUE_SERVICE_TYPE, room.name, room.port, txt);
    }
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="LAN Room Host"
        showBack
        onBack={() => router.back()}
      />
      
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Instructions */}
          <View style={styles.instructionsCard}>
            <Text style={styles.instructionsTitle}>📡 Come Funziona</Text>
            <Text style={styles.instructionsText}>
              • Attiva l'hotspot del tuo dispositivo OPPURE connettiti a una rete Wi-Fi{'\n'}
              • Altri dispositivi devono essere sulla stessa rete{'\n'}
              • La stanza apparirà automaticamente nella loro app{'\n'}
              • Funziona offline, senza internet
            </Text>
          </View>
          
          {/* Room Name */}
          <View style={styles.section}>
            <Text style={styles.label}>Nome Stanza</Text>
            <TextInput
              style={styles.input}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Nome della stanza"
              placeholderTextColor={Colors.textMuted}
              editable={!isHosting}
            />
          </View>
          
          {/* Lock Toggle */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>Blocca Stanza</Text>
                <Text style={styles.hint}>
                  Solo tu puoi caricare file. Gli altri possono solo scaricare.
                </Text>
              </View>
              <Switch
                value={locked}
                onValueChange={handleToggleLock}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.textPrimary}
              />
            </View>
          </View>
          
          {/* Hotspot Mode Toggle */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.label}>🔥 Modalità Hotspot</Text>
                <Text style={styles.hint}>
                  Usi il tuo hotspot? Inserisci le credenziali per permettere agli altri di trovarti via Bluetooth.
                </Text>
              </View>
              <Switch
                value={isHotspotMode}
                onValueChange={setIsHotspotMode}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.textPrimary}
                disabled={isHosting}
              />
            </View>
          </View>
          
          {/* Hotspot Credentials */}
          {isHotspotMode && (
            <View style={styles.hotspotCard}>
              <Text style={styles.hotspotTitle}>Credenziali Hotspot</Text>
              <Text style={styles.hotspotHint}>
                Questi dati verranno condivisi via Bluetooth con chi ti cerca.
              </Text>
              
              <View style={styles.hotspotField}>
                <Text style={styles.hotspotLabel}>Nome Rete (SSID)</Text>
                <TextInput
                  style={styles.input}
                  value={hotspotSSID}
                  onChangeText={setHotspotSSID}
                  placeholder="Es: iPhone di Mario"
                  placeholderTextColor={Colors.textMuted}
                  editable={!isHosting}
                  autoCapitalize="none"
                />
              </View>
              
              <View style={styles.hotspotField}>
                <Text style={styles.hotspotLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={hotspotPassword}
                  onChangeText={setHotspotPassword}
                  placeholder="Password hotspot"
                  placeholderTextColor={Colors.textMuted}
                  editable={!isHosting}
                  secureTextEntry={false}
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}
          
          {/* Status */}
          {isHosting && (
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>Stato Stanza</Text>
              
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Stato:</Text>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
                  <Text style={styles.statusValue}>Attiva</Text>
                </View>
              </View>
              
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>mDNS:</Text>
                <Text style={styles.statusValue}>
                  {isAdvertising ? '✅ Pubblicato' : '❌ Non pubblicato'}
                </Text>
              </View>
              
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Porta:</Text>
                <Text style={styles.statusValue}>8787</Text>
              </View>
              
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Peer connessi:</Text>
                <Text style={styles.statusValue}>{peerCount}</Text>
              </View>
              
              {isHotspotMode && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>BLE:</Text>
                  <Text style={styles.statusValue}>
                    {isBleAdvertising ? '✅ Attivo' : '❌ Non attivo'}
                  </Text>
                </View>
              )}
              
              {isHotspotMode && hotspotSSID && (
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Hotspot:</Text>
                  <Text style={styles.statusValue}>{hotspotSSID}</Text>
                </View>
              )}
            </View>
          )}
          
          {/* Network Info */}
          <View style={styles.networkCard}>
            <Text style={styles.networkLabel}>Stato Rete:</Text>
            <Text style={[styles.networkValue, { color: wifiAvailable ? Colors.success : Colors.warning }]}>
              {localIp 
                ? `✅ Connesso (${localIp})`
                : wifiAvailable
                  ? '📡 Hotspot/Rete rilevata'
                  : '⚠️ Nessuna connessione'}
            </Text>
          </View>
          
          {/* Actions */}
          <View style={styles.actions}>
            {!isHosting ? (
              <Button
                title={isStarting ? 'Avvio in corso...' : 'Avvia Stanza'}
                onPress={handleStartHosting}
                disabled={isStarting}
                loading={isStarting}
                style={styles.startButton}
              />
            ) : (
              <Button
                title={isStopping ? 'Chiusura in corso...' : 'Chiudi Stanza'}
                onPress={handleStopHosting}
                disabled={isStopping}
                loading={isStopping}
                variant="primary"
                style={[styles.stopButton, { backgroundColor: Colors.error }]}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  instructionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  instructionsTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  instructionsText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  statusCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  statusLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  statusValue: {
    fontSize: Typography.sizes.sm,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  networkCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  networkLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },
  networkValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
  },
  hotspotCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
  },
  hotspotTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  hotspotHint: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  hotspotField: {
    marginBottom: Spacing.sm,
  },
  hotspotLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  actions: {
    marginTop: Spacing.lg,
  },
  startButton: {
    marginBottom: Spacing.md,
  },
  stopButton: {
    marginBottom: Spacing.md,
  },
});

