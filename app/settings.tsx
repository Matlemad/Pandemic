/**
 * Settings Screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../src/components/Header';
import { useAppStore } from '../src/stores/appStore';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';
import { runBleDiagnostics, formatDiagnostics } from '../src/utils/bleDiagnostics';

export default function SettingsScreen() {
  const deviceName = useAppStore((state) => state.deviceName);
  const settings = useAppStore((state) => state.settings);
  const setDeviceName = useAppStore((state) => state.setDeviceName);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const deviceId = useAppStore((state) => state.deviceId);

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(deviceName);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

  const handleSaveName = () => {
    if (tempName.trim()) {
      setDeviceName(tempName.trim());
    } else {
      setTempName(deviceName);
    }
    setEditingName(false);
  };

  const handleRunDiagnostics = async () => {
    setDiagnosticsRunning(true);
    try {
      const diagnostics = await runBleDiagnostics();
      const formatted = formatDiagnostics(diagnostics);
      Alert.alert('Diagnostica BLE', formatted);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Errore', `Errore durante la diagnostica: ${errorMessage}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  };

  const handleResetApp = () => {
    Alert.alert(
      'Reset App',
      'Questo cancellerà tutte le impostazioni e la libreria locale. Continuare?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Funzionalità non implementata');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Impostazioni"
        showBack
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Device Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DISPOSITIVO</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => setEditingName(true)}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Nome dispositivo</Text>
                {editingName ? (
                  <TextInput
                    style={styles.nameInput}
                    value={tempName}
                    onChangeText={setTempName}
                    onBlur={handleSaveName}
                    onSubmitEditing={handleSaveName}
                    autoFocus
                    maxLength={30}
                  />
                ) : (
                  <Text style={styles.settingValue}>{deviceName}</Text>
                )}
              </View>
              {!editingName && (
                <Text style={styles.settingArrow}>✏️</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>ID dispositivo</Text>
                <Text style={styles.settingValueMono}>
                  {deviceId.slice(0, 8)}...{deviceId.slice(-4)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Transfer Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TRASFERIMENTI</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Qualità compressione</Text>
                <Text style={styles.settingDescription}>
                  Per file condivisi
                </Text>
              </View>
              <View style={styles.qualityPicker}>
                {(['original', 'high', 'medium', 'low'] as const).map((quality) => (
                  <TouchableOpacity
                    key={quality}
                    style={[
                      styles.qualityOption,
                      settings.compressionQuality === quality && styles.qualityOptionActive,
                    ]}
                    onPress={() => updateSettings({ compressionQuality: quality })}
                  >
                    <Text
                      style={[
                        styles.qualityText,
                        settings.compressionQuality === quality && styles.qualityTextActive,
                      ]}
                    >
                      {quality === 'original' ? 'Orig' : 
                       quality === 'high' ? 'Alta' :
                       quality === 'medium' ? 'Media' : 'Bassa'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Trasferimenti simultanei</Text>
                <Text style={styles.settingDescription}>
                  Massimo {settings.maxConcurrentTransfers}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => {
                    if (settings.maxConcurrentTransfers > 1) {
                      updateSettings({ maxConcurrentTransfers: settings.maxConcurrentTransfers - 1 });
                    }
                  }}
                >
                  <Text style={styles.stepperText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{settings.maxConcurrentTransfers}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => {
                    if (settings.maxConcurrentTransfers < 5) {
                      updateSettings({ maxConcurrentTransfers: settings.maxConcurrentTransfers + 1 });
                    }
                  }}
                >
                  <Text style={styles.stepperText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Mantieni schermo acceso</Text>
                <Text style={styles.settingDescription}>
                  Durante i trasferimenti
                </Text>
              </View>
              <Switch
                value={settings.keepScreenOnDuringTransfer}
                onValueChange={(value) => updateSettings({ keepScreenOnDuringTransfer: value })}
                trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
                thumbColor={settings.keepScreenOnDuringTransfer ? Colors.primary : Colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* Diagnostics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DIAGNOSTICA</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleRunDiagnostics}
              disabled={diagnosticsRunning}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Esegui diagnostica BLE</Text>
                <Text style={styles.settingDescription}>
                  Verifica lo stato del Bluetooth e dei permessi
                </Text>
              </View>
              <Text style={styles.settingArrow}>
                {diagnosticsRunning ? '⏳' : '🔍'}
              </Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>⚠️ Nota BLE</Text>
                <Text style={styles.settingDescription}>
                  L'advertising BLE non è ancora completamente implementato. Le stanze potrebbero non essere visibili immediatamente.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INFO</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Versione</Text>
              </View>
              <Text style={styles.settingValue}>1.0.0</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Architettura</Text>
              </View>
              <Text style={styles.settingValue}>BLE + Wi-Fi LAN</Text>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>ZONA PERICOLOSA</Text>

          <View style={[styles.card, styles.dangerCard]}>
            <TouchableOpacity
              style={styles.settingRow}
              onPress={handleResetApp}
            >
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, styles.dangerText]}>
                  Reset applicazione
                </Text>
                <Text style={styles.settingDescription}>
                  Cancella tutte le impostazioni e la libreria
                </Text>
              </View>
              <Text style={styles.settingArrow}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerEmoji}>🦠</Text>
          <Text style={styles.footerText}>PANDEMIC</Text>
          <Text style={styles.footerSubtext}>
            Offline-first • Locale • Peer-to-peer
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  // Sections
  section: {
    marginBottom: Spacing.xl,
  },

  sectionTitle: {
    fontSize: Typography.sizes.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  dangerTitle: {
    color: Colors.error,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  dangerCard: {
    borderColor: Colors.error + '40',
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },

  settingInfo: {
    flex: 1,
  },

  settingLabel: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  settingDescription: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },

  settingValue: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },

  settingValueMono: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    fontFamily: 'Menlo',
    marginTop: 2,
  },

  settingArrow: {
    fontSize: 18,
    color: Colors.textMuted,
  },

  dangerText: {
    color: Colors.error,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md,
  },

  // Name Input
  nameInput: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.xs,
  },

  // Quality Picker
  qualityPicker: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.md,
    padding: 2,
  },

  qualityOption: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },

  qualityOptionActive: {
    backgroundColor: Colors.primary,
  },

  qualityText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  qualityTextActive: {
    color: Colors.textInverse,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.md,
  },

  stepperButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },

  stepperText: {
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    fontWeight: '500',
  },

  stepperValue: {
    fontSize: Typography.sizes.md,
    color: Colors.textPrimary,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },

  footerEmoji: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },

  footerText: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 2,
  },

  footerSubtext: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});

