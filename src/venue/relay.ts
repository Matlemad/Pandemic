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

    // Request the file
    this.sendJson(ws, {
      type: VenueMessageType.RELAY_PULL,
      fileId,
      transferId,
      ts: Date.now(),
    });

    this.updateProgress(transfer, 'pending');
    
    return transferId;
  }

  /**
   * Handle incoming binary chunk for a download
   */
  handleBinaryChunk(data: ArrayBuffer): void {
    // Parse header: [transferIdLen (4 bytes)][transferId][chunk data]
    const view = new DataView(data);
    if (data.byteLength < 4) return;

    const transferIdLen = view.getUint32(0, false);
    if (data.byteLength < 4 + transferIdLen) return;

    const transferIdBytes = new Uint8Array(data, 4, transferIdLen);
    const transferId = new TextDecoder().decode(transferIdBytes);
    const chunkData = data.slice(4 + transferIdLen);

    const transfer = this.activeTransfers.get(transferId);
    if (!transfer || transfer.direction !== 'download') {
      console.warn('[VenueRelay] Chunk for unknown transfer:', transferId);
      return;
    }

    // Store chunk
    transfer.receivedChunks.push(chunkData);
    transfer.bytesTransferred += chunkData.byteLength;

    this.updateProgress(transfer, 'in_progress');
  }

  /**
   * Handle transfer complete message
   */
  handleTransferComplete(transferId: string, sha256: string): void {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) return;

    // Combine all chunks
    const totalSize = transfer.receivedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    
    for (const chunk of transfer.receivedChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // TODO: Verify SHA256

    this.updateProgress(transfer, 'complete');
    transfer.onComplete?.(combined);
    
    this.activeTransfers.delete(transferId);
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

