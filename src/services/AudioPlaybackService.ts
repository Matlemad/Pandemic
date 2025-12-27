/**
 * Audio Playback Service - Controls audio playback using expo-av
 * 
 * Features:
 * - Single shared Audio.Sound instance
 * - Play/Pause/Resume
 * - Next/Previous track
 * - Auto-advance on track end
 * - Position tracking
 */

import { Audio, AVPlaybackStatus } from 'expo-av';
import { useLibraryStore, LibraryTrack } from '../stores/libraryStore';

// ============================================================================
// TYPES
// ============================================================================

type PlaybackCallback = (status: AVPlaybackStatus) => void;

// ============================================================================
// SERVICE
// ============================================================================

class AudioPlaybackService {
  private sound: Audio.Sound | null = null;
  private currentTrackId: string | null = null;
  private isInitialized = false;
  private onTrackEndCallback: (() => void) | null = null;

  /**
   * Initialize audio session
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      this.isInitialized = true;
      console.log('[AudioPlayback] Initialized');
    } catch (error) {
      console.error('[AudioPlayback] Failed to initialize:', error);
    }
  }

  /**
   * Play a specific track by ID
   */
  async playTrack(trackId: string): Promise<boolean> {
    await this.initialize();

    const store = useLibraryStore.getState();
    const track = store.getTrackById(trackId);

    if (!track) {
      console.error('[AudioPlayback] Track not found:', trackId);
      return false;
    }

    try {
      // Unload previous sound if any
      await this.unloadCurrent();

      // Create new sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.localUri },
        { shouldPlay: true },
        this.handlePlaybackStatusUpdate.bind(this)
      );

      this.sound = sound;
      this.currentTrackId = trackId;

      // Update store
      store.setCurrentTrack(trackId);
      store.setIsPlaying(true);

      console.log('[AudioPlayback] Playing:', track.title);
      return true;
    } catch (error) {
      console.error('[AudioPlayback] Failed to play:', error);
      store.setIsPlaying(false);
      return false;
    }
  }

  /**
   * Pause current playback
   */
  async pause(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.pauseAsync();
      useLibraryStore.getState().setIsPlaying(false);
      console.log('[AudioPlayback] Paused');
    } catch (error) {
      console.error('[AudioPlayback] Failed to pause:', error);
    }
  }

  /**
   * Resume current playback
   */
  async resume(): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.playAsync();
      useLibraryStore.getState().setIsPlaying(true);
      console.log('[AudioPlayback] Resumed');
    } catch (error) {
      console.error('[AudioPlayback] Failed to resume:', error);
    }
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    const { playback, tracks } = useLibraryStore.getState();

    if (playback.isPlaying) {
      await this.pause();
    } else if (playback.currentTrackId) {
      await this.resume();
    } else if (tracks.length > 0) {
      // Nothing playing, start from first track
      await this.playTrack(tracks[0].id);
    }
  }

  /**
   * Play next track in playlist
   */
  async playNext(): Promise<boolean> {
    const store = useLibraryStore.getState();
    const nextTrack = store.getNextTrack();

    if (nextTrack) {
      return await this.playTrack(nextTrack.id);
    }

    // End of playlist
    await this.stop();
    return false;
  }

  /**
   * Play previous track in playlist
   */
  async playPrevious(): Promise<boolean> {
    const store = useLibraryStore.getState();
    const prevTrack = store.getPreviousTrack();

    if (prevTrack) {
      return await this.playTrack(prevTrack.id);
    }

    // Restart current track
    if (this.sound && this.currentTrackId) {
      await this.sound.setPositionAsync(0);
      return true;
    }

    return false;
  }

  /**
   * Stop playback completely
   */
  async stop(): Promise<void> {
    await this.unloadCurrent();

    const store = useLibraryStore.getState();
    store.setIsPlaying(false);
    store.setCurrentTrack(null);
    store.setPosition(0);

    console.log('[AudioPlayback] Stopped');
  }

  /**
   * Seek to position
   */
  async seekTo(positionMs: number): Promise<void> {
    if (!this.sound) return;

    try {
      await this.sound.setPositionAsync(positionMs);
      useLibraryStore.getState().setPosition(positionMs);
    } catch (error) {
      console.error('[AudioPlayback] Failed to seek:', error);
    }
  }

  /**
   * Set callback for track end (for auto-advance)
   */
  setOnTrackEnd(callback: () => void): void {
    this.onTrackEndCallback = callback;
  }

  /**
   * Get current playback state
   */
  isPlaying(): boolean {
    return useLibraryStore.getState().playback.isPlaying;
  }

  /**
   * Get current track ID
   */
  getCurrentTrackId(): string | null {
    return this.currentTrackId;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async unloadCurrent(): Promise<void> {
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (error) {
        console.warn('[AudioPlayback] Error unloading sound:', error);
      }
      this.sound = null;
      this.currentTrackId = null;
    }
  }

  private handlePlaybackStatusUpdate(status: AVPlaybackStatus): void {
    if (!status.isLoaded) return;

    const store = useLibraryStore.getState();

    // Update position
    if (status.positionMillis !== undefined) {
      store.setPosition(status.positionMillis);
    }

    // Update duration
    if (status.durationMillis !== undefined) {
      store.setDuration(status.durationMillis);
    }

    // Update playing state
    if (status.isPlaying !== store.playback.isPlaying) {
      store.setIsPlaying(status.isPlaying);
    }

    // Handle track end - auto-advance
    if (status.didJustFinish) {
      console.log('[AudioPlayback] Track finished, advancing to next');
      
      if (this.onTrackEndCallback) {
        this.onTrackEndCallback();
      } else {
        // Default behavior: play next
        this.playNext();
      }
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const audioPlaybackService = new AudioPlaybackService();

