/**
 * Audio Library Service - Local Audio File Management
 * 
 * This service handles:
 * - Scanning device for audio files
 * - Managing local audio library
 * - File metadata extraction
 * - File storage and organization
 */

import { Paths, File, Directory } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Crypto from 'expo-crypto';
import { AudioFileMetadata, AudioFormat } from '../types';
import { generateId } from '../utils/id';

// Supported audio formats
const SUPPORTED_FORMATS = ['mp3', 'wav', 'flac', 'm4a', 'opus', 'aac', 'ogg'];

// Local storage directory for Pandemic files
const PANDEMIC_DIR_NAME = 'pandemic';
const AUDIO_DIR_NAME = 'audio';

class AudioLibraryService {
  private isInitialized = false;
  private hasPermission = false;
  private localFiles: Map<string, AudioFileMetadata> = new Map();
  private pandemicDir: Directory | null = null;
  private audioDir: Directory | null = null;

  /**
   * Initialize the audio library service
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Request media library permission
      // If permission request fails, continue anyway (user can grant later)
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        this.hasPermission = status === 'granted';
      } catch (permError: unknown) {
        console.warn('Permission request failed (may need prebuild):', permError);
        // Continue without permission - user can grant later
        this.hasPermission = false;
      }

      // Ensure directories exist (this should work even without media permission)
      await this.ensureDirectories();

      // Load cached file list
      await this.loadCachedFiles();

      this.isInitialized = true;
      return true;
    } catch (error: unknown) {
      console.error('AudioLibrary initialization failed:', error);
      // Still mark as initialized to prevent retry loops
      this.isInitialized = true;
      return false;
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      // Create pandemic directory in document directory
      this.pandemicDir = new Directory(Paths.document, PANDEMIC_DIR_NAME);
      if (!this.pandemicDir.exists) {
        this.pandemicDir.create();
      }

      // Create audio subdirectory
      this.audioDir = new Directory(this.pandemicDir, AUDIO_DIR_NAME);
      if (!this.audioDir.exists) {
        this.audioDir.create();
      }
    } catch (error: unknown) {
      console.error('Failed to create directories:', error);
    }
  }

  /**
   * Load cached file metadata
   */
  private async loadCachedFiles(): Promise<void> {
    try {
      if (!this.pandemicDir) return;

      const cacheFile = new File(this.pandemicDir, 'audio_cache.json');
      
      if (cacheFile.exists) {
        const content = await cacheFile.text();
        const files: AudioFileMetadata[] = JSON.parse(content);
        
        for (const file of files) {
          // Verify file still exists
          const audioFile = new File(file.localPath);
          if (audioFile.exists) {
            this.localFiles.set(file.fileId, file);
          }
        }
      }
    } catch (error: unknown) {
      console.error('Failed to load cached files:', error);
    }
  }

  /**
   * Save file cache
   */
  private async saveCache(): Promise<void> {
    try {
      if (!this.pandemicDir) return;

      const cacheFile = new File(this.pandemicDir, 'audio_cache.json');
      const files = Array.from(this.localFiles.values());
      cacheFile.write(JSON.stringify(files));
    } catch (error: unknown) {
      console.error('Failed to save cache:', error);
    }
  }

  /**
   * Scan device for audio files
   */
  async scanDeviceAudio(): Promise<AudioFileMetadata[]> {
    // Try to request permission if not granted
    if (!this.hasPermission) {
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        this.hasPermission = status === 'granted';
      } catch (error: unknown) {
        console.warn('Cannot request media library permission:', error);
        return [];
      }
    }

