/**
 * Library Screen - Local audio file management
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Header } from '../src/components/Header';
import { EmptyState } from '../src/components/EmptyState';
import { Button } from '../src/components/Button';
import audioLibraryService from '../src/services/AudioLibraryService';
import roomService from '../src/services/RoomService';
import { useRoomStore } from '../src/stores/roomStore';
import { AudioFileMetadata, AudioFormat } from '../src/types';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';
import { formatFileSize, formatDuration } from '../src/utils/format';

export default function LibraryScreen() {
  const [files, setFiles] = useState<AudioFileMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const room = useRoomStore((state) => state.room);
  const mySharedFiles = useRoomStore((state) => state.mySharedFiles);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      await audioLibraryService.initialize();
      const localFiles = audioLibraryService.getLocalFiles();
      
      if (localFiles.length === 0) {
        // Try scanning device
        const scannedFiles = await audioLibraryService.scanDeviceAudio();
        setFiles(scannedFiles);
      } else {
        setFiles(localFiles);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
      });

      if (result.canceled) return;

      for (const asset of result.assets) {
        const imported = await audioLibraryService.importFile(asset.uri);
        if (imported) {
          setFiles((prev) => [...prev, imported]);
        }
      }

      Alert.alert('Successo', 'File importati correttamente');
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile importare i file');
    }
  };

  const handleScanDevice = async () => {
    setIsLoading(true);
    try {
      const scannedFiles = await audioLibraryService.scanDeviceAudio();
      setFiles(scannedFiles);
      Alert.alert('Scansione completata', `Trovati ${scannedFiles.length} file audio`);
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Impossibile scansionare il dispositivo');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleShareSelected = () => {
    if (selectedFiles.size === 0) return;

    const filesToShare = files.filter((f) => selectedFiles.has(f.fileId));
    roomService.shareFiles(filesToShare);
    
    Alert.alert(
      'File condivisi',
      `${filesToShare.length} file sono ora disponibili nella stanza`,
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  const handleDeleteFile = (file: AudioFileMetadata) => {
    Alert.alert(
      'Elimina file',
      `Vuoi eliminare "${file.title}" dalla libreria?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            await audioLibraryService.deleteFile(file.fileId);
            setFiles((prev) => prev.filter((f) => f.fileId !== file.fileId));
          },
        },
      ]
    );
  };

  const isFileShared = (fileId: string) =>
    mySharedFiles.some((f) => f.fileId === fileId);

  const renderFileItem = ({ item }: { item: AudioFileMetadata }) => {
    const isSelected = selectedFiles.has(item.fileId);
    const isShared = isFileShared(item.fileId);

    return (
      <TouchableOpacity
        style={[
          styles.fileItem,
          isSelected && styles.fileItemSelected,
          isShared && styles.fileItemShared,
        ]}
        onPress={() => {
          if (isSelectionMode || room) {
            toggleSelection(item.fileId);
          }
        }}
        onLongPress={() => {
          if (!isSelectionMode && !room) {
            handleDeleteFile(item);
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.fileIcon}>
          <Text style={styles.fileIconText}>{getFormatIcon(item.format)}</Text>
          {(isSelectionMode || room) && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.fileArtist} numberOfLines={1}>
            {item.artist || 'Artista sconosciuto'}
          </Text>
          <View style={styles.fileMeta}>
            <Text style={styles.fileMetaText}>{formatDuration(item.duration)}</Text>
            <Text style={styles.fileMetaDot}>•</Text>
            <Text style={styles.fileMetaText}>{formatFileSize(item.sizeBytes)}</Text>
            <Text style={styles.fileMetaDot}>•</Text>
            <Text style={styles.fileMetaText}>{item.format.toUpperCase()}</Text>
          </View>
        </View>

        {isShared && (
          <View style={styles.sharedBadge}>
            <Text style={styles.sharedBadgeText}>📤</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="La mia libreria"
        subtitle={`${files.length} file`}
        showBack
        onBack={() => router.back()}
        rightIcon="📂"
        onRightPress={handleImportFile}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Caricamento libreria...</Text>
        </View>
      ) : (
        <>
          {/* Action Bar */}
          {room && (
            <View style={styles.actionBar}>
              <Text style={styles.actionBarText}>
                Seleziona i file da condividere nella stanza
              </Text>
            </View>
          )}

          <FlatList
            data={files}
            keyExtractor={(item) => item.fileId}
            contentContainerStyle={styles.listContent}
            renderItem={renderFileItem}
            ListEmptyComponent={
              <EmptyState
                icon="🎵"
                title="Libreria vuota"
                description="Importa file audio o scansiona il dispositivo per trovare la tua musica"
                actionTitle="Importa file"
                onAction={handleImportFile}
              />
            }
            ListHeaderComponent={
              files.length > 0 ? (
                <View style={styles.statsCard}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{files.length}</Text>
                    <Text style={styles.statLabel}>File</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatFileSize(audioLibraryService.getTotalSize())}
                    </Text>
                    <Text style={styles.statLabel}>Totale</Text>
                  </View>
                  {room && (
                    <>
                      <View style={styles.statDivider} />
                      <View style={styles.statItem}>
                        <Text style={styles.statValue}>{selectedFiles.size}</Text>
                        <Text style={styles.statLabel}>Selezionati</Text>
                      </View>
                    </>
                  )}
                </View>
              ) : null
            }
          />

          {/* Bottom Actions */}
          {files.length === 0 && (
            <View style={styles.bottomActions}>
              <Button
                title="Scansiona dispositivo"
                onPress={handleScanDevice}
                variant="outline"
                fullWidth
              />
            </View>
          )}

          {room && selectedFiles.size > 0 && (
            <View style={styles.shareBar}>
              <Button
                title={`Condividi ${selectedFiles.size} file`}
                onPress={handleShareSelected}
                fullWidth
                size="lg"
              />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

function getFormatIcon(format: AudioFormat): string {
  switch (format) {
    case AudioFormat.MP3:
      return '🎵';
    case AudioFormat.WAV:
      return '🎼';
    case AudioFormat.FLAC:
      return '💎';
    case AudioFormat.M4A:
    case AudioFormat.AAC:
      return '🎶';
    case AudioFormat.OPUS:
    case AudioFormat.OGG:
      return '🎧';
    default:
      return '🎵';
  }
}

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

  // Action Bar
  actionBar: {
    padding: Spacing.md,
    backgroundColor: Colors.primaryGlow,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary + '40',
  },

  actionBarText: {
    fontSize: Typography.sizes.sm,
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Stats Card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  statItem: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  statLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },

  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },

  // List
  listContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },

  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  fileItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },

  fileItemShared: {
    borderColor: Colors.secondary + '60',
  },

  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
    position: 'relative',
  },

  fileIconText: {
    fontSize: 24,
  },

  checkbox: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  checkmark: {
    fontSize: 12,
    color: Colors.textInverse,
    fontWeight: '700',
  },

  fileInfo: {
    flex: 1,
  },

  fileTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  fileArtist: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },

  fileMetaText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },

  fileMetaDot: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginHorizontal: Spacing.xs,
  },

  sharedBadge: {
    marginLeft: Spacing.sm,
  },

  sharedBadgeText: {
    fontSize: 18,
  },

  // Bottom Actions
  bottomActions: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  shareBar: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});

