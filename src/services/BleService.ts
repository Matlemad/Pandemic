/**
 * BLE Service - Bluetooth Low Energy Discovery & Communication
 * 
 * This service handles:
 * - Room advertising (for hosts)
 * - Room scanning (for guests)
 * - BLE GATT communication for handshake
 * 
 * Platform considerations:
 * - iOS: BLE works only in foreground reliably
 * - Android: More permissive, higher throughput
 */

import { Platform, PermissionsAndroid } from 'react-native';
import {
  BleAdvertisement,
  BleJoinRequest,
  BleJoinResponse,
  DiscoveredRoom,
  RoomId,
  PeerId,
} from '../types';
import { generateId, generateSessionToken } from '../utils/id';
import bleAdvertisingNative from './native/BleAdvertisingNative';

// Try to import BLE module - may not be available in Expo Go
let BleManager: any = null;
let Device: any = null;
let State: any = null;
let Subscription: any = null;

try {
  const bleModule = require('react-native-ble-plx');
  BleManager = bleModule.BleManager;
  Device = bleModule.Device;
  State = bleModule.State;
  Subscription = bleModule.Subscription;
} catch (error) {
  console.warn('react-native-ble-plx not available (Expo Go mode)');
}

// Custom Service UUID for Pandemic
const PANDEMIC_SERVICE_UUID = '0000FDA0-0000-1000-8000-00805F9B34FB';
const ROOM_CHAR_UUID = '0000FDA1-0000-1000-8000-00805F9B34FB';
const JOIN_CHAR_UUID = '0000FDA2-0000-1000-8000-00805F9B34FB';

// Protocol version for compatibility checks
const PROTOCOL_VERSION = 1;

/**
 * Helper function to decode base64 to Uint8Array (React Native compatible)
 * Buffer is not available in React Native, so we use atob + manual conversion
 */
function base64ToBytes(base64: string): Uint8Array {
  // atob is available in React Native
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper function to convert Uint8Array to ASCII string
 */
function bytesToAscii(bytes: Uint8Array, start: number, length: number): string {
  let result = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    if (bytes[i] !== 0) {
      result += String.fromCharCode(bytes[i]);
    }
  }
  return result;
}

export interface BleServiceCallbacks {
  onRoomDiscovered: (room: DiscoveredRoom) => void;
  onRoomLost: (roomId: RoomId) => void;
  onJoinRequest: (request: BleJoinRequest) => Promise<BleJoinResponse>;
  onError: (error: Error) => void;
}

class BleService {
  private manager: any = null;
  private isInitialized = false;
  private isScanning = false;
  private isAdvertising = false;
  private callbacks: BleServiceCallbacks | null = null;
  private scanSubscription: any = null;
  private stateSubscription: any = null;
  private discoveredDevices: Map<string, { device: any; lastSeen: number }> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // Current advertisement data (when hosting)
  private currentAdvertisement: BleAdvertisement | null = null;
  
  // Flag to check if BLE is available
  private isBleAvailable = false;
  
  // Flag to avoid repeated initialization attempts
  private initializationFailed = false;
  private lastInitAttempt = 0;
  private static readonly INIT_RETRY_DELAY = 30000; // 30 seconds between retries

  constructor() {
    if (BleManager) {
      try {
        this.manager = new BleManager();
        this.isBleAvailable = true;
      } catch (error) {
        console.warn('[BLE] Manager init failed');
        this.isBleAvailable = false;
      }
    } else {
      // Only log once, not on every call
      this.isBleAvailable = false;
    }
  }

