/**
 * Host State — Single source of truth for venue host configuration
 * 
 * Manages room config, host files, and persistence to disk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import { createHash, randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

// ============================================================================
// TYPES
// ============================================================================

export interface HostRoom {
  id: string;
  name: string;
  locked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HostFile {
  id: string;
  title: string;
  artist?: string;
  fileName: string;
  size: number;
  mimeType: string;
  sha256: string;
  pathOnDisk: string;
  createdAt: number;
  published: boolean;
}

export interface HostState {
  room: HostRoom | null;
  hostFiles: HostFile[];
  adminToken: string;
}

// ============================================================================
// PATHS
// ============================================================================

const DATA_DIR = join(process.cwd(), '.data');
const FILES_DIR = join(DATA_DIR, 'files');
const STATE_FILE = join(DATA_DIR, 'state.json');
const ADMIN_TOKEN_FILE = join(DATA_DIR, 'admin.json');

// ============================================================================
// HOST STATE MANAGER
// ============================================================================

class HostStateManager {
  private state: HostState;
  private onChangeCallbacks: Array<(state: HostState) => void> = [];

  constructor() {
    this.ensureDirectories();
    this.state = this.loadState();
  }

  // --------------------------------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------------------------------

  private ensureDirectories(): void {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
      console.log('[HostState] Created .data directory');
    }
    if (!existsSync(FILES_DIR)) {
      mkdirSync(FILES_DIR, { recursive: true });
      console.log('[HostState] Created .data/files directory');
    }
  }

  private loadState(): HostState {
    // Load or generate admin token
    let adminToken: string;
    if (existsSync(ADMIN_TOKEN_FILE)) {
      try {
        const data = JSON.parse(readFileSync(ADMIN_TOKEN_FILE, 'utf-8'));
        adminToken = data.token;
      } catch {
        adminToken = this.generateAdminToken();
      }
    } else {
      adminToken = this.generateAdminToken();
    }

    // Load state if exists
    if (existsSync(STATE_FILE)) {
      try {
        const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
        console.log('[HostState] Loaded state from disk');
        return {
          room: data.room || null,
          hostFiles: data.hostFiles || [],
          adminToken,
        };
      } catch (err) {
        console.error('[HostState] Failed to load state:', err);
      }
    }

    return {
      room: null,
      hostFiles: [],
      adminToken,
    };
  }

  private generateAdminToken(): string {
    const token = randomBytes(32).toString('hex');
    writeFileSync(ADMIN_TOKEN_FILE, JSON.stringify({ token }, null, 2));
    console.log('[HostState] Generated new admin token');
    return token;
  }

  private saveState(): void {
    const toSave = {
      room: this.state.room,
      hostFiles: this.state.hostFiles,
    };
    writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
    console.log('[HostState] State saved to disk');
  }

  private notifyChange(): void {
    for (const cb of this.onChangeCallbacks) {
      cb(this.state);
    }
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  getState(): HostState {
    return { ...this.state };
  }

  getAdminToken(): string {
    return this.state.adminToken;
  }

  onChange(callback: (state: HostState) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  // --------------------------------------------------------------------------
  // ROOM MANAGEMENT
  // --------------------------------------------------------------------------

  createOrUpdateRoom(name: string, locked?: boolean): HostRoom {
    const now = Date.now();

    if (this.state.room) {
      // Update existing room
      this.state.room.name = name;
      if (locked !== undefined) {
        this.state.room.locked = locked;
      }
      this.state.room.updatedAt = now;
    } else {
      // Create new room
      this.state.room = {
        id: nanoid(10),
        name,
        locked: locked ?? false,
        createdAt: now,
        updatedAt: now,
      };
    }

    this.saveState();
    this.notifyChange();
    console.log(`[HostState] Room ${this.state.room ? 'updated' : 'created'}: ${name}`);
    return this.state.room;
  }

  setRoomLock(locked: boolean): HostRoom | null {
    if (!this.state.room) return null;

    this.state.room.locked = locked;
    this.state.room.updatedAt = Date.now();
    this.saveState();
    this.notifyChange();
    console.log(`[HostState] Room lock set to: ${locked}`);
    return this.state.room;
  }

  closeRoom(): boolean {
    if (!this.state.room) return false;

    console.log(`[HostState] Closing room: ${this.state.room.name}`);
    this.state.room = null;
    this.saveState();
    this.notifyChange();
    return true;
  }

  getRoom(): HostRoom | null {
    return this.state.room;
  }

  isRoomLocked(): boolean {
    return this.state.room?.locked ?? false;
  }

  // --------------------------------------------------------------------------
  // FILE MANAGEMENT
  // --------------------------------------------------------------------------

  async addFile(sourcePath: string, originalName?: string): Promise<HostFile> {
    const fileName = originalName || basename(sourcePath);
    const id = nanoid(12);
    const ext = extname(fileName);
    const safeFileName = `${id}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destPath = join(FILES_DIR, safeFileName);

    // Copy file
    copyFileSync(sourcePath, destPath);

    // Get file stats
    const stats = statSync(destPath);

    // Compute SHA256
    const sha256 = this.computeSha256(destPath);

    // Determine MIME type from extension
    const mimeType = this.getMimeType(ext);

    // Extract title from filename
    const title = fileName.replace(ext, '');

    const file: HostFile = {
      id,
      title,
      fileName,
      size: stats.size,
      mimeType,
      sha256,
      pathOnDisk: destPath,
      createdAt: Date.now(),
      published: true, // Auto-publish
    };

    this.state.hostFiles.push(file);
    this.saveState();
    this.notifyChange();
    console.log(`[HostState] Added file: ${title} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    return file;
  }

  async addFileFromBuffer(buffer: Buffer, fileName: string): Promise<HostFile> {
    const id = nanoid(12);
    const ext = extname(fileName);
    const safeFileName = `${id}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destPath = join(FILES_DIR, safeFileName);

    // Write buffer to file
    writeFileSync(destPath, buffer);

    // Compute SHA256
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // Determine MIME type
    const mimeType = this.getMimeType(ext);

    // Extract title
    const title = fileName.replace(ext, '');

    const file: HostFile = {
      id,
      title,
      fileName,
      size: buffer.length,
      mimeType,
      sha256,
      pathOnDisk: destPath,
      createdAt: Date.now(),
      published: true,
    };

    this.state.hostFiles.push(file);
    this.saveState();
    this.notifyChange();
    console.log(`[HostState] Added file: ${title} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    return file;
  }

  removeFile(fileId: string, deleteFromDisk: boolean = true): boolean {
    const index = this.state.hostFiles.findIndex(f => f.id === fileId);
    if (index === -1) return false;

    const file = this.state.hostFiles[index];

    if (deleteFromDisk && existsSync(file.pathOnDisk)) {
      try {
        unlinkSync(file.pathOnDisk);
        console.log(`[HostState] Deleted file from disk: ${file.fileName}`);
      } catch (err) {
        console.error(`[HostState] Failed to delete file: ${err}`);
      }
    }

    this.state.hostFiles.splice(index, 1);
    this.saveState();
    this.notifyChange();
    console.log(`[HostState] Removed file: ${file.title}`);
    return true;
  }

  getHostFiles(): HostFile[] {
    return [...this.state.hostFiles];
  }

  getHostFile(fileId: string): HostFile | null {
    return this.state.hostFiles.find(f => f.id === fileId) || null;
  }

  getPublishedFiles(): HostFile[] {
    return this.state.hostFiles.filter(f => f.published);
  }

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  private computeSha256(filePath: string): string {
    const buffer = readFileSync(filePath);
    return createHash('sha256').update(buffer).digest('hex');
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.wma': 'audio/x-ms-wma',
      '.opus': 'audio/opus',
    };
    return mimeTypes[ext.toLowerCase()] || 'audio/mpeg';
  }
}

// Export singleton
export const hostState = new HostStateManager();
export default hostState;

