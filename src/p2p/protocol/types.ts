/**
 * Room Protocol Types — Message types for P2P room communication
 * 
 * All messages are JSON serialized and sent via the P2P transport layer.
 */

import { PeerId, RoomId, FileTransferMeta } from '../types';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * Room protocol message types
 */
export enum RoomMessageType {
  // Handshake
  HELLO = 'hello',
  ROOM_INFO = 'room_info',
  
  // Peer management
  PEER_JOINED = 'peer_joined',
  PEER_LEFT = 'peer_left',
  
  // File index
  INDEX_FULL = 'index_full',
  INDEX_UPSERT = 'index_upsert',
  INDEX_REMOVE = 'index_remove',
  
  // File transfer coordination
  FILE_REQUEST = 'file_request',
  FILE_ACCEPT = 'file_accept',
  FILE_REJECT = 'file_reject',
  
  // Heartbeat
  PING = 'ping',
  PONG = 'pong',
  
  // Errors
  ERROR = 'error',
}

// ============================================================================
// SHARED FILE MODEL
// ============================================================================

/**
 * Shared file in the room index
 */
export interface SharedFile {
  /** Unique file identifier */
  id: string;
  /** File title (from metadata or filename) */
  title: string;
  /** Artist name (optional) */
  artist?: string;
  /** Album name (optional) */
  album?: string;
  /** Duration in seconds */
  duration?: number;
  /** File size in bytes */
  size: number;
  /** MIME type (e.g., "audio/mpeg") */
  mimeType: string;
  /** SHA-256 hash of the file */
  sha256: string;
  /** Peer ID of the file owner */
  ownerPeerId: PeerId;
  /** Display name of the file owner */
  ownerName: string;
  /** When the file was added to the index */
  addedAt: number;
}

/**
 * Peer info in the room
 */
export interface RoomPeer {
  peerId: PeerId;
  displayName: string;
  joinedAt: number;
  sharedFileCount: number;
}

// ============================================================================
// BASE MESSAGE
// ============================================================================

/**
 * Base message interface
 */
export interface BaseRoomMessage {
  type: RoomMessageType;
  timestamp: number;
  senderId: PeerId;
}

// ============================================================================
// HANDSHAKE MESSAGES
// ============================================================================

/**
 * HELLO - Sent by guest when joining a room
 */
export interface HelloMessage extends BaseRoomMessage {
  type: RoomMessageType.HELLO;
  peerName: string;
  appVersion: string;
}

/**
 * ROOM_INFO - Sent by host in response to HELLO
 */
export interface RoomInfoMessage extends BaseRoomMessage {
  type: RoomMessageType.ROOM_INFO;
  roomId: RoomId;
  roomName: string;
  hostPeerId: PeerId;
  hostName: string;
  createdAt: number;
}

// ============================================================================
// PEER MANAGEMENT MESSAGES
// ============================================================================

/**
 * PEER_JOINED - Broadcast by host when a peer joins
 */
export interface PeerJoinedMessage extends BaseRoomMessage {
  type: RoomMessageType.PEER_JOINED;
  peer: RoomPeer;
}

/**
 * PEER_LEFT - Broadcast by host when a peer leaves
 */
export interface PeerLeftMessage extends BaseRoomMessage {
  type: RoomMessageType.PEER_LEFT;
  peerId: PeerId;
}

// ============================================================================
// FILE INDEX MESSAGES
// ============================================================================

/**
 * INDEX_FULL - Sent by host to new guest with complete file index
 */
export interface IndexFullMessage extends BaseRoomMessage {
  type: RoomMessageType.INDEX_FULL;
  files: SharedFile[];
}

/**
 * INDEX_UPSERT - Broadcast when files are added or updated
 */
export interface IndexUpsertMessage extends BaseRoomMessage {
  type: RoomMessageType.INDEX_UPSERT;
  files: SharedFile[];
}

/**
 * INDEX_REMOVE - Broadcast when files are removed
 */
export interface IndexRemoveMessage extends BaseRoomMessage {
  type: RoomMessageType.INDEX_REMOVE;
  fileIds: string[];
}

// ============================================================================
// FILE TRANSFER MESSAGES
// ============================================================================

/**
 * FILE_REQUEST - Sent by guest to host to request a file
 */
export interface FileRequestMessage extends BaseRoomMessage {
  type: RoomMessageType.FILE_REQUEST;
  fileId: string;
  /** The peer requesting the file */
  fromPeerId: PeerId;
}

/**
 * FILE_ACCEPT - Sent by owner when accepting a file request
 */
export interface FileAcceptMessage extends BaseRoomMessage {
  type: RoomMessageType.FILE_ACCEPT;
  fileId: string;
  /** The peer that will receive the file */
  toPeerId: PeerId;
  /** File metadata for transfer */
  transferMeta: FileTransferMeta;
}

/**
 * FILE_REJECT - Sent by owner when rejecting a file request
 */
export interface FileRejectMessage extends BaseRoomMessage {
  type: RoomMessageType.FILE_REJECT;
  fileId: string;
  /** The peer that requested the file */
  toPeerId: PeerId;
  /** Reason for rejection */
  reason: string;
}

// ============================================================================
// HEARTBEAT MESSAGES
// ============================================================================

/**
 * PING - Sent to check if peer is alive
 */
export interface PingMessage extends BaseRoomMessage {
  type: RoomMessageType.PING;
}

/**
 * PONG - Response to PING
 */
export interface PongMessage extends BaseRoomMessage {
  type: RoomMessageType.PONG;
}

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * ERROR - Sent when an error occurs
 */
