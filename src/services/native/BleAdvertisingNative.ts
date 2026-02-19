/**
 * Native BLE Advertising Module
 * 
 * This module provides access to the native BLE advertising functionality
 * that is not available in react-native-ble-plx.
 */

import { NativeModules, Platform } from 'react-native';
import { BleAdvertisement } from '../../types';

interface BleAdvertisingNativeModule {
  startAdvertising(data: {
    roomId: string;
    roomName: string;
    hostId: string;
    hostName: string;
    hostAddress: string | null;
    wifiAvailable: boolean;
    hotspotSSID?: string;
    hotspotPassword?: string;
    wsPort?: number;
  }): Promise<{ success: boolean }>;
  stopAdvertising(): Promise<boolean>;
  isAdvertising(): Promise<boolean>;
}

const { BleAdvertisingModule } = NativeModules;

// Check if module is available (Android + iOS)
const isAvailable = (Platform.OS === 'android' || Platform.OS === 'ios') && BleAdvertisingModule != null;

/**
 * Native BLE Advertising Service
 * 
 * This service wraps the native module and provides a clean API for BLE advertising.
 */
class BleAdvertisingNative {
  private isModuleAvailable: boolean;

  constructor() {
    this.isModuleAvailable = isAvailable;
    
    if (!isAvailable && (Platform.OS === 'android' || Platform.OS === 'ios')) {
      console.warn('BleAdvertisingModule not available - BLE advertising disabled');
      console.warn('Make sure to rebuild the app with native modules');
    } else if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
      console.warn(`BLE advertising not supported on ${Platform.OS}`);
    } else {
      console.log('✅ BleAdvertisingModule native module loaded successfully');
    }
  }

  /**
   * Check if native advertising is available
   */
  isAvailable(): boolean {
    return this.isModuleAvailable;
  }

  /**
   * Start BLE advertising
   */
  async startAdvertising(advertisement: BleAdvertisement): Promise<boolean> {
    if (!this.isModuleAvailable) {
      throw new Error('BLE advertising native module not available');
    }

    try {
      const module = BleAdvertisingModule as BleAdvertisingNativeModule;
      const result = await module.startAdvertising({
        roomId: advertisement.roomId,
        roomName: advertisement.roomName,
        hostId: advertisement.hostId,
        hostName: advertisement.hostName,
        hostAddress: advertisement.hostAddress,
        wifiAvailable: advertisement.wifiAvailable,
        hotspotSSID: advertisement.hotspotSSID,
        hotspotPassword: advertisement.hotspotPassword,
        wsPort: advertisement.wsPort,
      });

      return result.success;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Native BLE advertising start failed:', errorMessage);
      throw error;
    }
  }

  /**
   * Stop BLE advertising
   */
  async stopAdvertising(): Promise<void> {
    if (!this.isModuleAvailable) {
      return;
    }

    try {
      const module = BleAdvertisingModule as BleAdvertisingNativeModule;
      await module.stopAdvertising();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Native BLE advertising stop failed:', errorMessage);
      // Don't throw - stopping is best effort
    }
  }

  /**
   * Check if currently advertising
   */
  async isAdvertising(): Promise<boolean> {
    if (!this.isModuleAvailable) {
      return false;
    }

    try {
      const module = BleAdvertisingModule as BleAdvertisingNativeModule;
      return await module.isAdvertising();
    } catch (error: unknown) {
      console.error('Native BLE advertising check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const bleAdvertisingNative = new BleAdvertisingNative();
export default bleAdvertisingNative;
