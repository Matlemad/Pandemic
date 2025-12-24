/**
 * File Storage Service — Local file storage and metadata management
 * 
 * Handles:
 * - Storing received audio files
 * - Computing SHA-256 checksums
 * - Managing local audio library
 * - File metadata persistence
 */

import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SharedFile } from '../p2p/protocol/types';
import { generateId } from '../utils/id';

// ============================================================================
// CONSTANTS
// ============================================================================

const AUDIO_DIR = 'audio';
const RECEIVED_DIR = 'received';
const METADATA_STORAGE_KEY = '@pandemic/file_metadata';

// ============================================================================
// TYPES
// ============================================================================

export interface LocalAudioFile {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  size: number;
  mimeType: string;
  sha256: string;
  localPath: string;
  addedAt: number;
  isShared: boolean;
}

export interface SaveFileOptions {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  mimeType?: string;
}

// ============================================================================
// FILE STORAGE SERVICE
// ============================================================================

class FileStorageService {
  private isInitialized = false;
  private audioDir: string = '';
  private receivedDir: string = '';
  private localFiles: Map<string, LocalAudioFile> = new Map();

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Setup directories
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        console.error('[FileStorage] Document directory not available');
        return false;
      }

      this.audioDir = `${docDir}${AUDIO_DIR}/`;
      this.receivedDir = `${docDir}${RECEIVED_DIR}/`;

      // Create directories if they don't exist
      await this.ensureDirectory(this.audioDir);
      await this.ensureDirectory(this.receivedDir);

      // Load cached metadata
      await this.loadMetadata();

      this.isInitialized = true;
      console.log('[FileStorage] Initialized');
      return true;
    } catch (error) {
      console.error('[FileStorage] Initialization failed:', error);
      return false;
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    }
  }

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Save a received file to local storage
   */
  async saveReceivedFile(
    tempFilePath: string,
    options: SaveFileOptions = {}
  ): Promise<LocalAudioFile | null> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check if temp file exists
      const tempInfo = await FileSystem.getInfoAsync(tempFilePath);
      if (!tempInfo.exists) {
        console.error('[FileStorage] Temp file not found:', tempFilePath);
        return null;
      }

      // Generate file ID and path
      const fileId = generateId();
      const extension = this.getExtension(tempFilePath, options.mimeType);
      const fileName = `${fileId}.${extension}`;
      const destPath = `${this.receivedDir}${fileName}`;

      // Move file to received directory
      await FileSystem.moveAsync({
        from: tempFilePath,
        to: destPath,
      });

      // Get file info
      const destInfo = await FileSystem.getInfoAsync(destPath, { size: true });
      if (!destInfo.exists) {
        console.error('[FileStorage] Failed to move file');
        return null;
      }

      // Compute SHA-256
      const sha256 = await this.computeChecksum(destPath);

      // Create metadata
      const localFile: LocalAudioFile = {
        id: fileId,
        title: options.title || this.getTitleFromPath(tempFilePath),
        artist: options.artist,
        album: options.album,
        duration: options.duration,
        size: (destInfo as any).size || 0,
        mimeType: options.mimeType || this.getMimeType(extension),
        sha256,
        localPath: destPath,
        addedAt: Date.now(),
        isShared: false,
      };

      // Store metadata
      this.localFiles.set(fileId, localFile);
      await this.saveMetadata();

      console.log('[FileStorage] File saved:', localFile.title);
      return localFile;
    } catch (error) {
      console.error('[FileStorage] Failed to save file:', error);
      return null;
    }
  }

  /**
   * Verify a file's checksum
   */
  async verifyChecksum(filePath: string, expectedSha256: string): Promise<boolean> {
    try {
      const actualSha256 = await this.computeChecksum(filePath);
      return actualSha256 === expectedSha256;
    } catch (error) {
      console.error('[FileStorage] Checksum verification failed:', error);
      return false;
    }
  }

  /**
   * Compute SHA-256 checksum of a file
   */
  async computeChecksum(filePath: string): Promise<string> {
    try {
      // Read file as base64
      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Compute SHA-256
      const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        content
      );

      return hash;
    } catch (error) {
      console.error('[FileStorage] Checksum computation failed:', error);
      return '';
    }
  }

  /**
   * Delete a local file
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      const file = this.localFiles.get(fileId);
      if (!file) return false;

      // Delete physical file
      const info = await FileSystem.getInfoAsync(file.localPath);
      if (info.exists) {
        await FileSystem.deleteAsync(file.localPath);
      }

      // Remove metadata
      this.localFiles.delete(fileId);
      await this.saveMetadata();

      console.log('[FileStorage] File deleted:', file.title);
      return true;
    } catch (error) {
      console.error('[FileStorage] Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Get all local files
   */
  getLocalFiles(): LocalAudioFile[] {
    return Array.from(this.localFiles.values());
  }

  /**
   * Get a local file by ID
   */
  getFile(fileId: string): LocalAudioFile | null {
    return this.localFiles.get(fileId) || null;
  }

  /**
   * Get file path by ID
   */
  getFilePath(fileId: string): string | null {
    const file = this.localFiles.get(fileId);
    return file?.localPath || null;
  }

  /**
   * Set file as shared or not
   */
  async setFileShared(fileId: string, isShared: boolean): Promise<void> {
    const file = this.localFiles.get(fileId);
    if (file) {
      file.isShared = isShared;
      await this.saveMetadata();
    }
  }

  /**
   * Get shared files
   */
  getSharedFiles(): LocalAudioFile[] {
    return Array.from(this.localFiles.values()).filter(f => f.isShared);
  }

  /**
   * Convert local file to SharedFile format
   */
  toSharedFile(file: LocalAudioFile, ownerPeerId: string, ownerName: string): SharedFile {
    return {
      id: file.id,
      title: file.title,
      artist: file.artist,
      album: file.album,
      duration: file.duration,
      size: file.size,
      mimeType: file.mimeType,
      sha256: file.sha256,
      ownerPeerId,
      ownerName,
      addedAt: file.addedAt,
    };
  }

  // ============================================================================
  // METADATA PERSISTENCE
  // ============================================================================

  private async loadMetadata(): Promise<void> {
    try {
      const json = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
      if (json) {
        const files: LocalAudioFile[] = JSON.parse(json);
        this.localFiles.clear();
        for (const file of files) {
          // Verify file still exists
          const info = await FileSystem.getInfoAsync(file.localPath);
          if (info.exists) {
            this.localFiles.set(file.id, file);
          }
        }
      }
      console.log('[FileStorage] Loaded', this.localFiles.size, 'files');
    } catch (error) {
      console.error('[FileStorage] Failed to load metadata:', error);
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      const files = Array.from(this.localFiles.values());
      const json = JSON.stringify(files);
      await AsyncStorage.setItem(METADATA_STORAGE_KEY, json);
    } catch (error) {
      console.error('[FileStorage] Failed to save metadata:', error);
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getExtension(path: string, mimeType?: string): string {
    // Try to get from path
    const parts = path.split('.');
    if (parts.length > 1) {
      const ext = parts[parts.length - 1].toLowerCase();
      if (['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus'].includes(ext)) {
        return ext;
      }
    }

    // Try to get from mime type
    if (mimeType) {
      const mimeMap: Record<string, string> = {
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'audio/flac': 'flac',
        'audio/x-flac': 'flac',
        'audio/mp4': 'm4a',
        'audio/x-m4a': 'm4a',
        'audio/aac': 'aac',
        'audio/ogg': 'ogg',
        'audio/opus': 'opus',
      };
      if (mimeMap[mimeType]) {
        return mimeMap[mimeType];
      }
    }

    return 'mp3'; // Default
  }

  private getMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      opus: 'audio/opus',
    };
    return mimeMap[extension] || 'audio/mpeg';
  }

  private getTitleFromPath(path: string): string {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    // Remove extension
    const titleParts = fileName.split('.');
    if (titleParts.length > 1) {
      titleParts.pop();
    }
    return titleParts.join('.') || 'Unknown';
  }

  /**
   * Get storage info
   */
  async getStorageInfo(): Promise<{ totalFiles: number; totalSize: number }> {
    let totalSize = 0;
    for (const file of this.localFiles.values()) {
      totalSize += file.size;
    }
    return {
      totalFiles: this.localFiles.size,
      totalSize,
    };
  }

  /**
   * Clear all received files
   */
  async clearReceivedFiles(): Promise<void> {
    try {
      // Delete all files in received directory
      const info = await FileSystem.getInfoAsync(this.receivedDir);
      if (info.exists) {
        await FileSystem.deleteAsync(this.receivedDir, { idempotent: true });
        await this.ensureDirectory(this.receivedDir);
      }

      // Clear metadata for received files
      const filesToRemove: string[] = [];
      for (const [id, file] of this.localFiles) {
        if (file.localPath.includes(RECEIVED_DIR)) {
          filesToRemove.push(id);
        }
      }
      for (const id of filesToRemove) {
        this.localFiles.delete(id);
      }
      await this.saveMetadata();

      console.log('[FileStorage] Cleared received files');
    } catch (error) {
      console.error('[FileStorage] Failed to clear received files:', error);
    }
  }
}

// Export singleton instance
export const fileStorageService = new FileStorageService();
export default fileStorageService;

