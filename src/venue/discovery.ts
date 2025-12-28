/**
 * Venue Discovery — mDNS service discovery wrapper
 * 
 * Uses native modules to discover venue hosts on the local network.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { DiscoveredVenueHost, VenueTxtRecord } from './types';

const { VenueDiscoveryModule } = NativeModules as { VenueDiscoveryModule: any };

// Service type for venue hosts
export const VENUE_SERVICE_TYPE = '_audiowallet._tcp';

/**
 * Check if venue discovery is available
 */
export const isVenueDiscoveryAvailable = VenueDiscoveryModule != null;

/**
 * Venue Discovery Manager
 * 
 * Wraps native mDNS discovery for finding venue hosts.
 */
class VenueDiscoveryManager {
  private nativeEmitter: NativeEventEmitter | null = null;
  private subscriptions: Array<{ remove: () => void }> = [];
  private discoveredHosts: Map<string, DiscoveredVenueHost> = new Map();
  private isDiscovering = false;
  
  // Callbacks
  private onHostFound: ((host: DiscoveredVenueHost) => void) | null = null;
  private onHostLost: ((host: DiscoveredVenueHost) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor() {
    if (isVenueDiscoveryAvailable) {
      this.nativeEmitter = new NativeEventEmitter(VenueDiscoveryModule);
      this.setupEventListeners();
    }
  }

  private setupEventListeners(): void {
    if (!this.nativeEmitter) return;

    const sub1 = this.nativeEmitter.addListener('venue_service_found', (data: any) => {
      const host = this.parseServiceData(data);
      if (host) {
        this.discoveredHosts.set(this.getHostKey(host), host);
        this.onHostFound?.(host);
      }
    });

    const sub2 = this.nativeEmitter.addListener('venue_service_lost', (data: any) => {
      const host = this.parseServiceData(data);
      if (host) {
        const key = this.getHostKey(host);
        const existing = this.discoveredHosts.get(key);
        if (existing) {
          this.discoveredHosts.delete(key);
          this.onHostLost?.(existing);
        }
      }
    });

    const sub3 = this.nativeEmitter.addListener('venue_discovery_error', (data: any) => {
      console.error('[VenueDiscovery] Error:', data);
      this.onError?.(data.message || 'Discovery error');
    });
    
    const sub4 = this.nativeEmitter.addListener('venue_advertise_started', (data: any) => {
      console.log('[VenueDiscovery] Advertisement started:', data);
      this.onAdvertiseStarted?.(data.name, data.port);
    });
    
    const sub5 = this.nativeEmitter.addListener('venue_advertise_stopped', () => {
      console.log('[VenueDiscovery] Advertisement stopped');
      this.isAdvertising = false;
      this.onAdvertiseStopped?.();
    });
    
    const sub6 = this.nativeEmitter.addListener('venue_advertise_error', (data: any) => {
      console.error('[VenueDiscovery] Advertisement error:', data);
      this.isAdvertising = false;
      this.onAdvertiseError?.(data.message || 'Advertisement error');
    });

    this.subscriptions = [sub1, sub2, sub3, sub4, sub5, sub6];
  }

  private parseServiceData(data: any): DiscoveredVenueHost | null {
    try {
      const txt: VenueTxtRecord = data.txt || {};
      
      return {
        name: data.name,
        host: data.host,
        port: data.port,
        txt,
        fullName: data.fullName || `${data.name}.${VENUE_SERVICE_TYPE}`,
        discoveredAt: Date.now(),
      };
    } catch (error) {
      console.error('[VenueDiscovery] Failed to parse service data:', error);
      return null;
    }
  }

  private getHostKey(host: DiscoveredVenueHost): string {
    return `${host.host}:${host.port}`;
  }

  /**
   * Start discovering venue hosts
   */
  async startDiscovery(): Promise<boolean> {
    if (!isVenueDiscoveryAvailable) {
      console.warn('[VenueDiscovery] Not available on this platform');
      return false;
    }

    if (this.isDiscovering) {
      return true;
    }

    try {
      this.discoveredHosts.clear();
      await VenueDiscoveryModule.startDiscovery(VENUE_SERVICE_TYPE);
      this.isDiscovering = true;
      console.log('[VenueDiscovery] Started');
      return true;
    } catch (error) {
      console.error('[VenueDiscovery] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop discovering venue hosts
   */
  async stopDiscovery(): Promise<void> {
    if (!isVenueDiscoveryAvailable || !this.isDiscovering) {
      return;
    }

    try {
      await VenueDiscoveryModule.stopDiscovery();
      this.isDiscovering = false;
      console.log('[VenueDiscovery] Stopped');
    } catch (error) {
      console.error('[VenueDiscovery] Failed to stop:', error);
    }
  }

  /**
   * Get list of discovered hosts
   */
  getDiscoveredHosts(): DiscoveredVenueHost[] {
    return Array.from(this.discoveredHosts.values());
  }

  /**
   * Check if currently discovering
   */
  isActive(): boolean {
    return this.isDiscovering;
  }

  /**
   * Set callback for when a host is found
   */
  setOnHostFound(callback: (host: DiscoveredVenueHost) => void): void {
    this.onHostFound = callback;
  }

  /**
   * Set callback for when a host is lost
   */
  setOnHostLost(callback: (host: DiscoveredVenueHost) => void): void {
    this.onHostLost = callback;
  }

  /**
   * Set callback for errors
   */
  setOnError(callback: (error: string) => void): void {
    this.onError = callback;
  }

  /**
   * Clear all callbacks
   */
  clearCallbacks(): void {
    this.onHostFound = null;
    this.onHostLost = null;
    this.onError = null;
    this.onAdvertiseStarted = null;
    this.onAdvertiseStopped = null;
    this.onAdvertiseError = null;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopDiscovery();
    this.stopAdvertise();
    
    for (const sub of this.subscriptions) {
      sub.remove();
    }
    this.subscriptions = [];
    
    this.discoveredHosts.clear();
    this.clearCallbacks();
  }
  
  // ============================================================================
  // ADVERTISEMENT (PUBLISH)
  // ============================================================================
  
  private isAdvertising = false;
  private onAdvertiseStarted: ((name: string, port: number) => void) | null = null;
  private onAdvertiseStopped: (() => void) | null = null;
  private onAdvertiseError: ((error: string) => void) | null = null;
  
  /**
   * Start advertising (publishing) a service
   */
  async startAdvertise(
    serviceType: string,
    name: string,
    port: number,
    txt: Record<string, string>
  ): Promise<boolean> {
    if (!isVenueDiscoveryAvailable) {
      console.warn('[VenueDiscovery] Not available on this platform');
      return false;
    }
    
    if (this.isAdvertising) {
      return true;
    }
    
    try {
      await VenueDiscoveryModule.startAdvertise(serviceType, name, port, txt);
      this.isAdvertising = true;
      console.log('[VenueDiscovery] Started advertising:', name, 'on port', port);
      return true;
    } catch (error) {
      console.error('[VenueDiscovery] Failed to start advertising:', error);
      return false;
    }
  }
  
  /**
   * Stop advertising
   */
  async stopAdvertise(): Promise<void> {
    if (!isVenueDiscoveryAvailable || !this.isAdvertising) {
      return;
    }
    
    try {
      await VenueDiscoveryModule.stopAdvertise();
      this.isAdvertising = false;
      console.log('[VenueDiscovery] Stopped advertising');
    } catch (error) {
      console.error('[VenueDiscovery] Failed to stop advertising:', error);
    }
  }
  
  /**
   * Check if currently advertising
   */
  async isAdvertiseActive(): Promise<boolean> {
    if (!isVenueDiscoveryAvailable) {
      return false;
    }
    
    try {
      return await VenueDiscoveryModule.isAdvertising();
    } catch (error) {
      console.error('[VenueDiscovery] Failed to check advertising status:', error);
      return false;
    }
  }
  
  /**
   * Set callback for when advertisement starts
   */
  setOnAdvertiseStarted(callback: (name: string, port: number) => void): void {
    this.onAdvertiseStarted = callback;
  }
  
  /**
   * Set callback for when advertisement stops
   */
  setOnAdvertiseStopped(callback: () => void): void {
    this.onAdvertiseStopped = callback;
  }
  
  /**
   * Set callback for advertisement errors
   */
  setOnAdvertiseError(callback: (error: string) => void): void {
    this.onAdvertiseError = callback;
  }
}

// Export singleton
export const venueDiscovery = new VenueDiscoveryManager();
export default venueDiscovery;

