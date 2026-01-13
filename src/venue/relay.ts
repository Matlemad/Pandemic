/**
 * Venue Relay Transfer — File transfer via venue host relay
 * 
 * Handles uploading and downloading files through the venue host WebSocket.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { nanoid } from 'nanoid/non-secure';
import { VenueMessageType, VenueSharedFile } from './types';

// Chunk size for file transfers (64KB)
const CHUNK_SIZE = 64 * 1024;

// Maximum file size (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export interface RelayTransferProgress {
  transferId: string;
  fileId: string;
  direction: 'upload' | 'download';
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  state: 'pending' | 'in_progress' | 'complete' | 'error';
  error?: string;
}

export interface RelayTransfer {
  transferId: string;
  fileId: string;
  direction: 'upload' | 'download';
  ws: WebSocket;
  fileUri?: string;
  fileMeta: {
    size: number;
    mimeType: string;
    sha256: string;
  };
  bytesTransferred: number;
  receivedChunks: ArrayBuffer[];
  onProgress?: (progress: RelayTransferProgress) => void;
  onComplete?: (data: Uint8Array) => void;
  onError?: (error: string) => void;
}

/**
 * Venue Relay Manager
 * 
 * Manages file uploads and downloads through the venue host.
 */
class VenueRelayManager {
  private activeTransfers: Map<string, RelayTransfer> = new Map();

  /**
   * Upload a file to be relayed to a requester
   */
  async uploadFile(
    ws: WebSocket,
    transferId: string,
    fileId: string,
    fileUri: string,
    fileMeta: { size: number; mimeType: string; sha256: string },
    onProgress?: (progress: RelayTransferProgress) => void
  ): Promise<void> {
    // Check file size
    if (fileMeta.size > MAX_FILE_SIZE) {
      throw new Error(`File troppo grande (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)`);
    }

    const transfer: RelayTransfer = {
      transferId,
      fileId,
      direction: 'upload',
      ws,
      fileUri,
      fileMeta,
      bytesTransferred: 0,
      receivedChunks: [],
      onProgress,
    };

    this.activeTransfers.set(transferId, transfer);

    try {
      // Send metadata first
      this.sendJson(ws, {
        type: VenueMessageType.RELAY_PUSH_META,
        transferId,
        fileId,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType,
        sha256: fileMeta.sha256,
        ts: Date.now(),
      });

      // Read file and send in chunks
      await this.sendFileChunks(transfer);

      // Send completion
      this.sendJson(ws, {
        type: VenueMessageType.RELAY_COMPLETE,
        transferId,
        fileId,
        ts: Date.now(),
      });

      this.updateProgress(transfer, 'complete');
    } catch (error: any) {
      this.updateProgress(transfer, 'error', error.message);
      
      this.sendJson(ws, {
        type: VenueMessageType.RELAY_ERROR,
        transferId,
        error: error.message,
        ts: Date.now(),
      });
      
      throw error;
    } finally {
      this.activeTransfers.delete(transferId);
    }
  }

  /**
   * Request a file download via relay
   */
  requestDownload(
    ws: WebSocket,
    fileId: string,
    fileMeta: { size: number; mimeType: string; sha256: string },
    onProgress?: (progress: RelayTransferProgress) => void,
    onComplete?: (data: Uint8Array) => void,
    onError?: (error: string) => void
  ): string {
    const transferId = `dl-${nanoid(10)}`;
    
    console.log('[VenueRelay] ===== STARTING DOWNLOAD =====');
    console.log('[VenueRelay] File ID:', fileId);
    console.log('[VenueRelay] Transfer ID:', transferId);
    console.log('[VenueRelay] File size:', fileMeta.size);
    console.log('[VenueRelay] WebSocket readyState:', ws.readyState);

    const transfer: RelayTransfer = {
      transferId,
      fileId,
      direction: 'download',
      ws,
      fileMeta,
      bytesTransferred: 0,
      receivedChunks: [],
      onProgress,
      onComplete,
      onError,
    };

    this.activeTransfers.set(transferId, transfer);
    console.log('[VenueRelay] Transfer registered. Active:', Array.from(this.activeTransfers.keys()));

    // Request the file
    this.sendJson(ws, {
      type: VenueMessageType.RELAY_PULL,
      fileId,
      transferId,
      ts: Date.now(),
    });
    
    console.log('[VenueRelay] RELAY_PULL sent');

    this.updateProgress(transfer, 'pending');
    
    return transferId;
  }

