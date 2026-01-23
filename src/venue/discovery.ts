/**
 * Venue Discovery — mDNS service discovery wrapper
 * 
 * Uses native modules to discover venue hosts on the local network.
 */

import { AppState, NativeModules, NativeEventEmitter } from 'react-native';
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
  private wasDiscoveringBeforeBackground = false;
  
  // Callbacks
  private onHostFound: ((host: DiscoveredVenueHost) => void) | null = null;
  private onHostLost: ((host: DiscoveredVenueHost) => void) | null = null;
  private onError: ((error: string) => void) | null = null;

  constructor() {
    if (isVenueDiscoveryAvailable) {
      this.nativeEmitter = new NativeEventEmitter(VenueDiscoveryModule);
      this.setupEventListeners();
      this.setupAppStateListeners();
    }
  }

  private setupAppStateListeners(): void {
    if (!isVenueDiscoveryAvailable) return;
    AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        this.wasDiscoveringBeforeBackground = this.isDiscovering;
        if (this.isDiscovering) {
          this.stopDiscovery();
        }
      } else if (state === 'active') {
        if (this.wasDiscoveringBeforeBackground) {
          this.startDiscovery();
        }
        this.wasDiscoveringBeforeBackground = false;
      }
    });
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
      console.log('[VenueDiscovery] Service lost:', data.name);
      
      // Try to find by host:port first (resolved services)
      const host = this.parseServiceData(data);
      if (host && host.host) {
        const key = this.getHostKey(host);
        const existing = this.discoveredHosts.get(key);
        if (existing) {
          this.discoveredHosts.delete(key);
          this.onHostLost?.(existing);
          return;
        }
      }
      
      // Fallback: find by name (for unresolved services)
      if (data.name) {
        for (const [key, existing] of this.discoveredHosts.entries()) {
          if (existing.name === data.name) {
            this.discoveredHosts.delete(key);
            this.onHostLost?.(existing);
            return;
          }
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
    
    // Debug events for troubleshooting discovery issues
    const sub7 = this.nativeEmitter.addListener('venue_service_discovered', (data: any) => {
      console.log('[VenueDiscovery] Service discovered (before resolve):', data.name, data.type);
    });
    
    const sub8 = this.nativeEmitter.addListener('venue_resolve_failed', (data: any) => {
      console.error('[VenueDiscovery] Service resolve failed:', data.name, 'errorCode:', data.errorCode);
    });
    
    // Debug: resolution queue status
    const sub9 = this.nativeEmitter.addListener('venue_resolution_status', (data: any) => {
      console.log('[VenueDiscovery] Resolution status:', data.status, data.name || '', 'queue:', data.queueSize ?? data.remaining ?? 0);
    });

    this.subscriptions = [sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8, sub9];
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
   * @param forceRestart - If true, will restart discovery even if already running
   */
  async startDiscovery(forceRestart = false): Promise<boolean> {
    if (!isVenueDiscoveryAvailable) {
      console.warn('[VenueDiscovery] Not available on this platform');
      return false;
    }

    // If already discovering and not forcing restart, just return success
    // This avoids interrupting ongoing resolutions (critical for older Android)
    if (this.isDiscovering && !forceRestart) {
      console.log('[VenueDiscovery] Already discovering, continuing (not restarting)');
      return true;
    }

    // If forcing restart, stop first with a longer delay
    if (this.isDiscovering && forceRestart) {
      console.log('[VenueDiscovery] Force restarting discovery...');
      try {
        await VenueDiscoveryModule.stopDiscovery();
        this.isDiscovering = false;
        // Longer delay to let NsdManager clear pending resolutions (Android bug workaround)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn('[VenueDiscovery] Error stopping before restart:', e);
      }
    }

    try {
      // Don't clear hosts - keep existing ones
      console.log('[VenueDiscovery] Starting discovery for:', VENUE_SERVICE_TYPE);
      await VenueDiscoveryModule.startDiscovery(VENUE_SERVICE_TYPE);
      this.isDiscovering = true;
      console.log('[VenueDiscovery] Started successfully');
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
      const safeName = sanitizeServiceName(name);
      await VenueDiscoveryModule.startAdvertise(serviceType, safeName, port, txt);
      this.isAdvertising = true;
      if (safeName !== name) {
        console.log('[VenueDiscovery] Started advertising:', safeName, '(from', name, ') on port', port);
      } else {
        console.log('[VenueDiscovery] Started advertising:', name, 'on port', port);
      }
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

function sanitizeServiceName(name: string): string {
  const trimmed = name.trim();
  const ascii = trimmed.replace(/[^\x20-\x7E]/g, '');
  const cleaned = ascii.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const result = cleaned.length > 0 ? cleaned : 'PandemicRoom';
  return result.slice(0, 63);
}
export default venueDiscovery;

