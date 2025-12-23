/**
 * BLE Diagnostics Utility
 * 
 * Diagnostic tools for troubleshooting BLE issues
 */

import { Platform } from 'react-native';

let BleManager: any = null;
let State: any = null;

try {
  const bleModule = require('react-native-ble-plx');
  BleManager = bleModule.BleManager;
  State = bleModule.State;
} catch (error) {
  // BLE module not available
}

export interface BleDiagnostics {
  bleModuleAvailable: boolean;
  bluetoothEnabled: boolean;
  bluetoothState: string | null;
  permissionsGranted: boolean;
  androidVersion: number | null;
  recommendations: string[];
}

/**
 * Run comprehensive BLE diagnostics
 */
export async function runBleDiagnostics(): Promise<BleDiagnostics> {
  const diagnostics: BleDiagnostics = {
    bleModuleAvailable: false,
    bluetoothEnabled: false,
    bluetoothState: null,
    permissionsGranted: false,
    androidVersion: Platform.OS === 'android' ? (Platform.Version as number) : null,
    recommendations: [],
  };

  // Check if BLE module is available
  if (!BleManager) {
    diagnostics.recommendations.push(
      '⚠️ react-native-ble-plx non disponibile. Assicurati di usare un build nativo, non Expo Go.'
    );
    return diagnostics;
  }

  diagnostics.bleModuleAvailable = true;

  try {
    const manager = new BleManager();
    const state = await manager.state();

    diagnostics.bluetoothState = state;

    // Map state to boolean
    diagnostics.bluetoothEnabled = state === State.PoweredOn;

    // Check permissions (Android)
    if (Platform.OS === 'android') {
      // Note: We can't check permissions directly without requesting them
      // But we can check Android version
      if (diagnostics.androidVersion && diagnostics.androidVersion < 31) {
        diagnostics.recommendations.push(
          '📱 Android < 12: Assicurati di avere il permesso "Posizione" concesso in Impostazioni → App → Pandemic'
        );
      } else if (diagnostics.androidVersion && diagnostics.androidVersion >= 31) {
        diagnostics.recommendations.push(
          '📱 Android 12+: Assicurati di avere i permessi Bluetooth concessi in Impostazioni → App → Pandemic → Permessi'
        );
      }
    }

    // State-specific recommendations
    if (!diagnostics.bluetoothEnabled) {
      switch (state) {
        case State.PoweredOff:
          diagnostics.recommendations.push('🔵 Attiva il Bluetooth nelle impostazioni del dispositivo');
          break;
        case State.Unauthorized:
          diagnostics.recommendations.push('🔒 Concedi i permessi Bluetooth all\'app');
          break;
        case State.Unsupported:
          diagnostics.recommendations.push('❌ Questo dispositivo non supporta Bluetooth Low Energy');
          break;
        default:
          diagnostics.recommendations.push(`⚠️ Stato Bluetooth: ${state}. Attiva il Bluetooth.`);
      }
    }

    // Cleanup
    manager.destroy();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    diagnostics.recommendations.push(`❌ Errore durante la diagnostica: ${errorMessage}`);
  }

  // General recommendations
  if (diagnostics.bluetoothEnabled && diagnostics.bleModuleAvailable) {
    diagnostics.recommendations.push('✅ Bluetooth attivo e modulo disponibile');
    diagnostics.recommendations.push('💡 Se la stanza non viene vista, verifica che entrambi i dispositivi siano vicini (entro 10-30m)');
    diagnostics.recommendations.push('💡 Assicurati che entrambi i dispositivi abbiano l\'app in foreground');
  }

  return diagnostics;
}

/**
 * Format diagnostics as a readable string
 */
export function formatDiagnostics(diagnostics: BleDiagnostics): string {
  const lines: string[] = [];
  
  lines.push('=== BLE DIAGNOSTICS ===');
  lines.push('');
  lines.push(`BLE Module: ${diagnostics.bleModuleAvailable ? '✅ Disponibile' : '❌ Non disponibile'}`);
  lines.push(`Bluetooth: ${diagnostics.bluetoothEnabled ? '✅ Attivo' : '❌ Non attivo'}`);
  lines.push(`Stato: ${diagnostics.bluetoothState || 'Sconosciuto'}`);
  
  if (Platform.OS === 'android') {
    lines.push(`Android Version: ${diagnostics.androidVersion || 'N/A'}`);
  }
  
  lines.push('');
  lines.push('Raccomandazioni:');
  diagnostics.recommendations.forEach((rec, index) => {
    lines.push(`${index + 1}. ${rec}`);
  });
  
  return lines.join('\n');
}
