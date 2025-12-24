/**
 * Venue Types — Type definitions for venue LAN communication
 */

// ============================================================================
// DISCOVERY TYPES
// ============================================================================

/**
 * Discovered venue service via mDNS
 */
export interface DiscoveredVenueHost {
  /** Service name (e.g., "Pandemic Venue Host") */
  name: string;
  /** IP address of the host */
  host: string;
  /** WebSocket port */
  port: number;
  /** TXT record data */
  txt: VenueTxtRecord;
  /** Full service name */
  fullName: string;
  /** When this service was first discovered */
  discoveredAt: number;
}

/**
 * TXT record fields from mDNS advertisement
 */
export interface VenueTxtRecord {
  /** Protocol version */
  v?: string;
  /** Room name */
  room?: string;
  /** Relay support ("1" = supported) */
  relay?: string;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum VenueMessageType {
  // Client → Host
  HELLO = 'HELLO',
  JOIN_ROOM = 'JOIN_ROOM',
  LEAVE_ROOM = 'LEAVE_ROOM',
  HEARTBEAT = 'HEARTBEAT',
  SHARE_FILES = 'SHARE_FILES',
  UNSHARE_FILES = 'UNSHARE_FILES',
  REQUEST_FILE = 'REQUEST_FILE',
  RELAY_PULL = 'RELAY_PULL',
  RELAY_PUSH_META = 'RELAY_PUSH_META',
  RELAY_CHUNK = 'RELAY_CHUNK',
  RELAY_COMPLETE = 'RELAY_COMPLETE',
  RELAY_ERROR = 'RELAY_ERROR',
  
  // Host → Client
  WELCOME = 'WELCOME',
  ROOM_INFO = 'ROOM_INFO',
  PEER_JOINED = 'PEER_JOINED',
  PEER_LEFT = 'PEER_LEFT',
  INDEX_FULL = 'INDEX_FULL',
  INDEX_UPSERT = 'INDEX_UPSERT',
  INDEX_REMOVE = 'INDEX_REMOVE',
  FILE_OFFER = 'FILE_OFFER',
  TRANSFER_START = 'TRANSFER_START',
  TRANSFER_PROGRESS = 'TRANSFER_PROGRESS',
  TRANSFER_COMPLETE = 'TRANSFER_COMPLETE',
  ERROR = 'ERROR',
}

// ============================================================================
// CONNECTION STATE
// ============================================================================

export enum VenueConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

// ============================================================================
// VENUE PEER
// ============================================================================

export interface VenuePeer {
  peerId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  sharedFileCount: number;
  joinedAt: number;
}

// ============================================================================
// SHARED FILE
// ============================================================================

export interface VenueSharedFile {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  size: number;
  mimeType: string;
  sha256: string;
  ownerPeerId: string;
  ownerName: string;
  addedAt: number;
}

// ============================================================================
// EVENTS
// ============================================================================

export enum VenueEventType {
  // Discovery
  HOST_FOUND = 'host_found',
  HOST_LOST = 'host_lost',
  DISCOVERY_STARTED = 'discovery_started',
  DISCOVERY_STOPPED = 'discovery_stopped',
  
  // Connection
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  
  // Room
  ROOM_JOINED = 'room_joined',
  PEER_JOINED = 'peer_joined',
  PEER_LEFT = 'peer_left',
  
  // Files
  FILES_UPDATED = 'files_updated',
  
  // Transfer
  TRANSFER_STARTED = 'transfer_started',
  TRANSFER_PROGRESS = 'transfer_progress',
  TRANSFER_COMPLETE = 'transfer_complete',
  TRANSFER_ERROR = 'transfer_error',
}