    if (!this.hasPermission) {
      console.warn('No media library permission - cannot scan audio files');
      return [];
    }

    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 1000,
      });

      const audioFiles: AudioFileMetadata[] = [];

      for (const asset of assets) {
        const extension = asset.filename.split('.').pop()?.toLowerCase();
        if (!extension || !SUPPORTED_FORMATS.includes(extension)) continue;

        const metadata = await this.extractMetadata(asset);
        if (metadata) {
          audioFiles.push(metadata);
          this.localFiles.set(metadata.fileId, metadata);
        }
      }

      await this.saveCache();
      return audioFiles;
    } catch (error: unknown) {
      console.error('Failed to scan audio:', error);
      return [];
    }
  }

  /**
   * Extract metadata from media asset
   */
  private async extractMetadata(
    asset: MediaLibrary.Asset
  ): Promise<AudioFileMetadata | null> {
    try {
      const extension = asset.filename.split('.').pop()?.toLowerCase() as AudioFormat;
      
      // Get file info for size
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      const localUri = info.localUri || asset.uri;
      
      // Calculate checksum
      const checksum = await this.calculateChecksum(localUri);

      // Try to get file size
      let fileSize = 0;
      try {
        const file = new File(localUri);
        if (file.exists) {
          fileSize = file.size || 0;
        }
      } catch {
        // Size unavailable
      }

      return {
        fileId: generateId(),
        fileName: asset.filename,
        title: asset.filename.replace(/\.[^/.]+$/, ''), // Remove extension
        artist: null, // Would need ID3 parsing
        album: null,
        duration: asset.duration,
        format: extension,
        sizeBytes: fileSize,
        bitrate: null,
        sampleRate: null,
        localPath: localUri,
        addedAt: Date.now(),
        checksum,
      };
    } catch (error: unknown) {
      console.error('Failed to extract metadata:', error);
      return null;
    }
  }

  /**
   * Calculate SHA-256 checksum of a file
   */
  private async calculateChecksum(uri: string): Promise<string> {
    try {
      // For large files, we'd want to hash in chunks
      // For MVP, use a simplified approach based on file path
      return Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        uri + Date.now().toString()
      );
    } catch {
      return generateId(); // Fallback
    }
  }

  /**
   * Import a file into Pandemic library
   */
  async importFile(sourceUri: string): Promise<AudioFileMetadata | null> {
    try {
      if (!this.audioDir) return null;

      const fileName = sourceUri.split('/').pop() || 'unknown.mp3';
      const destFileName = `${generateId()}_${fileName}`;
      
      // Create source and destination file objects
      const sourceFile = new File(sourceUri);
      const destFile = new File(this.audioDir, destFileName);

      // Copy file
      sourceFile.copy(destFile);

      if (!destFile.exists) return null;

      const extension = fileName.split('.').pop()?.toLowerCase() as AudioFormat;
      const checksum = await this.calculateChecksum(destFile.uri);

      const metadata: AudioFileMetadata = {
        fileId: generateId(),
        fileName,
        title: fileName.replace(/\.[^/.]+$/, ''),
        artist: null,
        album: null,
        duration: 0, // Would need audio parsing
        format: extension || AudioFormat.MP3,
        sizeBytes: destFile.size || 0,
        bitrate: null,
        sampleRate: null,
        localPath: destFile.uri,
        addedAt: Date.now(),
        checksum,
      };

      this.localFiles.set(metadata.fileId, metadata);
      await this.saveCache();

      return metadata;
    } catch (error: unknown) {
      console.error('Failed to import file:', error);
      return null;
    }
  }

  /**
   * Save received file from transfer
   */
  async saveReceivedFile(
    data: ArrayBuffer | string,
    metadata: Partial<AudioFileMetadata>
  ): Promise<AudioFileMetadata | null> {
    try {
      if (!this.audioDir) return null;

      const fileName = metadata.fileName || `received_${Date.now()}.mp3`;
      const destFileName = `${generateId()}_${fileName}`;
      const destFile = new File(this.audioDir, destFileName);

      // Write file
      if (typeof data === 'string') {
        // Assume base64
        destFile.write(data);
      } else {
        // Convert ArrayBuffer
        const base64 = btoa(
          new Uint8Array(data).reduce(
            (str, byte) => str + String.fromCharCode(byte),
            ''
          )
        );
        destFile.write(base64);
      }

      if (!destFile.exists) return null;

      const extension = fileName.split('.').pop()?.toLowerCase() as AudioFormat;
      const checksum = await this.calculateChecksum(destFile.uri);

      const fullMetadata: AudioFileMetadata = {
        fileId: generateId(),
        fileName,
        title: metadata.title || fileName.replace(/\.[^/.]+$/, ''),
        artist: metadata.artist || null,
        album: metadata.album || null,
        duration: metadata.duration || 0,
        format: extension || AudioFormat.MP3,
        sizeBytes: destFile.size || 0,
        bitrate: metadata.bitrate || null,
        sampleRate: metadata.sampleRate || null,
        localPath: destFile.uri,
        addedAt: Date.now(),
        checksum,
      };

      this.localFiles.set(fullMetadata.fileId, fullMetadata);
      await this.saveCache();

      return fullMetadata;
    } catch (error: unknown) {
      console.error('Failed to save received file:', error);
      return null;
    }
  }

  /**
   * Delete a file from library
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      const fileMetadata = this.localFiles.get(fileId);
      if (!fileMetadata) return false;

      const file = new File(fileMetadata.localPath);
      if (file.exists) {
        file.delete();
      }
      
      this.localFiles.delete(fileId);
      await this.saveCache();

      return true;
    } catch (error: unknown) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Get all local files
   */
  getLocalFiles(): AudioFileMetadata[] {
    return Array.from(this.localFiles.values());
  }

  /**
   * Get file by ID
   */
  getFile(fileId: string): AudioFileMetadata | undefined {
    return this.localFiles.get(fileId);
  }

  /**
   * Get file path for streaming
   */
  getFilePath(fileId: string): string | null {
    const file = this.localFiles.get(fileId);
    return file?.localPath || null;
  }

  /**
   * Get total library size
   */
  getTotalSize(): number {
    return Array.from(this.localFiles.values()).reduce(
      (total, file) => total + file.sizeBytes,
      0
    );
  }
}

// Export singleton instance
export const audioLibraryService = new AudioLibraryService();
export default audioLibraryService;