  /**
   * Initialize BLE service and request permissions
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // If BLE is not available (Expo Go), return false silently
    if (!this.isBleAvailable || !this.manager) {
      return false;
    }
    
    // Avoid repeated initialization attempts within the retry delay
    const now = Date.now();
    if (this.initializationFailed && (now - this.lastInitAttempt) < BleService.INIT_RETRY_DELAY) {
      // Silent return - don't spam logs
      return false;
    }
    this.lastInitAttempt = now;

    try {
      // Check BLE state
      const state = await this.manager.state();
      
      if (state !== State.PoweredOn) {
        // Wait for BLE to be ready with shorter timeout
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('BLE_NOT_POWERED'));
          }, 5000); // Reduced from 10s to 5s

          this.stateSubscription = this.manager.onStateChange((newState: any) => {
            if (newState === State.PoweredOn) {
              clearTimeout(timeout);
              resolve();
            }
          }, true);
        });
      }

      // Request permissions on Android
      if (Platform.OS === 'android') {
        console.log('Requesting Android BLE permissions (Android version:', Platform.Version, ')');
        const granted = await this.requestAndroidPermissions();
        if (!granted) {
          const errorMsg = 'Permessi Bluetooth non concessi - Vai in Impostazioni → App → Pandemic → Permessi e attiva Bluetooth e Posizione';
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        console.log('Android BLE permissions granted');
      }

      this.isInitialized = true;
      this.initializationFailed = false;
      console.log('[BLE] Initialized successfully');
      return true;
    } catch (error: unknown) {
      this.initializationFailed = true;
      
      // Only log detailed error once, not on every retry
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== 'BLE_NOT_POWERED') {
        console.warn('[BLE] Init failed:', errorMessage);
        
        // Call error callback only for non-power errors
        if (this.callbacks?.onError && error instanceof Error) {
          this.callbacks.onError(error);
        }
      }
      // Silent failure for BLE not powered - user can still use Wi-Fi/LAN mode
      
      return false;
    }
  }

  /**
   * Request Android BLE permissions
   * Handles both Android 12+ (new permissions) and Android < 12 (legacy permissions)
   */
  private async requestAndroidPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      // Android 12 (API 31) introduced new BLE permissions
      // For older versions, we only need LOCATION permission (BLUETOOTH/BLUETOOTH_ADMIN are granted at install time)
      const androidVersion = Platform.Version as number;
      const isAndroid12OrHigher = androidVersion >= 31;

      let permissions: any[] = [];

