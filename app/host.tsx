/**
 * Host Screen - Create a new room
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../src/components/Header';
import { Button } from '../src/components/Button';
import { useAppStore } from '../src/stores/appStore';
import roomService from '../src/services/RoomService';
import { Colors, Spacing, BorderRadius, Typography } from '../src/constants/theme';
import { generateRoomCode } from '../src/utils/id';

export default function HostScreen() {
  const deviceName = useAppStore((state) => state.deviceName);
  const networkCapabilities = useAppStore((state) => state.networkCapabilities);
  
  const [roomName, setRoomName] = useState(`${deviceName}'s Room`);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Errore', 'Inserisci un nome per la stanza');
      return;
    }

    setIsCreating(true);

    try {
      const room = await roomService.createRoom(roomName.trim());
      
      if (room) {
        router.replace('/room');
      } else {
        Alert.alert(
          'Errore',
          'Impossibile creare la stanza. Verifica che il Bluetooth sia attivo.'
        );
      }
    } catch (error: any) {
      Alert.alert('Errore', error.message || 'Errore durante la creazione della stanza');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Crea Stanza"
        showBack
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.form}>
          {/* Room Name Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome della stanza</Text>
            <TextInput
              style={styles.input}
              value={roomName}
              onChangeText={setRoomName}
              placeholder="Es: DJ Set @ Club"
              placeholderTextColor={Colors.textMuted}
              maxLength={50}
              autoFocus
            />
            <Text style={styles.hint}>
              Questo nome sarà visibile agli altri dispositivi nelle vicinanze
            </Text>
          </View>

          {/* Network Info */}
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Modalità di connessione</Text>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>
                {networkCapabilities.wifiAvailable ? '✅' : '⚠️'}
              </Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>
                  {networkCapabilities.wifiAvailable ? 'Wi-Fi LAN' : 'Solo Bluetooth'}
                </Text>
                <Text style={styles.infoText}>
                  {networkCapabilities.wifiAvailable
                    ? `Trasferimenti veloci su ${networkCapabilities.localIpAddress || 'rete locale'}`
                    : 'Trasferimenti più lenti, ma funziona senza Wi-Fi'}
                </Text>
              </View>
            </View>

            {!networkCapabilities.wifiAvailable && (
              <View style={styles.warningBox}>
                <Text style={styles.warningIcon}>💡</Text>
                <Text style={styles.warningText}>
                  Connettiti a una rete Wi-Fi locale per trasferimenti più veloci
                </Text>
              </View>
            )}
          </View>

          {/* What to expect */}
          <View style={styles.expectCard}>
            <Text style={styles.expectTitle}>Cosa succederà</Text>
            <View style={styles.expectList}>
              <View style={styles.expectItem}>
                <Text style={styles.expectNumber}>1</Text>
                <Text style={styles.expectText}>
                  La stanza sarà visibile tramite Bluetooth
                </Text>
              </View>
              <View style={styles.expectItem}>
                <Text style={styles.expectNumber}>2</Text>
                <Text style={styles.expectText}>
                  Altri dispositivi potranno unirsi
                </Text>
              </View>
              <View style={styles.expectItem}>
                <Text style={styles.expectNumber}>3</Text>
                <Text style={styles.expectText}>
                  Potrai condividere file audio dalla tua libreria
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Create Button */}
        <View style={styles.footer}>
          <Button
            title={isCreating ? 'Creazione in corso...' : 'Crea Stanza'}
            onPress={handleCreateRoom}
            loading={isCreating}
            disabled={!roomName.trim() || isCreating}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  content: {
    flex: 1,
    padding: Spacing.lg,
  },

  form: {
    flex: 1,
  },

  inputGroup: {
    marginBottom: Spacing.xl,
  },

  label: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.sizes.lg,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  hint: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },

  // Info Card
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  infoTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  infoIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: '500',
    color: Colors.textPrimary,
  },

  infoText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '20',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },

  warningIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },

  warningText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.warning,
  },

  // Expect Card
  expectCard: {
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },

  expectTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  expectList: {
    gap: Spacing.md,
  },

  expectItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  expectNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    color: Colors.textInverse,
    fontSize: Typography.sizes.sm,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
    marginRight: Spacing.md,
    overflow: 'hidden',
  },

  expectText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
  },

  // Footer
  footer: {
    paddingTop: Spacing.lg,
  },
});

