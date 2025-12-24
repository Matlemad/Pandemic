# 🚀 P2P Implementation Plan — Pandemic

## PHASE 0 — Repo Audit & Decisions

### ✅ Configurazione Confermata
- [x] Expo SDK 54 (Bare Workflow / Development Build)
- [x] Cartelle `ios/` e `android/` presenti
- [x] New Architecture abilitata (`newArchEnabled: true`)
- [x] expo-router per navigazione
- [x] TypeScript configurato
- [x] Moduli nativi esistenti (`BleAdvertisingModule.kt`)

### 📦 Librerie P2P Valutate

| Libreria | Android | iOS | File Transfer | Stato |
|----------|---------|-----|---------------|-------|
| `expo-nearby-connections` | ❌ | ❌ | ❌ | Non esiste/non mantenuta |
| `react-native-wifi-p2p` | ✅ Wi-Fi Direct | ❌ | ⚠️ Limitato | Solo Android |
| `react-native-multipeer` | ❌ | ✅ MPC | ❓ | Solo iOS, non aggiornata |
| `react-native-ble-plx` | ✅ | ✅ | ❌ | No advertising/GATT server |

### 🎯 Decisione Finale

**Implementare moduli nativi personalizzati:**
- **Android**: Google Nearby Connections API
- **iOS**: Apple MultipeerConnectivity

**Motivazioni:**
1. Nessuna libreria esistente copre entrambe le piattaforme con file transfer
2. Le API native sono ben documentate e stabili
3. Nearby Connections supporta BYTES, FILE, STREAM payloads
4. MultipeerConnectivity supporta `sendResource` per file

### ⚠️ Limitazione Cross-Platform

**IMPORTANTE**: La comunicazione Android↔iOS NON è possibile con queste API native.
- Nearby Connections: Solo Android↔Android
- MultipeerConnectivity: Solo iOS↔iOS

Per MVP: implementiamo same-platform communication.
Roadmap futura: considerare BLE/WiFi LAN bridge per cross-platform.

---

## 📁 File da Creare/Modificare

### PHASE 1 — P2P Transport Layer

#### TypeScript Interface
```
src/p2p/
├── types.ts              # Tipi per P2P
├── transport.ts          # Interfaccia astratta P2PTransport
├── transport.android.ts  # Implementazione Android (Nearby)
├── transport.ios.ts      # Implementazione iOS (Multipeer)
├── index.ts              # Export unificato con Platform.select
└── events.ts             # Event emitter per callbacks
```

#### Android Native Module (Kotlin)
```
android/app/src/main/java/com/pandemic/app/
├── p2p/
│   ├── NearbyConnectionsModule.kt      # Native module principale
│   ├── NearbyConnectionsPackage.kt     # React Native package
│   ├── PayloadCallback.kt              # Handler per payload ricevuti
│   └── ConnectionLifecycleCallback.kt  # Handler connessioni
└── MainApplication.kt                  # Aggiungere package
```

#### iOS Native Module (Swift)
```
ios/Pandemic/
├── P2P/
│   ├── MultipeerModule.swift           # Native module principale
│   ├── MultipeerModule.m               # Bridge Objective-C
│   ├── MultipeerSessionDelegate.swift  # MCSession delegate
│   └── MultipeerBrowserDelegate.swift  # MCNearbyServiceBrowser delegate
└── Pandemic-Bridging-Header.h          # Aggiornare
```

### PHASE 2 — Room Protocol

```
src/p2p/
├── protocol/
│   ├── types.ts          # MessageType enum, message interfaces
│   ├── codec.ts          # Encode/decode JSON messages
│   ├── roomHost.ts       # Host logic (index, broadcast)
│   └── roomGuest.ts      # Guest logic (request files, receive index)
```

### PHASE 3 — Storage & File Model

```
src/services/
├── FileStorageService.ts  # expo-file-system wrapper
├── MetadataStore.ts       # File metadata (MMKV o AsyncStorage)
└── ChecksumService.ts     # SHA-256 calculation
```

### PHASE 4 — File Transfer

Implementato nei moduli nativi + wrapper TypeScript.

### PHASE 5 — UI Updates

```
app/
├── index.tsx       # Home: Create/Join Room
├── host.tsx        # Host room management
├── room.tsx        # Room view (files, transfers)
├── library.tsx     # Local library + share toggle
└── join.tsx        # Discovery screen
```

### PHASE 6 — Cleanup

```
# File da RIMUOVERE o DEPRECARE:
src/services/BleService.ts              # Sostituito da P2P transport
src/services/NetworkService.ts          # Sostituito da P2P transport
src/services/native/BleAdvertisingNative.ts  # Non più necessario
android/.../BleAdvertisingModule.kt     # Non più necessario
android/.../BleAdvertisingPackage.kt    # Non più necessario
```

---

## 🔧 Dipendenze da Aggiungere

### Android (build.gradle)
```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-nearby:19.0.0'
}
```

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
```

### iOS (Info.plist)
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Pandemic uses Bluetooth to discover nearby devices</string>
<key>NSLocalNetworkUsageDescription</key>
<string>Pandemic uses local network to transfer audio files</string>
<key>NSBonjourServices</key>
<array>
    <string>_pandemic._tcp</string>
</array>
```

---

## 📋 Implementation Order

1. **PHASE 1.1**: Creare interfaccia TypeScript (`src/p2p/transport.ts`)
2. **PHASE 1.2**: Implementare modulo Android Nearby Connections
3. **PHASE 1.3**: Implementare modulo iOS MultipeerConnectivity
4. **PHASE 1.4**: Creare wrapper TypeScript platform-specific
5. **PHASE 2**: Implementare protocollo Room (messaggi JSON)
6. **PHASE 3**: Implementare storage file locali
7. **PHASE 4**: Implementare file transfer con progress
8. **PHASE 5**: Aggiornare UI
9. **PHASE 6**: Rimuovere codice legacy

---

## 🧪 Test Plan

### Android↔Android
- [ ] Create room, discover, join
- [ ] Exchange JSON messages (room state)
- [ ] Share file metadata
- [ ] Download file with progress
- [ ] Verify SHA-256 checksum

### iOS↔iOS
- [ ] Create room, discover, join
- [ ] Exchange JSON messages (room state)
- [ ] Share file metadata
- [ ] Download file with progress
- [ ] Verify SHA-256 checksum

### Edge Cases
- [ ] Host disconnects → guests notified
- [ ] Guest disconnects → host updates peer list
- [ ] Transfer interrupted → cleanup partial files
- [ ] Large file (>50MB) → progress updates smooth

---

## 🚧 Known Limitations (MVP)

1. **No cross-platform**: Android↔iOS non supportato
2. **Foreground only**: Background transfers non implementati per MVP
3. **Star topology**: Host è hub per coordinazione
4. **No resume**: Trasferimenti interrotti ripartono da zero

---

*Piano generato per PANDEMIC P2P Implementation*