      if (isAndroid12OrHigher) {
        // Android 12+ - New granular permissions
        permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];
      } else {
        // Android < 12 - Only need location permission
        // BLUETOOTH and BLUETOOTH_ADMIN are granted at install time via manifest
        permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];
      }

      // Filter out undefined permissions (in case some constants are not available)
      const validPermissions = permissions.filter((p) => p !== undefined);

      if (validPermissions.length === 0) {
        console.warn('No valid BLE permissions found for Android version:', androidVersion);
        // On Android < 12, if no permissions are needed, consider it granted
        return !isAndroid12OrHigher;
      }

      const results = await PermissionsAndroid.requestMultiple(validPermissions);
      
      // Check if all permissions were granted
      const allGranted = Object.values(results).every(
        (result) => result === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        console.warn('Some BLE permissions were denied:', results);
      }

      return allGranted;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Permission request failed:', errorMessage);
      
      // On older Android versions, if permission request fails but we only needed location,
      // try just location permission
      const androidVersion = Platform.Version as number;
      if (androidVersion < 31) {
        console.warn('Falling back to basic location permission for Android < 12');
        try {
          const locationResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return locationResult === PermissionsAndroid.RESULTS.GRANTED;
        } catch (locationError) {
          console.error('Location permission request also failed:', locationError);
          return false;
        }
      }
      
      return false;
    }
  }

  /**
   * Set callbacks for BLE events
   */
  setCallbacks(callbacks: BleServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Start scanning for nearby rooms
   */
  async startScanning(): Promise<void> {
    if (!this.isBleAvailable || !this.manager) {
      // Silent - user can use Wi-Fi/LAN mode
      return;
    }

    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        // Silent - already logged in initialize()
        return;
      }
    }

    if (this.isScanning) return;

    this.isScanning = true;
    this.discoveredDevices.clear();

    // Start cleanup interval for stale devices
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleDevices();
    }, 5000);

    // Start scanning
    this.manager.startDeviceScan(
      [PANDEMIC_SERVICE_UUID],
      { allowDuplicates: true },
      (error: any, device: any) => {
        if (error) {
          // Only log non-BLE-off errors
          if (!error.message?.includes('powered')) {
            console.warn('[BLE] Scan error:', error.message || error);
          }
          if (this.callbacks?.onError && error instanceof Error) {
            this.callbacks.onError(error);
          } else if (this.callbacks?.onError) {
            this.callbacks.onError(new Error(String(error)));
          }
          return;
        }

        if (device) {
          this.handleDiscoveredDevice(device);
        }
      }
    );
  }

  /**
   * Stop scanning
   */
  stopScanning(): void {
    if (!this.isScanning) return;

    if (this.manager) {
      try {
        this.manager.stopDeviceScan();
      } catch (error) {
        console.warn('Error stopping scan:', error);
      }
    }
    
    this.isScanning = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Handle discovered BLE device
   */
  private handleDiscoveredDevice(device: any): void {
    const deviceId = device.id;
    const now = Date.now();

    // Update last seen
    const existing = this.discoveredDevices.get(deviceId);
    this.discoveredDevices.set(deviceId, { device, lastSeen: now });

    // Debug: log device info to understand structure
    if (device.serviceUUIDs || device.serviceUuids) {
      console.log('🔍 Device found with services:', {
        id: device.id,
        name: device.name,
        serviceUUIDs: device.serviceUUIDs || device.serviceUuids,
        serviceData: device.serviceData,
        manufacturerData: device.manufacturerData,
      });
    }

    // Parse advertisement data
    try {
      const roomData = this.parseAdvertisement(device);
      if (roomData) {
        const discoveredRoom: DiscoveredRoom = {
          ...roomData,
          rssi: device.rssi ?? -100,
          lastSeen: now,
          peerCount: 0, // Will be updated when joining
          bleDeviceId: device.id, // For GATT connection to read hotspot credentials
        };

        console.log('✅ Parsed room from advertisement:', discoveredRoom);
        this.callbacks?.onRoomDiscovered(discoveredRoom);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Error parsing advertisement:', errorMessage);
    }
  }

  /**
   * Parse BLE advertisement data
   * 
   * Supports two formats:
   * 1. Native module format: Service UUID + service data (5 bytes: roomId prefix + wifi flag)
   * 2. Legacy format: Device name with "P|{roomId}|{roomName}" (for compatibility)
   */
  private parseAdvertisement(device: any): Omit<DiscoveredRoom, 'rssi' | 'lastSeen' | 'peerCount'> | null {
    // Check if device has our service UUID (native module format)
    const serviceUUIDs = device.serviceUUIDs || device.serviceUuids || [];
    const pandemicServiceUUIDLower = PANDEMIC_SERVICE_UUID.toLowerCase();
    const hasPandemicService = serviceUUIDs.some((uuid: string) => {
      const match = uuid.toLowerCase() === pandemicServiceUUIDLower;
      if (match) {
        console.log(`✅ Service UUID match: ${uuid} === ${PANDEMIC_SERVICE_UUID}`);
      }
      return match;
    });

    console.log(`🔍 Checking device: serviceUUIDs=${JSON.stringify(serviceUUIDs)}, hasPandemicService=${hasPandemicService}, serviceData keys=${Object.keys(device.serviceData || {}).join(', ')}`);

    if (hasPandemicService) {
      // Native module format: data is in service data
      try {
        // react-native-ble-plx exposes service data in device.serviceData
        // Format: { [serviceUUID]: base64 encoded bytes }
        // Note: The key might be in different case, so we need to find it case-insensitively
        const serviceData = device.serviceData || {};
        
        // Find the service data key (case-insensitive match)
        let pandemicServiceData: string | undefined;
        const serviceDataKeys = Object.keys(serviceData);
        for (const key of serviceDataKeys) {
          if (key.toLowerCase() === pandemicServiceUUIDLower) {
            pandemicServiceData = serviceData[key];
            break;
          }
        }
        
        if (pandemicServiceData) {
          // Decode service data: [15 bytes roomId prefix][1 byte wifi flag] = 16 bytes
          const bytes = base64ToBytes(pandemicServiceData);
          
          console.log(`📡 Decoding service data: ${pandemicServiceData}, bytes length: ${bytes.length}`);
          
          if (bytes.length >= 16) {
            // Extract roomId prefix (first 15 bytes as ASCII)
            const roomIdPrefix = bytesToAscii(bytes, 0, 15);
            const wifiFlag = bytes[15] === 1;
            
            console.log(`✅ Found Pandemic room via service data: prefix=${roomIdPrefix}, wifi=${wifiFlag}, bytes:`, Array.from(bytes).map(b => b.toString(16)).join(' '));
            
            // Use prefix as roomId identifier (we'll need to match with full roomId when joining)
            // Format the prefix as a UUID-like string for compatibility
            // Prefix is 15 chars, UUID without dash is 32 chars, so we pad with zeros
            const roomIdFromPrefix = `${roomIdPrefix}0-0000-0000-0000-000000000000`.substring(0, 36);
            
            return {
              roomId: roomIdFromPrefix, // This is a reconstructed ID, will be verified on join
              roomName: `Room ${roomIdPrefix.substring(0, 4)}`, // Placeholder name
              hostId: 'unknown',
              hostName: 'Unknown Host',
              hostAddress: null,
              wifiAvailable: wifiFlag,
              createdAt: Date.now(),
            };
          } else {
            console.warn(`⚠️ Service data too short: ${bytes.length} bytes, expected 16`);
          }
        } else {
          console.warn('⚠️ Service UUID found but no service data available');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Error parsing native service data:', errorMessage);
      }
    }

    // Legacy format: Check device name (for backwards compatibility)
    const name = device.name || device.localName;
    if (name && name.startsWith('P|')) {
      const parts = name.split('|');
      if (parts.length >= 3) {
        const [, roomId, roomName] = parts;

        // Extract additional data from manufacturer data if available
        let hostId = 'unknown';
        let hostName = 'Unknown Host';
        let wifiAvailable = false;
        let hostAddress: string | null = null;

        if (device.manufacturerData) {
          try {
            const bytes = base64ToBytes(device.manufacturerData);
            const decoded = bytesToAscii(bytes, 0, bytes.length);
            const data = JSON.parse(decoded);
            hostId = data.hostId || hostId;
            hostName = data.hostName || hostName;
            wifiAvailable = data.wifiAvailable || false;
            hostAddress = data.hostAddress || null;
          } catch {
            // Use defaults
          }
        }

        return {
          roomId,
          roomName: decodeURIComponent(roomName),
          hostId,
          hostName,
          hostAddress,
          wifiAvailable,
          createdAt: Date.now(),
        };
      }
    }

    return null;
  }

  /**
   * Cleanup devices not seen recently
   */
  private cleanupStaleDevices(): void {
    const now = Date.now();
    const staleThreshold = 15000; // 15 seconds

    for (const [deviceId, data] of this.discoveredDevices) {
      if (now - data.lastSeen > staleThreshold) {
        this.discoveredDevices.delete(deviceId);
        
        // Try to extract room ID and notify
        const roomData = this.parseAdvertisement(data.device);
        if (roomData) {
          this.callbacks?.onRoomLost(roomData.roomId);
        }
      }
    }
  }

  /**
   * Start advertising a room (host mode)
   */
  async startAdvertising(advertisement: BleAdvertisement): Promise<void> {
    if (!this.isBleAvailable || !this.manager) {
      // Silent fallback - BLE optional
      this.currentAdvertisement = advertisement;
      this.isAdvertising = true;
      return;
    }

    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        // Silent - already logged in initialize()
        return;
      }
    }

    this.currentAdvertisement = advertisement;
    this.isAdvertising = true;

    // Try to use native advertising module if available (Android)
    if (bleAdvertisingNative.isAvailable()) {
      try {
        console.log('📡 Using native BLE advertising module');
        const success = await bleAdvertisingNative.startAdvertising(advertisement);
        if (success) {
          console.log('✅ Native BLE advertising started successfully:', advertisement.roomName);
          return;
        } else {
          console.warn('⚠️ Native BLE advertising start returned false, falling back to simulation');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('⚠️ Native BLE advertising failed, falling back to simulation:', errorMessage);
        // Continue to fallback behavior below
      }
    } else {
      console.warn('⚠️ Native BLE advertising module not available - using simulation mode');
    }

    // Fallback: Mark as advertising but don't actually broadcast
    // This is what happens on iOS or if native module fails
    console.warn('⚠️ BLE advertising in simulation mode (not actually broadcasting)');
    console.log('Room would be advertised:', advertisement.roomName);
    console.log('Note: iOS advertising requires native implementation');
  }

  /**
   * Stop advertising
   */
  async stopAdvertising(): Promise<void> {
    // Stop native advertising if active
    if (bleAdvertisingNative.isAvailable() && this.isAdvertising) {
      try {
        await bleAdvertisingNative.stopAdvertising();
        console.log('✅ Native BLE advertising stopped');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error stopping native BLE advertising:', errorMessage);
      }
    }

    this.currentAdvertisement = null;
    this.isAdvertising = false;
    console.log('Stopped advertising');
  }

  /**
   * Connect to a room and perform handshake
   */
  async joinRoom(
    room: DiscoveredRoom,
    peerId: PeerId,
    peerName: string
  ): Promise<BleJoinResponse> {
    if (!this.isBleAvailable || !this.manager) {
      // Simulation mode - return success with mock data
      console.warn('BLE not available - simulating join');
      return {
        success: true,
        sessionToken: generateSessionToken(),
        hostAddress: room.hostAddress || '192.168.1.1:8080',
        error: null,
      };
    }

    const device = Array.from(this.discoveredDevices.values())
      .find(d => {
        const data = this.parseAdvertisement(d.device);
        return data?.roomId === room.roomId;
      })?.device;

    if (!device) {
      return {
        success: false,
        sessionToken: null,
        hostAddress: null,
        error: 'Dispositivo non trovato',
      };
    }

    try {
      // Connect to the device
      const connectedDevice = await this.manager.connectToDevice(device.id, {
        timeout: 10000,
      });

      // Discover services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();

      // Read room info to verify
      // In a real implementation, we would write our join request
      // and read the response from the GATT characteristics

      // For now, simulate a successful join
      // In a real implementation, we would call the host's onJoinRequest callback
      // and get the roomName from the response. For now, use the room name from discovery
      // (which may be a generic "Room {prefix}" if parsed from BLE advertisement only)
      const response: BleJoinResponse = {
        success: true,
        sessionToken: generateSessionToken(),
        hostAddress: room.hostAddress,
        roomName: room.roomName, // Use room name from discovery (will be updated via LAN if available)
        error: null,
      };

      // Disconnect BLE after handshake
      await connectedDevice.cancelConnection();

      return response;
    } catch (error: any) {
      return {
        success: false,
        sessionToken: null,
        hostAddress: null,
        error: error.message || 'Connessione fallita',
      };
    }
  }

  /**
   * Check if BLE is available and powered on
   */
  async isAvailable(): Promise<boolean> {
    if (!this.isBleAvailable || !this.manager) {
      return false;
    }
    
    try {
      const state = await this.manager.state();
      return state === State.PoweredOn;
    } catch {
      return false;
    }
  }

  /**
   * Get current BLE state
   */
  async getState(): Promise<any> {
    if (!this.isBleAvailable || !this.manager) {
      return null;
    }
    
    try {
      return await this.manager.state();
    } catch {
      return null;
    }
  }

  /**
   * Connect to a discovered device and read full room info via GATT
   * This is used to get hotspot credentials when discovering rooms via BLE
   * 
   * @param deviceId - The BLE device ID to connect to
   * @returns Room info with hotspot credentials, or null if failed
   */
  async readRoomInfoViaGATT(deviceId: string): Promise<{
    roomId: string;
    roomName: string;
    hostId: string;
    hostName: string;
    hostAddress: string;
    wifiAvailable: boolean;
    wsPort: number;
    hotspotSSID?: string;
    hotspotPassword?: string;
  } | null> {
    if (!this.isBleAvailable || !this.manager) {
      console.warn('[BLE] Cannot read GATT - BLE not available');
      return null;
    }

    let device: any = null;
    
    try {
      console.log('[BLE] Connecting to device for GATT read:', deviceId);
      
      // Connect to device
      device = await this.manager.connectToDevice(deviceId, {
        timeout: 10000, // 10 second timeout
      });
      
      if (!device) {
        console.warn('[BLE] Failed to connect to device');
        return null;
      }
      
      console.log('[BLE] Connected, discovering services...');
      
      // Discover services and characteristics
      await device.discoverAllServicesAndCharacteristics();
      
      // Read the room info characteristic
      const characteristic = await device.readCharacteristicForService(
        PANDEMIC_SERVICE_UUID,
        ROOM_CHAR_UUID
      );
      
      if (!characteristic || !characteristic.value) {
        console.warn('[BLE] Room info characteristic not found or empty');
        await device.cancelConnection();
        return null;
      }
      
      // Decode base64 value
      const jsonString = atob(characteristic.value);
      console.log('[BLE] Read room info:', jsonString);
      
      // Parse JSON
      const roomInfo = JSON.parse(jsonString);
      
      // Disconnect
      await device.cancelConnection();
      console.log('[BLE] Disconnected after reading room info');
      
      return {
        roomId: roomInfo.roomId || '',
        roomName: roomInfo.roomName || '',
        hostId: roomInfo.hostId || '',
        hostName: roomInfo.hostName || '',
        hostAddress: roomInfo.hostAddress || '',
        wifiAvailable: roomInfo.wifiAvailable || false,
        wsPort: roomInfo.wsPort || 8787,
        hotspotSSID: roomInfo.hotspotSSID,
        hotspotPassword: roomInfo.hotspotPassword,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BLE] Failed to read room info via GATT:', errorMessage);
      
      // Try to disconnect if we connected
      if (device) {
        try {
          await device.cancelConnection();
        } catch {
          // Ignore disconnect errors
        }
      }
      
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.stopScanning();
    await this.stopAdvertising();
    this.stateSubscription?.remove();
    if (this.manager) {
      try {
        this.manager.destroy();
      } catch (error) {
        console.warn('Error destroying BLE manager:', error);
      }
    }
    this.isInitialized = false;
  }
}

// Export singleton instance
export const bleService = new BleService();
export default bleService;

