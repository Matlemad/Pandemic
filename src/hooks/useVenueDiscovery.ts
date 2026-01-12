/**
 * useVenueDiscovery Hook — React hook for venue host discovery
 */

import { useState, useEffect, useCallback } from 'react';
import { venueDiscovery, isVenueDiscoveryAvailable } from '../venue/discovery';
import { DiscoveredVenueHost } from '../venue/types';

export interface UseVenueDiscoveryResult {
  /** Whether venue discovery is available on this platform */
  isAvailable: boolean;
  /** Whether currently scanning for venue hosts */
  isScanning: boolean;
  /** List of discovered venue hosts */
  venueHosts: DiscoveredVenueHost[];
  /** Start discovering venue hosts */
  startDiscovery: () => Promise<void>;
  /** Stop discovering venue hosts */
  stopDiscovery: () => Promise<void>;
  /** Error message if any */
  error: string | null;
}

export function useVenueDiscovery(): UseVenueDiscoveryResult {
  const [isScanning, setIsScanning] = useState(false);
  const [venueHosts, setVenueHosts] = useState<DiscoveredVenueHost[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Setup callbacks
    venueDiscovery.setOnHostFound((host) => {
      setVenueHosts((prev) => {
        const existing = prev.find(
          (h) => h.host === host.host && h.port === host.port
        );
        if (existing) {
          return prev.map((h) =>
            h.host === host.host && h.port === host.port ? host : h
          );
        }
        return [...prev, host];
      });
    });

    venueDiscovery.setOnHostLost((host) => {
      console.log('[VenueDiscovery] Host lost:', host.name);
      setVenueHosts((prev) => {
        // Remove by host:port if available, otherwise by name
        if (host.host && host.port) {
          return prev.filter((h) => !(h.host === host.host && h.port === host.port));
        } else if (host.name) {
          return prev.filter((h) => h.name !== host.name);
        }
        return prev;
      });
    });

    venueDiscovery.setOnError((errorMsg) => {
      setError(errorMsg);
    });

    return () => {
      venueDiscovery.clearCallbacks();
    };
  }, []);

  const startDiscovery = useCallback(async () => {
    console.log('[VenueDiscovery] Starting discovery, available:', isVenueDiscoveryAvailable);
    
    if (!isVenueDiscoveryAvailable) {
      console.warn('[VenueDiscovery] Not available on this platform');
      setError('Venue discovery non disponibile su questa piattaforma');
      return;
    }

    setError(null);
    // Don't clear hosts on restart - only add/update
    // setVenueHosts([]);
    
    const success = await venueDiscovery.startDiscovery();
    console.log('[VenueDiscovery] Started:', success);
    setIsScanning(success);
    
    if (!success) {
      console.error('[VenueDiscovery] Failed to start');
      setError('Impossibile avviare la ricerca venue');
    }
  }, []);

  const stopDiscovery = useCallback(async () => {
    await venueDiscovery.stopDiscovery();
    setIsScanning(false);
  }, []);

  return {
    isAvailable: isVenueDiscoveryAvailable,
    isScanning,
    venueHosts,
    startDiscovery,
    stopDiscovery,
    error,
  };
}
