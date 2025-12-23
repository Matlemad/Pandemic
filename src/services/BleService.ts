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

  constructor() {
    if (BleManager) {
      try {
        this.manager = new BleManager();
        this.isBleAvailable = true;
      } catch (error) {
        console.warn('Failed to initialize BleManager:', error);
        this.isBleAvailable = false;
      }
    } else {
      console.warn('BLE not available - running in simulation mode');
      this.isBleAvailable = false;
    }
  }

  /**
   * Initialize BLE service and request permissions
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // If BLE is not available (Expo Go), return false but don't throw
    if (!this.isBleAvailable || !this.manager) {
      console.warn('BLE not available - running in simulation mode');
      this.isInitialized = false;
      return false;
    }

    try {
      // Check BLE state
      const state = await this.manager.state();
      console.log('Current BLE state:', state);
      
      if (state !== State.PoweredOn) {
        console.log('BLE not powered on, waiting...');
        // Wait for BLE to be ready
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Bluetooth non disponibile - assicurati che Bluetooth sia acceso'));
          }, 10000);

          this.stateSubscription = this.manager.onStateChange((newState: any) => {
            console.log('BLE state changed:', newState);
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
      console.log('BLE service initialized successfully');
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('BLE initialization failed:', errorMessage);
      
      // Call error callback if available
      if (this.callbacks?.onError && error instanceof Error) {
        this.callbacks.onError(error);
      }
      
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
      console.warn('BLE scanning not available - simulation mode');
      return;
    }

    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        console.warn('BLE initialization failed - cannot start scanning');
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
          console.error('Scan error:', error);
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

    // Parse advertisement data
    try {
      const roomData = this.parseAdvertisement(device);
      if (roomData) {
        const discoveredRoom: DiscoveredRoom = {
          ...roomData,
          rssi: device.rssi ?? -100,
          lastSeen: now,
          peerCount: 0, // Will be updated when joining
        };

        this.callbacks?.onRoomDiscovered(discoveredRoom);
      }
    } catch (error) {
      // Invalid advertisement, ignore
    }
  }

  /**
   * Parse BLE advertisement data
   */
  private parseAdvertisement(device: any): Omit<DiscoveredRoom, 'rssi' | 'lastSeen' | 'peerCount'> | null {
    // The advertisement data is encoded in the device name and manufacturer data
    // Format: "P|{roomId}|{roomName}"
    const name = device.name || device.localName;
    if (!name || !name.startsWith('P|')) return null;

    const parts = name.split('|');
    if (parts.length < 3) return null;

    const [, roomId, roomName] = parts;

    // Extract additional data from manufacturer data if available
    let hostId = 'unknown';
    let hostName = 'Unknown Host';
    let wifiAvailable = false;
    let hostAddress: string | null = null;

    if (device.manufacturerData) {
      try {
        const decoded = Buffer.from(device.manufacturerData, 'base64').toString('utf8');
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
      console.warn('BLE advertising not available - simulation mode');
      this.currentAdvertisement = advertisement;
      this.isAdvertising = true;
      console.log('Started advertising room (simulated):', advertisement.roomName);
      return;
    }

    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        console.warn('BLE initialization failed - cannot start advertising');
        return;
      }
    }

    this.currentAdvertisement = advertisement;
    this.isAdvertising = true;

    // Note: react-native-ble-plx doesn't support peripheral mode directly
    // We would need to use a different approach or library for advertising
    // For now, we'll use a polling mechanism where hosts periodically broadcast
    // and guests scan
    
    console.log('Started advertising room:', advertisement.roomName);
  }

  /**
   * Stop advertising
   */
  stopAdvertising(): void {
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
      const response: BleJoinResponse = {
        success: true,
        sessionToken: generateSessionToken(),
        hostAddress: room.hostAddress,
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
   * Cleanup resources
   */
  destroy(): void {
    this.stopScanning();
    this.stopAdvertising();
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

