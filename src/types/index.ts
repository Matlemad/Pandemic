/**
 * PANDEMIC - Core Type Definitions
 * Offline-first local audio sharing between mobile devices
 */

// ============================================================================
// IDENTIFIERS
// ============================================================================

export type RoomId = string;
export type PeerId = string;
export type FileId = string;
export type SessionToken = string;

// ============================================================================
// TRANSPORT & CONNECTIVITY
// ============================================================================

export enum TransportMode {
  /** Primary: BLE for discovery, Wi-Fi LAN for transfer */
  WIFI_LAN = 'wifi_lan',
  /** Fallback: BLE only (slow, limited) */
  BLE_ONLY = 'ble_only',
}

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

export interface NetworkCapabilities {
  bleAvailable: boolean;
  wifiAvailable: boolean;
  localIpAddress: string | null;
  transportMode: TransportMode;
}

// ============================================================================
// ROOM MODEL
// ============================================================================

export enum RoomRole {
  HOST = 'host',
  GUEST = 'guest',
}

export interface RoomInfo {
  roomId: RoomId;
  roomName: string;
  hostId: PeerId;
  hostName: string;
  hostAddress: string | null; // LAN IP:port if available
  wifiAvailable: boolean;
  peerCount: number;
  createdAt: number;
}

export interface DiscoveredRoom extends RoomInfo {
  rssi: number; // BLE signal strength
  lastSeen: number;
  bleDeviceId?: string; // BLE device ID for GATT connection (to read hotspot credentials)
}

export interface RoomState {
  room: RoomInfo | null;
  role: RoomRole | null;
  peers: PeerInfo[];
  sharedFiles: SharedFileMetadata[];
  connectionState: ConnectionState;
}

// ============================================================================
// PEER MODEL
// ============================================================================

export interface PeerInfo {
  peerId: PeerId;
  peerName: string;
  address: string | null; // LAN address if available
  joinedAt: number;
  sharedFileCount: number;
  isOnline: boolean;
}

export interface PeerConnection {
  peer: PeerInfo;
  sessionToken: SessionToken;
  transportMode: TransportMode;
  connectedAt: number;
}

// ============================================================================
// AUDIO FILE MODEL
// ============================================================================

export enum AudioFormat {
  MP3 = 'mp3',
  WAV = 'wav',
  FLAC = 'flac',
  M4A = 'm4a',
  OPUS = 'opus',
  AAC = 'aac',
  OGG = 'ogg',
}

export interface AudioFileMetadata {
  fileId: FileId;
  fileName: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number; // seconds
  format: AudioFormat;
  sizeBytes: number;
  bitrate: number | null;
  sampleRate: number | null;
  localPath: string;
  addedAt: number;
  checksum: string; // SHA-256 hash
}

export interface SharedFileMetadata extends AudioFileMetadata {
  ownerId: PeerId;
  ownerName: string;
  ownerAddress: string | null;
  isSharedByMe: boolean;
}

// ============================================================================
// TRANSFER MODEL
// ============================================================================

export enum TransferState {
  PENDING = 'pending',
  REQUESTING = 'requesting',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TransferDirection {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
}

export interface TransferInfo {
  transferId: string;
  fileId: FileId;
  fileName: string;
  fileSize: number;
  direction: TransferDirection;
  peerId: PeerId;
  peerName: string;
  state: TransferState;
  progress: number; // 0-100
  bytesTransferred: number;
  transportMode: TransportMode;
  startedAt: number;
  estimatedTimeRemaining: number | null; // seconds
  speed: number; // bytes/second
  error: string | null;
}

// ============================================================================
// BLE PROTOCOL
// ============================================================================

export interface BleAdvertisement {
  roomId: RoomId;
  roomName: string;
  hostId: PeerId;
  hostName: string;
  wifiAvailable: boolean;
  hostAddress: string | null;
  version: number; // Protocol version
  // Hotspot bootstrap info (for LAN room discovery via BLE)
  hotspotSSID?: string;
  hotspotPassword?: string;
  wsPort?: number; // WebSocket port for LAN connection
}

export interface BleJoinRequest {
  peerId: PeerId;
  peerName: string;
  deviceId: string;
}

export interface BleJoinResponse {
  success: boolean;
  sessionToken: SessionToken | null;
  hostAddress: string | null;
  roomName?: string; // Full room name from host
  error: string | null;
}

// ============================================================================
// LAN PROTOCOL (WebSocket Messages)
// ============================================================================

export enum MessageType {
  // Room management
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  ROOM_STATE = 'room_state',
  PEER_JOINED = 'peer_joined',
  PEER_LEFT = 'peer_left',
  ROOM_CLOSING = 'room_closing',

  // File sharing
  SHARE_FILES = 'share_files',
  UNSHARE_FILES = 'unshare_files',
  INDEX_UPDATED = 'index_updated',

  // Transfer coordination
  REQUEST_FILE = 'request_file',
  FILE_AVAILABLE = 'file_available',
  TRANSFER_STARTED = 'transfer_started',
  TRANSFER_PROGRESS = 'transfer_progress',
  TRANSFER_COMPLETED = 'transfer_completed',
  TRANSFER_FAILED = 'transfer_failed',

  // Heartbeat
  PING = 'ping',
  PONG = 'pong',

  // Errors
  ERROR = 'error',
}

export interface BaseMessage {
  type: MessageType;
  timestamp: number;
  senderId: PeerId;
}

export interface JoinRoomMessage extends BaseMessage {
  type: MessageType.JOIN_ROOM;
  sessionToken: SessionToken;
  peerName: string;
}

export interface RoomStateMessage extends BaseMessage {
  type: MessageType.ROOM_STATE;
  room: RoomInfo;
  peers: PeerInfo[];
  sharedFiles: SharedFileMetadata[];
}

export interface ShareFilesMessage extends BaseMessage {
  type: MessageType.SHARE_FILES;
  files: AudioFileMetadata[];
}

export interface RequestFileMessage extends BaseMessage {
  type: MessageType.REQUEST_FILE;
  fileId: FileId;
  requesterId: PeerId;
}

export interface FileAvailableMessage extends BaseMessage {
  type: MessageType.FILE_AVAILABLE;
  fileId: FileId;
  ownerAddress: string;
  transportMode: TransportMode;
}

// ============================================================================
// UI STATE
// ============================================================================

export interface AppState {
  isInitialized: boolean;
  deviceId: PeerId;
  deviceName: string;
  networkCapabilities: NetworkCapabilities;
}

export interface UINotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration: number;
}

// ============================================================================
// SETTINGS
// ============================================================================

export interface AppSettings {
  deviceName: string;
  autoShareNewFiles: boolean;
  compressionQuality: 'original' | 'high' | 'medium' | 'low';
  maxConcurrentTransfers: number;
  keepScreenOnDuringTransfer: boolean;
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  deviceName: 'Pandemic User',
  autoShareNewFiles: false,
  compressionQuality: 'high',
  maxConcurrentTransfers: 2,
  keepScreenOnDuringTransfer: true,
  notificationsEnabled: true,
};

