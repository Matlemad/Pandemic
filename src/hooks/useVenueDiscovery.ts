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
      setVenueHosts((prev) =>
        prev.filter((h) => !(h.host === host.host && h.port === host.port))
      );
    });

    venueDiscovery.setOnError((errorMsg) => {
      setError(errorMsg);
    });

    return () => {
      venueDiscovery.clearCallbacks();
    };
  }, []);

  const startDiscovery = useCallback(async () => {
    if (!isVenueDiscoveryAvailable) {
      setError('Venue discovery non disponibile su questa piattaforma');
      return;
    }

    setError(null);
    setVenueHosts([]);
    
    const success = await venueDiscovery.startDiscovery();
    setIsScanning(success);
    
    if (!success) {
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
