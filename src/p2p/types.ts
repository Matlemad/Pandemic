/**
 * P2P Types — Core type definitions for P2P transport layer
 * 
 * Platform-agnostic types used by both Android (Nearby Connections)
 * and iOS (MultipeerConnectivity) implementations.
 */

// ============================================================================
// IDENTIFIERS
// ============================================================================

/** Unique peer identifier (platform-specific format) */
export type PeerId = string;

/** Unique room identifier */
export type RoomId = string;

/** Unique transfer identifier */
export type TransferId = string;

// ============================================================================
// CONNECTION & DISCOVERY
// ============================================================================

/**
 * Connection state for a peer
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
}

/**
 * Discovery state
 */
export enum DiscoveryState {
  IDLE = 'idle',
  DISCOVERING = 'discovering',
  ADVERTISING = 'advertising',
}

/**
 * Room advertisement data (broadcast during discovery)
 */
export interface RoomAdvertisement {
  roomId: RoomId;
  roomName: string;
  hostPeerId: PeerId;
  hostName: string;
  peerCount: number;
  createdAt: number;
}

/**
 * Discovered room (from scanning)
 */
export interface DiscoveredRoom extends RoomAdvertisement {
  /** Signal strength or distance indicator (-100 to 0, higher is closer) */
  signalStrength?: number;
  /** Last time this room was seen */
  lastSeen: number;
}

/**
 * Connected peer information
 */
export interface ConnectedPeer {
  peerId: PeerId;
  displayName: string;
  connectionState: ConnectionState;
  connectedAt: number;
}

// ============================================================================
// DATA TRANSFER
// ============================================================================

/**
 * Type of data being transferred
 */
export enum PayloadType {
  /** Small JSON messages (room protocol) */
  BYTES = 'bytes',
  /** File transfer */
  FILE = 'file',
  /** Streaming data (not used in MVP) */
  STREAM = 'stream',
}

/**
 * Transfer direction
 */
export enum TransferDirection {
  INCOMING = 'incoming',
  OUTGOING = 'outgoing',
}

/**
 * Transfer state
 */
export enum TransferState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * File metadata for transfer
 */
export interface FileTransferMeta {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Transfer progress information
 */
export interface TransferProgress {
  transferId: TransferId;
  direction: TransferDirection;
  state: TransferState;
  bytesTransferred: number;
  totalBytes: number;
  /** Progress 0-100 */
  progress: number;
  /** Bytes per second */
  speed: number;
  /** Estimated time remaining in seconds */
  eta: number | null;
  /** Error message if failed */
  error?: string;
}

/**
 * Received bytes payload
 */
export interface ReceivedBytes {
  fromPeerId: PeerId;
  /** Message type tag for routing */
  typeTag: string;
  /** Raw bytes as base64 string */
  data: string;
}

/**
 * Received file payload
 */
export interface ReceivedFile {
  fromPeerId: PeerId;
  transferId: TransferId;
  /** Temporary file path where file was saved */
  tempFilePath: string;
  /** Original file metadata */
  meta: FileTransferMeta;
}

// ============================================================================
// EVENTS
// ============================================================================

/**
 * P2P Transport event types
 */
export enum P2PEventType {
  // Discovery events
  ROOM_FOUND = 'room_found',
  ROOM_LOST = 'room_lost',
  DISCOVERY_STARTED = 'discovery_started',
  DISCOVERY_STOPPED = 'discovery_stopped',
  
  // Advertising events
  ADVERTISING_STARTED = 'advertising_started',
  ADVERTISING_STOPPED = 'advertising_stopped',
  
  // Connection events
  PEER_CONNECTING = 'peer_connecting',
  PEER_CONNECTED = 'peer_connected',
  PEER_DISCONNECTED = 'peer_disconnected',
  CONNECTION_FAILED = 'connection_failed',
  
  // Data events
  BYTES_RECEIVED = 'bytes_received',
  FILE_RECEIVED = 'file_received',
  TRANSFER_PROGRESS = 'transfer_progress',
  
  // Error events
  ERROR = 'error',
}

/**
 * Event payload types mapped to event types
 */
export interface P2PEventPayloads {
  [P2PEventType.ROOM_FOUND]: DiscoveredRoom;
  [P2PEventType.ROOM_LOST]: { roomId: RoomId };
  [P2PEventType.DISCOVERY_STARTED]: void;
  [P2PEventType.DISCOVERY_STOPPED]: void;
  [P2PEventType.ADVERTISING_STARTED]: void;
  [P2PEventType.ADVERTISING_STOPPED]: void;
  [P2PEventType.PEER_CONNECTING]: { peerId: PeerId; displayName: string };
  [P2PEventType.PEER_CONNECTED]: ConnectedPeer;
  [P2PEventType.PEER_DISCONNECTED]: { peerId: PeerId };
  [P2PEventType.CONNECTION_FAILED]: { peerId: PeerId; error: string };
  [P2PEventType.BYTES_RECEIVED]: ReceivedBytes;
  [P2PEventType.FILE_RECEIVED]: ReceivedFile;
  [P2PEventType.TRANSFER_PROGRESS]: TransferProgress;
  [P2PEventType.ERROR]: { code: string; message: string };
}

/**
 * Event callback type
 */
export type P2PEventCallback<T extends P2PEventType> = (
  payload: P2PEventPayloads[T]
) => void;

// ============================================================================
// ERRORS
// ============================================================================

/**
 * P2P Error codes
 */
export enum P2PErrorCode {
  // Initialization errors
  NOT_SUPPORTED = 'not_supported',
  PERMISSIONS_DENIED = 'permissions_denied',
  BLUETOOTH_OFF = 'bluetooth_off',
  WIFI_OFF = 'wifi_off',
  
  // Discovery errors
  DISCOVERY_FAILED = 'discovery_failed',
  ADVERTISING_FAILED = 'advertising_failed',
  
  // Connection errors
  CONNECTION_FAILED = 'connection_failed',
  CONNECTION_REJECTED = 'connection_rejected',
  CONNECTION_TIMEOUT = 'connection_timeout',
  CONNECTION_LOST = 'connection_lost',
  ALREADY_CONNECTED = 'already_connected',
  
  // Transfer errors
  TRANSFER_FAILED = 'transfer_failed',
  FILE_NOT_FOUND = 'file_not_found',
  CHECKSUM_MISMATCH = 'checksum_mismatch',
  
  // General errors
  UNKNOWN = 'unknown',
}

/**
 * P2P Error class
 */
export class P2PError extends Error {
  constructor(
    public readonly code: P2PErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'P2PError';
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * P2P Transport configuration
 */
export interface P2PConfig {
  /** Service identifier (used for discovery filtering) */
  serviceId: string;
  /** Display name for this device */
  displayName: string;
  /** Connection strategy */
  strategy: ConnectionStrategy;
}

/**
 * Connection strategy
 * - STAR: One host, multiple guests (MVP)
 * - CLUSTER: Mesh network (future)
 */
export enum ConnectionStrategy {
  STAR = 'star',
  CLUSTER = 'cluster',
}

/**
 * Default configuration
 */
export const DEFAULT_P2P_CONFIG: Partial<P2PConfig> = {
  serviceId: 'com.pandemic.p2p',
  strategy: ConnectionStrategy.STAR,
};

