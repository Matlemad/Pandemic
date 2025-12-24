/**
 * P2P Module — Cross-platform P2P transport layer
 * 
 * Exports a unified P2P transport instance that automatically selects
 * the correct implementation based on platform:
 * - Android: Google Nearby Connections API
 * - iOS: Apple MultipeerConnectivity
 * - Development: Mock transport for testing
 */

import { Platform } from 'react-native';
import { IP2PTransport, MockP2PTransport } from './transport.base';
import { AndroidP2PTransport, isNearbyConnectionsAvailable } from './transport.android';
import { IOSP2PTransport, isMultipeerAvailable } from './transport.ios';

// Re-export types
export * from './types';
export * from './events';
export { IP2PTransport, BaseP2PTransport, MockP2PTransport } from './transport.base';
export { AndroidP2PTransport, isNearbyConnectionsAvailable } from './transport.android';
export { IOSP2PTransport, isMultipeerAvailable } from './transport.ios';

/**
 * Create the appropriate P2P transport for the current platform
 */
function createP2PTransport(): IP2PTransport {
  if (Platform.OS === 'android') {
    if (isNearbyConnectionsAvailable) {
      console.log('[P2P] Android platform - using Nearby Connections transport');
      return new AndroidP2PTransport();
    }
    console.log('[P2P] Android platform - Nearby Connections not available, using mock transport');
    return new MockP2PTransport();
  }
  
  if (Platform.OS === 'ios') {
    if (isMultipeerAvailable) {
      console.log('[P2P] iOS platform - using MultipeerConnectivity transport');
      return new IOSP2PTransport();
    }
    console.log('[P2P] iOS platform - MultipeerConnectivity not available, using mock transport');
    return new MockP2PTransport();
  }
  
  // Web or other platforms
  console.log('[P2P] Unsupported platform - using mock transport');
  return new MockP2PTransport();
}

/**
 * Singleton P2P transport instance
 * 
 * Use this instance throughout the app for all P2P operations.
 */
export const p2pTransport = createP2PTransport();
export default p2pTransport;

