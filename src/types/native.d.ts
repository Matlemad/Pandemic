/**
 * TypeScript declarations for native modules
 */

declare module 'react-native' {
  interface NativeModulesStatic {
    BleAdvertisingModule?: {
      startAdvertising(data: {
        roomId: string;
        roomName: string;
        hostId: string;
        hostName: string;
        hostAddress: string | null;
        wifiAvailable: boolean;
      }): Promise<{ success: boolean }>;
      stopAdvertising(): Promise<boolean>;
      isAdvertising(): Promise<boolean>;
    };
  }
}
