/**
 * Venue Host Types — Protocol definitions for venue LAN communication
 */

import { z } from 'zod';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export enum VenueMessageType {
  // Client → Host (Control)
  HELLO = 'HELLO',
  JOIN_ROOM = 'JOIN_ROOM',
  LEAVE_ROOM = 'LEAVE_ROOM',
  HEARTBEAT = 'HEARTBEAT',
  SHARE_FILES = 'SHARE_FILES',
  UNSHARE_FILES = 'UNSHARE_FILES',
  REQUEST_FILE = 'REQUEST_FILE',
  
  // Relay transfer
  RELAY_PULL = 'RELAY_PULL',
  RELAY_PUSH_META = 'RELAY_PUSH_META',
  RELAY_CHUNK = 'RELAY_CHUNK',
  RELAY_COMPLETE = 'RELAY_COMPLETE',
  RELAY_ERROR = 'RELAY_ERROR',
  
  // Host → Client (Broadcast)
  WELCOME = 'WELCOME',
  ROOM_INFO = 'ROOM_INFO',
  PEER_JOINED = 'PEER_JOINED',
  PEER_LEFT = 'PEER_LEFT',
  INDEX_FULL = 'INDEX_FULL',
  INDEX_UPSERT = 'INDEX_UPSERT',
  INDEX_REMOVE = 'INDEX_REMOVE',
  FILE_OFFER = 'FILE_OFFER',
  
  // Transfer notifications
  TRANSFER_START = 'TRANSFER_START',
  TRANSFER_PROGRESS = 'TRANSFER_PROGRESS',
  TRANSFER_COMPLETE = 'TRANSFER_COMPLETE',
  
  // Errors
  ERROR = 'ERROR',
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

// Shared file metadata
export const SharedFileMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string().optional(),
  album: z.string().optional(),
  duration: z.number().optional(),
  size: z.number(),
  mimeType: z.string(),
  sha256: z.string(),
  ownerPeerId: z.string(),
  ownerName: z.string(),
  addedAt: z.number(),
});

export type SharedFileMeta = z.infer<typeof SharedFileMetaSchema>;

// Base message
export const BaseMessageSchema = z.object({
  type: z.nativeEnum(VenueMessageType),
  ts: z.number().optional(),
});

// Client → Host messages
export const HelloMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.HELLO),
  peerId: z.string(),
  deviceName: z.string(),
  platform: z.enum(['android', 'ios', 'web', 'unknown']),
  appVersion: z.string().optional(),
});

export const JoinRoomMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.JOIN_ROOM),
  roomId: z.string().optional(), // If not provided, join default room
  roomName: z.string().optional(),
});

export const LeaveRoomMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.LEAVE_ROOM),
});

export const HeartbeatMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.HEARTBEAT),
});

export const ShareFilesMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.SHARE_FILES),
  files: z.array(SharedFileMetaSchema),
});

export const UnshareFilesMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.UNSHARE_FILES),
  fileIds: z.array(z.string()),
});

export const RequestFileMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.REQUEST_FILE),
  fileId: z.string(),
  ownerPeerId: z.string(),
});

// Relay messages
export const RelayPullMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.RELAY_PULL),
  fileId: z.string(),
  transferId: z.string(),
});

export const RelayPushMetaMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.RELAY_PUSH_META),
  fileId: z.string(),
  transferId: z.string(),
  size: z.number(),
  mimeType: z.string(),
  sha256: z.string(),
});

export const RelayCompleteMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.RELAY_COMPLETE),
  transferId: z.string(),
  fileId: z.string(),
});

export const RelayErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.RELAY_ERROR),
  transferId: z.string(),
  error: z.string(),
});

// Host → Client messages
export const WelcomeMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.WELCOME),
  hostId: z.string(),
  hostName: z.string(),
  features: z.object({
    relay: z.boolean(),
    maxFileMB: z.number(),
  }),
});

export const RoomInfoMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.ROOM_INFO),
  roomId: z.string(),
  roomName: z.string(),
  hostId: z.string(),
  features: z.object({ relay: z.boolean() }),
  peerCount: z.number(),
});

export const PeerJoinedMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.PEER_JOINED),
  peer: z.object({
    peerId: z.string(),
    deviceName: z.string(),
    platform: z.string(),
    sharedFileCount: z.number(),
    joinedAt: z.number(),
  }),
});

export const PeerLeftMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.PEER_LEFT),
  peerId: z.string(),
});

export const IndexFullMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.INDEX_FULL),
  files: z.array(SharedFileMetaSchema),
});

export const IndexUpsertMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.INDEX_UPSERT),
  files: z.array(SharedFileMetaSchema),
});

export const IndexRemoveMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.INDEX_REMOVE),
  fileIds: z.array(z.string()),
});

export const FileOfferMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.FILE_OFFER),
  fileId: z.string(),
  ownerPeerId: z.string(),
  relay: z.boolean(),
});

export const TransferStartMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.TRANSFER_START),
  transferId: z.string(),
  fileId: z.string(),
  size: z.number(),
  mimeType: z.string(),
});

export const TransferProgressMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.TRANSFER_PROGRESS),
  transferId: z.string(),
  bytesTransferred: z.number(),
  totalBytes: z.number(),
  progress: z.number(),
});

export const TransferCompleteMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.TRANSFER_COMPLETE),
  transferId: z.string(),
  fileId: z.string(),
  sha256: z.string(),
});

export const ErrorMessageSchema = BaseMessageSchema.extend({
  type: z.literal(VenueMessageType.ERROR),
  code: z.string(),
  message: z.string(),
});

// Union of all messages
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>;
export type ShareFilesMessage = z.infer<typeof ShareFilesMessageSchema>;
export type UnshareFilesMessage = z.infer<typeof UnshareFilesMessageSchema>;
export type RequestFileMessage = z.infer<typeof RequestFileMessageSchema>;
export type RelayPullMessage = z.infer<typeof RelayPullMessageSchema>;
export type RelayPushMetaMessage = z.infer<typeof RelayPushMetaMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type RoomInfoMessage = z.infer<typeof RoomInfoMessageSchema>;
export type IndexFullMessage = z.infer<typeof IndexFullMessageSchema>;

// ============================================================================
// SERVER STATE TYPES
// ============================================================================

export interface VenuePeer {
  peerId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  appVersion?: string;
  roomId: string | null;
  sharedFiles: Map<string, SharedFileMeta>;
  lastSeen: number;
  joinedAt: number;
}

export interface VenueRoom {
  roomId: string;
  roomName: string;
  locked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RelayTransfer {
  transferId: string;
  fileId: string;
  ownerPeerId: string;
  requesterPeerId: string;
  size: number;
  mimeType: string;
  sha256: string;
  bytesTransferred: number;
  state: 'pending' | 'uploading' | 'downloading' | 'complete' | 'error';
  createdAt: number;
  // Minimal buffering - chunks are forwarded immediately
  pendingChunks: Buffer[];
}

// ============================================================================
// CONFIG
// ============================================================================

export interface VenueHostConfig {
  port: number;
  roomName: string;
  serviceName: string;
  maxFileMB: number;
  heartbeatTimeoutMs: number;
  cleanupIntervalMs: number;
}

export const DEFAULT_CONFIG: VenueHostConfig = {
  port: 8787,
  roomName: 'Pandemic Venue',
  serviceName: 'Pandemic Venue Host',
  maxFileMB: 50,
  heartbeatTimeoutMs: 60000, // Increased to 60s for reliability
  cleanupIntervalMs: 15000,
};