  /**
   * Handle incoming binary chunk for a download
   */
  handleBinaryChunk(data: ArrayBuffer): void {
    console.log('[VenueRelay] handleBinaryChunk called, size:', data.byteLength);
    
    // Parse header: [transferIdLen (4 bytes)][transferId][chunk data]
    const view = new DataView(data);
    if (data.byteLength < 4) {
      console.error('[VenueRelay] Chunk too small:', data.byteLength);
      return;
    }

    const transferIdLen = view.getUint32(0, false);
    console.log('[VenueRelay] Transfer ID length:', transferIdLen);
    
    if (data.byteLength < 4 + transferIdLen) {
      console.error('[VenueRelay] Chunk too small for transfer ID');
      return;
    }

    const transferIdBytes = new Uint8Array(data, 4, transferIdLen);
    const transferId = new TextDecoder().decode(transferIdBytes);
    const chunkData = data.slice(4 + transferIdLen);
    
    console.log('[VenueRelay] Transfer ID:', transferId, '| Chunk size:', chunkData.byteLength);
    console.log('[VenueRelay] Active transfers:', Array.from(this.activeTransfers.keys()));

    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.direction !== 'download') {
      console.warn('[VenueRelay] Chunk for unknown transfer:', transferId);
      console.warn('[VenueRelay] Known transfers:', Array.from(this.activeTransfers.keys()).join(', '));
      return;
    }

    // Store chunk
    transfer.receivedChunks.push(chunkData);
    transfer.bytesTransferred += chunkData.byteLength;
    
    console.log('[VenueRelay] Chunk stored. Total received:', transfer.bytesTransferred, '/', transfer.fileMeta.size);

    this.updateProgress(transfer, 'in_progress');
  }

  /**
   * Handle transfer complete message
   */
  handleTransferComplete(transferId: string, sha256: string): void {
    console.log('[VenueRelay] ===== TRANSFER COMPLETE =====');
    console.log('[VenueRelay] Transfer ID:', transferId);
    
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      console.error('[VenueRelay] Transfer not found:', transferId);
      console.error('[VenueRelay] Active transfers:', Array.from(this.activeTransfers.keys()));
      return;
    }
    
    console.log('[VenueRelay] Chunks received:', transfer.receivedChunks.length);

    // Combine all chunks
    const totalSize = transfer.receivedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    console.log('[VenueRelay] Total size:', totalSize, 'Expected:', transfer.fileMeta.size);
    
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const chunk of transfer.receivedChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // TODO: Verify SHA256

    this.updateProgress(transfer, 'complete');
    console.log('[VenueRelay] Calling onComplete callback...');
    transfer.onComplete?.(combined);
    
    this.activeTransfers.delete(transferId);
    console.log('[VenueRelay] Transfer removed from active list');
  }

  /**
   * Handle transfer error
   */
  handleTransferError(transferId: string, error: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return;

    this.updateProgress(transfer, 'error', error);
    transfer.onError?.(error);
    
    this.activeTransfers.delete(transferId);
  }

  /**
   * Cancel an active transfer
   */
  cancelTransfer(transferId: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return;

    this.updateProgress(transfer, 'error', 'Cancelled');
    this.activeTransfers.delete(transferId);
  }

  /**
   * Get active transfer
   */
  getTransfer(transferId: string): RelayTransfer | undefined {
    return this.activeTransfers.get(transferId);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async sendFileChunks(transfer: RelayTransfer): Promise<void> {
    if (!transfer.fileUri) throw new Error('No file URI');

    // Read file as base64 and convert to binary
    const base64 = await FileSystem.readAsStringAsync(transfer.fileUri, {
      encoding: 'base64' as const,
    });

    // Convert base64 to Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Send in chunks
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, bytes.length);
      const chunk = bytes.slice(start, end);

      // Create binary frame: [transferIdLen (4 bytes)][transferId][chunk]
      const transferIdBytes = new TextEncoder().encode(transfer.transferId);
      const frame = new ArrayBuffer(4 + transferIdBytes.length + chunk.length);
      const view = new DataView(frame);
      
      view.setUint32(0, transferIdBytes.length, false);
      new Uint8Array(frame, 4).set(transferIdBytes);
      new Uint8Array(frame, 4 + transferIdBytes.length).set(chunk);

      // Send binary frame
      transfer.ws.send(frame);

      // Update progress
      transfer.bytesTransferred = end;
      this.updateProgress(transfer, 'in_progress');

      // Small delay to avoid overwhelming the connection
      if (i < totalChunks - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

  private sendJson(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private updateProgress(
    transfer: RelayTransfer,
    state: 'pending' | 'in_progress' | 'complete' | 'error',
    error?: string
  ): void {
    const progress: RelayTransferProgress = {
      transferId: transfer.transferId,
      fileId: transfer.fileId,
      direction: transfer.direction,
      bytesTransferred: transfer.bytesTransferred,
      totalBytes: transfer.fileMeta.size,
      progress: Math.floor((transfer.bytesTransferred / transfer.fileMeta.size) * 100),
      state,
      error,
    };

    transfer.onProgress?.(progress);
  }
}

// Export singleton
export const venueRelay = new VenueRelayManager();
export default venueRelay;

