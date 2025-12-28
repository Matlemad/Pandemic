/**
 * LAN Host Types — Type definitions for phone-hosted LAN rooms
 */

// ============================================================================
// HOST STATE
// ============================================================================

export interface LanHostRoom {
  id: string;
  name: string;
  locked: boolean;
  port: number;
  createdAt: number;
  updatedAt: number;
}

export interface LanHostPeer {
  peerId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  sharedFileCount: number;
  joinedAt: number;
}

export interface LanHostFile {
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
  localUri?: string; // For host-owned files
}

// ============================================================================
// HOST CONFIG
// ============================================================================

export interface LanHostConfig {
  port: number;
  maxFileMB: number;
  heartbeatTimeoutMs: number;
}

export const DEFAULT_LAN_HOST_CONFIG: LanHostConfig = {
  port: 8787,
  maxFileMB: 50,
  heartbeatTimeoutMs: 30000,
};

// ============================================================================
// RELAY TRANSFER
// ============================================================================

export interface RelayTransfer {
  transferId: string;
  fileId: string;
  ownerPeerId: string;
  requesterPeerId: string;
  size: number;
  mimeType: string;
  sha256: string;
  state: 'pending' | 'uploading' | 'downloading' | 'complete' | 'error';
  bytesTransferred: number;
  createdAt: number;
}

