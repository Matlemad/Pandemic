/**
 * Venue Module — Cross-platform venue LAN communication
 * 
 * Exports venue discovery, transport, relay, and types.
 */

export * from './types';
export { venueDiscovery, isVenueDiscoveryAvailable, VENUE_SERVICE_TYPE } from './discovery';
export { venueLanTransport } from './transport';
export { venueRelay } from './relay';
export type { RelayTransferProgress, RelayTransfer } from './relay';
