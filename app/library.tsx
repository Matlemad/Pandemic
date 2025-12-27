/**
 * Library Screen - Audio library with playback and reordering
 * 
 * Features:
 * - Manual reorder tracks (up/down buttons)
 * - Single-track and playlist playback
 * - Import from device
 * - Track selection for sharing in rooms
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Paths, File, Directory } from 'expo-file-system/next';
import { Header } from '../src/components/Header';
import { EmptyState } from '../src/components/EmptyState';
import { Button } from '../src/components/Button';
import { useLibraryStore, LibraryTrack } from '../src/stores/libraryStore';
import { audioPlaybackService } from '../src/services/AudioPlaybackService';
import { roomService } from '../src/services';
import { useRoomStore } from '../src/stores/roomStore';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';
import { formatFileSize, formatDuration } from '../src/utils/format';
import { generateId } from '../src/utils/id';

// ============================================================================
// LIBRARY SCREEN
// ============================================================================

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  
  const tracks = useLibraryStore((state) => state.tracks);
  const playback = useLibraryStore((state) => state.playback);
  const isLoaded = useLibraryStore((state) => state.isLoaded);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);
  const addTrack = useLibraryStore((state) => state.addTrack);
  const removeTrack = useLibraryStore((state) => state.removeTrack);
  const reorderTracks = useLibraryStore((state) => state.reorderTracks);

  const room = useRoomStore((state) => state.room);
  const mySharedFiles = useRoomStore((state) => state.mySharedFiles);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  
  // Calculate player bar height with safe area
  const playerBarHeight = 72 + insets.bottom;

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Update progress bar
  useEffect(() => {
    const progress = playback.durationMs > 0 
      ? playback.positionMs / playback.durationMs 
      : 0;
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 100,
      useNativeDriver: false,
    }).start();
  }, [playback.positionMs, playback.durationMs, progressAnim]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleImportFile = async () => {
    try {
      setIsImporting(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      let importedCount = 0;

      for (const asset of result.assets) {
        // Copy to permanent app storage
        const fileName = asset.name || `audio_${Date.now()}.mp3`;
        const libraryDir = new Directory(Paths.document, 'library');
        if (!libraryDir.exists) {
          libraryDir.create();
        }
        
        const destFileName = `${generateId()}_${fileName}`;
        const sourceFile = new File(asset.uri);
        const destFile = new File(libraryDir, destFileName);

        // Copy file
        sourceFile.copy(destFile);

        // Add to library store
        await addTrack({
          title: fileName.replace(/\.[^/.]+$/, ''),
          artist: undefined,
          durationMs: undefined,
          mimeType: asset.mimeType || 'audio/mpeg',
          localUri: destFile.uri,
          source: 'imported',
          size: asset.size,
        });

        importedCount++;
      }

      Alert.alert('Successo', `${importedCount} file importati`);
    } catch (error: any) {
      console.error('[Library] Import failed:', error);
      Alert.alert('Errore', error.message || 'Impossibile importare i file');
    } finally {
      setIsImporting(false);
    }
  };

  const handlePlayTrack = async (trackId: string) => {
    // If in selection mode (room context), toggle selection instead
    if (room) {
      toggleSelection(trackId);
      return;
    }

    await audioPlaybackService.playTrack(trackId);
  };

  const handleTogglePlayPause = async () => {
    await audioPlaybackService.togglePlayPause();
  };

  const handleNext = async () => {
    await audioPlaybackService.playNext();
  };

  const handlePrevious = async () => {
    await audioPlaybackService.playPrevious();
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...tracks];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    reorderTracks(newOrder.map((t) => t.id));
  };

  const handleMoveDown = (index: number) => {
    if (index >= tracks.length - 1) return;
    const newOrder = [...tracks];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    reorderTracks(newOrder.map((t) => t.id));
  };

  const handleDeleteTrack = (track: LibraryTrack) => {
    Alert.alert(
      'Elimina traccia',
      `Vuoi eliminare "${track.title}" dalla libreria?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            // Stop if currently playing
            if (playback.currentTrackId === track.id) {
              await audioPlaybackService.stop();
            }
            
            // Delete file
            try {
              const fileToDelete = new File(track.localUri);
              if (fileToDelete.exists) {
                fileToDelete.delete();
              }
            } catch (e) {
              console.warn('[Library] Failed to delete file:', e);
            }
            
            // Remove from store
            await removeTrack(track.id);
          },
        },
      ]
    );
  };

  const toggleSelection = (trackId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  };

  const handleShareSelected = async () => {
    if (selectedIds.size === 0) return;

    const selectedTracks = tracks.filter((t) => selectedIds.has(t.id));

    // Convert to LocalAudioFile format for roomService
    const localFiles = selectedTracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.durationMs ? Math.floor(t.durationMs / 1000) : 0,
      size: t.size || 0,
      mimeType: t.mimeType || 'audio/mpeg',
      sha256: t.sha256 || '',
      localPath: t.localUri,
      addedAt: t.createdAt,
      isShared: true,
    }));

    await roomService.shareFiles(localFiles);

    Alert.alert(
      'File condivisi',
      `${selectedTracks.length} file sono ora disponibili nella stanza`,
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  // ============================================================================
  // RENDER ITEM
  // ============================================================================

  const renderTrackItem = useCallback(
    ({ item, index }: { item: LibraryTrack; index: number }) => {
      const isPlaying = playback.currentTrackId === item.id && playback.isPlaying;
      const isCurrent = playback.currentTrackId === item.id;
      const isSelected = selectedIds.has(item.id);
      const isShared = mySharedFiles.some((f) => f.fileId === item.id);

      return (
        <TouchableOpacity
          style={[
            styles.trackItem,
            isCurrent && styles.trackItemCurrent,
            isSelected && styles.trackItemSelected,
          ]}
          onPress={() => room ? toggleSelection(item.id) : handlePlayTrack(item.id)}
          onLongPress={room ? undefined : () => handleDeleteTrack(item)}
          delayLongPress={500}
          activeOpacity={0.7}
        >
          {/* Play Button - always visible */}
          <TouchableOpacity
            style={[styles.playButton, isPlaying && styles.playButtonActive]}
            onPress={() => {
              if (isPlaying) {
                audioPlaybackService.pause();
              } else {
                audioPlaybackService.playTrack(item.id);
              }
            }}
          >
            <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>

          {/* Reorder Buttons - always visible when multiple tracks */}
          {tracks.length > 1 && (
            <View style={styles.reorderButtons}>
              <TouchableOpacity
                style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                onPress={() => handleMoveUp(index)}
                disabled={index === 0}
              >
                <Text style={styles.reorderBtnText}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reorderBtn, index >= tracks.length - 1 && styles.reorderBtnDisabled]}
                onPress={() => handleMoveDown(index)}
                disabled={index >= tracks.length - 1}
              >
                <Text style={styles.reorderBtnText}>▼</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Selection checkbox (only in room mode) */}
          {room && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}

          {/* Track number (only when not in room) */}
          {!room && (
            <View style={[styles.trackIcon, isCurrent && styles.trackIconPlaying]}>
              <Text style={styles.trackNumber}>{index + 1}</Text>
            </View>
          )}

          {/* Track Info */}
          <View style={styles.trackInfo}>
            <Text 
              style={[styles.trackTitle, isCurrent && styles.trackTitlePlaying]} 
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <View style={styles.trackMeta}>
              {item.artist && (
                <>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                  <Text style={styles.metaDot}>•</Text>
                </>
              )}
              <Text style={styles.trackDuration}>
                {item.durationMs ? formatDuration(item.durationMs / 1000) : '--:--'}
              </Text>
              <Text style={styles.metaDot}>•</Text>
              <View style={[styles.sourceBadge, item.source === 'downloaded' && styles.sourceBadgeDownloaded]}>
                <Text style={styles.sourceBadgeText}>
                  {item.source === 'imported' ? '📂' : '📥'}
                </Text>
              </View>
            </View>
          </View>

          {/* Shared indicator */}
          {isShared && (
            <View style={styles.sharedIndicator}>
              <Text style={styles.sharedIcon}>📤</Text>
            </View>
          )}

          {/* Delete button (not in room mode) */}
          {!room && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteTrack(item)}
            >
              <Text style={styles.deleteButtonText}>🗑</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    },
    [playback, selectedIds, room, mySharedFiles, tracks.length]
  );

  // ============================================================================
  // CURRENT TRACK
  // ============================================================================

  const currentTrack = playback.currentTrackId 
    ? tracks.find((t) => t.id === playback.currentTrackId)
    : null;

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Caricamento libreria...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalSize = tracks.reduce((sum, t) => sum + (t.size || 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="La tua libreria"
        subtitle={`${tracks.length} tracce`}
        showBack
        onBack={() => router.back()}
        rightIcon={isImporting ? undefined : '➕'}
        onRightPress={isImporting ? undefined : handleImportFile}
      />

      {/* Room Selection Banner */}
      {room && (
        <View style={styles.selectionBanner}>
          <Text style={styles.selectionBannerText}>
            📤 Seleziona le tracce da condividere nella stanza
          </Text>
        </View>
      )}

      {/* Stats */}
      {tracks.length > 0 && (
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tracks.length}</Text>
            <Text style={styles.statLabel}>Tracce</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatFileSize(totalSize)}</Text>
            <Text style={styles.statLabel}>Totale</Text>
          </View>
          {room && selectedIds.size > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: Colors.primary }]}>
                  {selectedIds.size}
                </Text>
                <Text style={styles.statLabel}>Selezionate</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Track List */}
      <FlatList<LibraryTrack>
        data={tracks}
        keyExtractor={(item: LibraryTrack) => item.id}
        renderItem={renderTrackItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="🎵"
            title="Libreria vuota"
            description="Importa file audio per iniziare"
            actionTitle="Importa file"
            onAction={handleImportFile}
          />
        }
      />

      {/* Share Bar (when in room) */}
      {room && selectedIds.size > 0 && (
        <View style={styles.shareBar}>
          <Button
            title={`Condividi ${selectedIds.size} tracce`}
            onPress={handleShareSelected}
            fullWidth
            size="lg"
          />
        </View>
      )}

      {/* Bottom Player Bar - always visible when playing */}
      {currentTrack && (
        <View style={[styles.playerBar, { paddingBottom: insets.bottom }]}>
          {/* Progress */}
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />

          {/* Track Info */}
          <View style={styles.playerInfo}>
            <Text style={styles.playerTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.playerArtist} numberOfLines={1}>
              {currentTrack.artist || 'Artista sconosciuto'}
            </Text>
          </View>

          {/* Controls */}
          <View style={styles.playerControls}>
            <TouchableOpacity
              style={styles.playerButton}
              onPress={handlePrevious}
            >
              <Text style={styles.playerButtonText}>⏮</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.playerButton, styles.playPauseButton]}
              onPress={handleTogglePlayPause}
            >
              <Text style={styles.playPauseText}>
                {playback.isPlaying ? '⏸' : '▶️'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playerButton}
              onPress={handleNext}
            >
              <Text style={styles.playerButtonText}>⏭</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Loading overlay */}
      {isImporting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingOverlayText}>Importazione in corso...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },

  // Selection Banner
  selectionBanner: {
    backgroundColor: Colors.primaryGlow,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '40',
  },

  selectionBannerText: {
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  stat: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },

  statValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  statLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },

  // List
  listContent: {
    padding: Spacing.md,
    paddingBottom: 120, // Space for player bar
  },

  // Track Item
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  trackItemCurrent: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },

  trackItemSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryGlow,
  },

  // Reorder Buttons
  reorderButtons: {
    marginRight: Spacing.xs,
  },

  reorderBtn: {
    width: 24,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  reorderBtnDisabled: {
    opacity: 0.3,
  },

  reorderBtnText: {
    fontSize: 10,
    color: Colors.textMuted,
  },

  // Play Button
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },

  playButtonActive: {
    backgroundColor: Colors.primary,
  },

  playButtonText: {
    fontSize: 16,
  },

  // Track Icon
  trackIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },

  trackIconPlaying: {
    backgroundColor: Colors.primary,
  },

  playingIcon: {
    fontSize: 14,
    color: Colors.textInverse,
  },

  trackNumber: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    fontWeight: '600',
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkboxSelected: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },

  checkmark: {
    fontSize: 12,
    color: Colors.textInverse,
    fontWeight: '700',
  },

  // Track Info
  trackInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },

  trackTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  trackTitlePlaying: {
    color: Colors.primary,
  },

  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  trackArtist: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    maxWidth: 120,
  },

  trackDuration: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },

  metaDot: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginHorizontal: 4,
  },

  // Source Badge
  sourceBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: Colors.surfaceHighlight,
  },

  sourceBadgeDownloaded: {
    backgroundColor: Colors.secondaryGlow,
  },

  sourceBadgeText: {
    fontSize: 10,
  },

  // Shared indicator
  sharedIndicator: {
    marginRight: Spacing.xs,
  },

  sharedIcon: {
    fontSize: 16,
  },

  // Delete button
  deleteButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
  },

  deleteButtonText: {
    fontSize: 16,
  },

  // Share Bar
  shareBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  // Player Bar
  playerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },

  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 3,
    backgroundColor: Colors.primary,
  },

  playerInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },

  playerTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  playerArtist: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  playerControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  playerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  playerButtonText: {
    fontSize: 20,
  },

  playPauseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.xs,
  },

  playPauseText: {
    fontSize: 22,
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingOverlayText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
  },
});
