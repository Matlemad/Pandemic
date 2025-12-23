# 🔧 Implementazione BLE Advertising Nativa

## ✅ Completato - Android

### File Creati/Modificati

1. **Native Module Android** (Kotlin):
   - `android/app/src/main/java/com/pandemic/app/BleAdvertisingModule.kt`
   - Implementa `BluetoothLeAdvertiser` per BLE advertising
   - Gestisce permessi Android 12+ e versioni precedenti
   - Espone metodi: `startAdvertising()`, `stopAdvertising()`, `isAdvertising()`

2. **React Native Package**:
   - `android/app/src/main/java/com/pandemic/app/BleAdvertisingPackage.kt`
   - Registra il modulo nativo per React Native

3. **MainApplication.kt**:
   - Registrato `BleAdvertisingPackage` nella lista dei packages

4. **Bridge TypeScript**:
   - `src/services/native/BleAdvertisingNative.ts`
   - Wrapper TypeScript per il modulo nativo
   - Gestisce errori e fallback

5. **Integrazione in BleService.ts**:
   - Modificato `startAdvertising()` per usare il modulo nativo quando disponibile
   - Modificato `stopAdvertising()` per essere async e fermare il modulo nativo
   - Fallback a modalità simulazione se il modulo non è disponibile

### Come Funziona

1. **Quando viene creato un host:**
   - `BleService.startAdvertising()` viene chiamato
   - Verifica se il modulo nativo è disponibile (Android)
   - Se disponibile, chiama `BleAdvertisingModule.startAdvertising()` nativo
   - Il modulo nativo usa `BluetoothLeAdvertiser` per fare advertising BLE reale
   - I dati della stanza sono codificati nel service data BLE

2. **Quando uno guest scansiona:**
   - `react-native-ble-plx` scansiona per il Service UUID `0000FDA0-0000-1000-8000-00805F9B34FB`
   - I dispositivi che fanno advertising con questo UUID vengono trovati
   - I dati vengono decodificati dal service data o dal device name

### Limitazioni Attuali

- **iOS**: Non ancora implementato (richiede codice Swift nativo)
- **Dati limitati**: Service data è limitato a 31 bytes, quindi alcuni dati potrebbero essere troncati
- **Device name**: Android usa il nome del dispositivo di sistema, non possiamo cambiarlo facilmente

---

## 📋 TODO - iOS

### Da Implementare

1. **Native Module iOS** (Swift):
   - Creare `ios/Pandemic/BleAdvertisingModule.swift`
   - Usare `CBPeripheralManager` per BLE advertising
   - Esporre gli stessi metodi del modulo Android

2. **Bridge Objective-C**:
   - Creare header file per il bridge
   - Collegare Swift a React Native

3. **Aggiornare BleAdvertisingNative.ts**:
   - Supportare iOS oltre ad Android

---

## 🧪 Test

### Test Android

1. **Compilare e installare:**
   ```bash
   cd /Users/matteotambussi/Documents/GitHub/Pandemic
   JAVA_HOME=$(/usr/libexec/java_home -v 17) npx expo run:android --device
   ```

2. **Test su due dispositivi Android:**
   - Dispositivo A: Crea una stanza (Host)
   - Dispositivo B: Trova stanze (Guest)
   - Verifica che la stanza appaia nella lista

3. **Verificare log:**
   - Cercare "Using native BLE advertising module" nel log
   - Cercare "Native BLE advertising started successfully"
   - Se ci sono errori, verificare permessi Bluetooth

### Debug

Se l'advertising non funziona:

1. **Verifica permessi:**
   - Impostazioni → App → Pandemic → Permessi
   - Deve avere: Bluetooth, Posizione

2. **Verifica log nativo:**
   ```bash
   adb logcat | grep BleAdvertisingModule
   ```

3. **Verifica stato Bluetooth:**
   - Assicurati che Bluetooth sia attivo su entrambi i dispositivi
   - Assicurati che i dispositivi siano vicini (entro 10-30m)

4. **Verifica che il modulo sia registrato:**
   - Nel codice TypeScript, `bleAdvertisingNative.isAvailable()` deve restituire `true` su Android

---

## 📝 Note Tecniche

### Service UUID
- UUID usato: `0000FDA0-0000-1000-8000-00805F9B34FB`
- Questo UUID viene incluso nell'advertisement data
- Gli scanner cercano questo UUID per trovare stanze Pandemic

### Formato Dati
I dati della stanza sono codificati nel service data:
- Formato: `roomId|hostId|wifi|hostAddress`
- Limitato a 31 bytes (limite BLE)
- Se troppo lungo, viene troncato

### Permessi Android
- Android 12+ (API 31+): Richiede `BLUETOOTH_ADVERTISE` permission (runtime)
- Android < 12: Richiede `BLUETOOTH_ADMIN` permission (install-time)

---

## 🔄 Prossimi Passi

1. ✅ Completare test Android
2. ⏳ Implementare versione iOS
3. ⏳ Migliorare encoding dei dati (JSON compresso?)
4. ⏳ Gestire riconnessioni automatiche
5. ⏳ Aggiungere metriche/statistiche advertising

---

**Ultima Modifica**: 2024
**Stato**: ✅ Android implementato, ⏳ iOS da implementare