export interface ErrorMessage extends BaseRoomMessage {
  type: RoomMessageType.ERROR;
  code: string;
  message: string;
}

// ============================================================================
// UNION TYPE
// ============================================================================

/**
 * Union of all room message types
 */
export type RoomMessage =
  | HelloMessage
  | RoomInfoMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | IndexFullMessage
  | IndexUpsertMessage
  | IndexRemoveMessage
  | FileRequestMessage
  | FileAcceptMessage
  | FileRejectMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

// ============================================================================
// MESSAGE CREATORS
// ============================================================================

/**
 * Create a base message with common fields
 */
export function createBaseMessage(
  type: RoomMessageType,
  senderId: PeerId
): BaseRoomMessage {
  return {
    type,
    timestamp: Date.now(),
    senderId,
  };
}

/**
 * Create HELLO message
 */
export function createHelloMessage(
  senderId: PeerId,
  peerName: string,
  appVersion: string = '1.0.0'
): HelloMessage {
  return {
    ...createBaseMessage(RoomMessageType.HELLO, senderId),
    type: RoomMessageType.HELLO,
    peerName,
    appVersion,
  };
}

/**
 * Create ROOM_INFO message
 */
export function createRoomInfoMessage(
  senderId: PeerId,
  roomId: RoomId,
  roomName: string,
  hostPeerId: PeerId,
  hostName: string,
  createdAt: number
): RoomInfoMessage {
  return {
    ...createBaseMessage(RoomMessageType.ROOM_INFO, senderId),
    type: RoomMessageType.ROOM_INFO,
    roomId,
    roomName,
    hostPeerId,
    hostName,
    createdAt,
  };
}

/**
 * Create PEER_JOINED message
 */
export function createPeerJoinedMessage(
  senderId: PeerId,
  peer: RoomPeer
): PeerJoinedMessage {
  return {
    ...createBaseMessage(RoomMessageType.PEER_JOINED, senderId),
    type: RoomMessageType.PEER_JOINED,
    peer,
  };
}

/**
 * Create PEER_LEFT message
 */
export function createPeerLeftMessage(
  senderId: PeerId,
  peerId: PeerId
): PeerLeftMessage {
  return {
    ...createBaseMessage(RoomMessageType.PEER_LEFT, senderId),
    type: RoomMessageType.PEER_LEFT,
    peerId,
  };
}

/**
 * Create INDEX_FULL message
 */
export function createIndexFullMessage(
  senderId: PeerId,
  files: SharedFile[]
): IndexFullMessage {
  return {
    ...createBaseMessage(RoomMessageType.INDEX_FULL, senderId),
    type: RoomMessageType.INDEX_FULL,
    files,
  };
}

/**
 * Create INDEX_UPSERT message
 */
export function createIndexUpsertMessage(
  senderId: PeerId,
  files: SharedFile[]
): IndexUpsertMessage {
  return {
    ...createBaseMessage(RoomMessageType.INDEX_UPSERT, senderId),
    type: RoomMessageType.INDEX_UPSERT,
    files,
  };
}

/**
 * Create INDEX_REMOVE message
 */
export function createIndexRemoveMessage(
  senderId: PeerId,
  fileIds: string[]
): IndexRemoveMessage {
  return {
    ...createBaseMessage(RoomMessageType.INDEX_REMOVE, senderId),
    type: RoomMessageType.INDEX_REMOVE,
    fileIds,
  };
}

/**
 * Create FILE_REQUEST message
 */
export function createFileRequestMessage(
  senderId: PeerId,
  fileId: string,
  fromPeerId: PeerId
): FileRequestMessage {
  return {
    ...createBaseMessage(RoomMessageType.FILE_REQUEST, senderId),
    type: RoomMessageType.FILE_REQUEST,
    fileId,
    fromPeerId,
  };
}

/**
 * Create FILE_ACCEPT message
 */
export function createFileAcceptMessage(
  senderId: PeerId,
  fileId: string,
  toPeerId: PeerId,
  transferMeta: FileTransferMeta
): FileAcceptMessage {
  return {
    ...createBaseMessage(RoomMessageType.FILE_ACCEPT, senderId),
    type: RoomMessageType.FILE_ACCEPT,
    fileId,
    toPeerId,
    transferMeta,
  };
}

/**
 * Create FILE_REJECT message
 */
export function createFileRejectMessage(
  senderId: PeerId,
  fileId: string,
  toPeerId: PeerId,
  reason: string
): FileRejectMessage {
  return {
    ...createBaseMessage(RoomMessageType.FILE_REJECT, senderId),
    type: RoomMessageType.FILE_REJECT,
    fileId,
    toPeerId,
    reason,
  };
}

/**
 * Create PING message
 */
export function createPingMessage(senderId: PeerId): PingMessage {
  return {
    ...createBaseMessage(RoomMessageType.PING, senderId),
    type: RoomMessageType.PING,
  };
}

/**
 * Create PONG message
 */
export function createPongMessage(senderId: PeerId): PongMessage {
  return {
    ...createBaseMessage(RoomMessageType.PONG, senderId),
    type: RoomMessageType.PONG,
  };
}

/**
 * Create ERROR message
 */
export function createErrorMessage(
  senderId: PeerId,
  code: string,
  message: string
): ErrorMessage {
  return {
    ...createBaseMessage(RoomMessageType.ERROR, senderId),
    type: RoomMessageType.ERROR,
    code,
    message,
  };
}

