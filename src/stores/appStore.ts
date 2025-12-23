/**
 * Global App Store - Zustand
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AppState,
  AppSettings,
  DEFAULT_SETTINGS,
  NetworkCapabilities,
  TransportMode,
} from '../types';
import { generateId } from '../utils/id';

interface AppStore extends AppState {
  settings: AppSettings;
  
  // Actions
  initialize: () => Promise<void>;
  setDeviceName: (name: string) => void;
  updateNetworkCapabilities: (caps: Partial<NetworkCapabilities>) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
}

const STORAGE_KEYS = {
  DEVICE_ID: '@pandemic/device_id',
  DEVICE_NAME: '@pandemic/device_name',
  SETTINGS: '@pandemic/settings',
};

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  isInitialized: false,
  deviceId: '',
  deviceName: 'Pandemic User',
  networkCapabilities: {
    bleAvailable: false,
    wifiAvailable: false,
    localIpAddress: null,
    transportMode: TransportMode.BLE_ONLY,
  },
  settings: DEFAULT_SETTINGS,

  // Initialize app
  initialize: async () => {
    try {
      // Load or generate device ID
      let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
      if (!deviceId) {
        deviceId = generateId();
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
      }

      // Load device name
      let deviceName = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_NAME);
      if (!deviceName) {
        deviceName = `Pandemic-${deviceId.slice(0, 4).toUpperCase()}`;
        await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_NAME, deviceName);
      }

      // Load settings
      const settingsJson = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      const settings = settingsJson
        ? { ...DEFAULT_SETTINGS, ...JSON.parse(settingsJson) }
        : DEFAULT_SETTINGS;

      set({
        isInitialized: true,
        deviceId,
        deviceName,
        settings,
      });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // Use defaults
      const deviceId = generateId();
      set({
        isInitialized: true,
        deviceId,
        deviceName: `Pandemic-${deviceId.slice(0, 4).toUpperCase()}`,
        settings: DEFAULT_SETTINGS,
      });
    }
  },

  setDeviceName: (name: string) => {
    set({ deviceName: name });
    AsyncStorage.setItem(STORAGE_KEYS.DEVICE_NAME, name);
  },

  updateNetworkCapabilities: (caps: Partial<NetworkCapabilities>) => {
    const current = get().networkCapabilities;
    const updated = { ...current, ...caps };
    
    // Auto-determine transport mode
    if (updated.wifiAvailable && updated.localIpAddress) {
      updated.transportMode = TransportMode.WIFI_LAN;
    } else {
      updated.transportMode = TransportMode.BLE_ONLY;
    }
    
    set({ networkCapabilities: updated });
  },

  updateSettings: (newSettings: Partial<AppSettings>) => {
    const current = get().settings;
    const updated = { ...current, ...newSettings };
    set({ settings: updated });
    AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  },
}));

