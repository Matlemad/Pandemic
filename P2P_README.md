# 🚀 Pandemic P2P - Implementation Guide

## Overview

Pandemic uses **native P2P transport** for offline file sharing:
- **Android**: Google Nearby Connections API
- **iOS**: Apple MultipeerConnectivity

### ⚠️ Cross-Platform Support

**Same-Platform P2P** (Android↔Android, iOS↔iOS):
- Direct peer-to-peer, no server required
- Uses native APIs (Nearby Connections / MultipeerConnectivity)

**Cross-Platform** (Android↔iOS):
- Requires **Venue Host** on local LAN (laptop/Raspberry Pi)
- Uses mDNS discovery + WebSocket relay
- See [Venue Mode](#-venue-mode-cross-platform) section below

---

## 📱 Building & Running

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- For Android: Android Studio, JDK 17
- For iOS: Xcode 15+, CocoaPods

### Build Android

```bash
# Clean and build
cd android && ./gradlew clean && cd ..
JAVA_HOME=$(/usr/libexec/java_home -v 17) npx expo run:android --device
```

### Build iOS

```bash
# Install pods and build
cd ios && pod install && cd ..
npx expo run:ios --device
```

---

## 🧪 Testing P2P

### Test Flow: Same-Platform (Android ↔ Android / iOS ↔ iOS)

1. **Device A (Host)**:
   - Open app
   - Tap "Crea Stanza" (Create Room)
   - Enter room name
   - Wait for advertising to start

2. **Device B (Guest)**:
   - Open app
   - Tap "Trova Stanze" (Find Rooms)
   - Wait for Device A's room to appear
   - Tap to join

3. **Share Files**:
   - Host or Guest: Go to Library
   - Select audio files to share
   - Toggle "Share" on each file

4. **Download Files**:
   - View shared files in Room screen
   - Tap download button
   - Observe progress

---

## 🌐 Venue Mode (Cross-Platform)

Venue Mode enables **Android↔iOS** file sharing via a local LAN host.

### How It Works

```
┌─────────────────┐     ┌─────────────────┐
│  Android App    │     │    iOS App      │
│  (VenueLan      │     │  (VenueLan      │
│   Transport)    │     │   Transport)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    WebSocket (LAN)    │
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │   Venue Host          │
         │   (Laptop/Raspberry)  │
         │                       │
         │  • mDNS Advertisement │
         │  • WebSocket Server   │
         │  • File Relay         │
         └───────────────────────┘
```

### Running the Venue Host

```bash
# Navigate to venue-host directory
cd venue-host

# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build && npm start
```

**Environment Configuration:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8787 | WebSocket server port |
| `ROOM_NAME` | Pandemic Venue | Room display name |
| `SERVICE_NAME` | Pandemic Venue Host | mDNS service name |
| `MAX_FILE_MB` | 50 | Maximum file size for relay |

### Web Dashboard

Open **http://localhost:8787** in your browser to view:
- 📊 Connected peers count
- 🎵 Shared files list (with metadata)
- 📋 Real-time activity log
- Auto-refreshes every 2 seconds

### Manual Connection (Fallback)

If mDNS discovery doesn't work (AP isolation, older devices):
1. Note the venue host IP from terminal (e.g., `ws://192.168.1.5:8787`)
2. In app: "Trova Stanze" → "📶 Connetti manualmente a Venue Host"
3. Enter IP and port

### Testing Cross-Platform

1. **Start Venue Host** on laptop connected to Wi-Fi:
   ```bash
   cd venue-host && npm run dev
   ```

2. **Connect Devices** to the same Wi-Fi network

3. **On Android Device**:
   - Open app → "Trova Stanze"
   - Look for "Venue Rooms (Wi-Fi)" section
   - Tap the venue room to join
   - Share files from library

4. **On iOS Device**:
   - Open app → "Trova Stanze"
   - Same venue room should appear
   - Tap to join
   - Download files from Android user

5. **Verify**: No internet required! Disconnect WAN, keep LAN.

### mDNS Service Discovery

The venue host advertises itself via mDNS:
- **Service Type**: `_audiowallet._tcp`
- **TXT Records**: `v=1`, `room=<name>`, `relay=1`

The app discovers this service automatically when on the same network.

---

## 🔧 Architecture

```
src/p2p/
├── types.ts               # P2P transport types
├── events.ts              # Event emitter
├── transport.base.ts      # Abstract transport interface (base class)
├── transport.android.ts   # Android Nearby Connections wrapper
├── transport.ios.ts       # iOS MultipeerConnectivity wrapper
├── index.ts               # Platform selection & singleton
└── protocol/
    ├── types.ts           # Room message types
    ├── codec.ts           # JSON encode/decode
    └── roomService.ts     # High-level room management

src/venue/
├── types.ts              # Venue types
├── discovery.ts          # mDNS discovery wrapper
├── transport.ts          # VenueLan WebSocket transport
├── relay.ts              # File relay over WebSocket
└── index.ts              # Exports

venue-host/
├── src/
│   ├── types.ts          # Message types & schemas
│   ├── room-manager.ts   # Room & peer management
│   ├── ws-handler.ts     # WebSocket message handling
│   └── index.ts          # Server entry point
├── package.json
└── README.md
```

### Native Modules

**Android** (`android/app/src/main/java/com/pandemic/app/`):
- `p2p/NearbyConnectionsModule.kt` - Google Nearby Connections
- `venue/VenueDiscoveryModule.kt` - NSD/mDNS discovery

**iOS** (`ios/Pandemic/`):
- `P2P/MultipeerModule.swift` - MultipeerConnectivity
- `VenueDiscovery/VenueDiscoveryModule.swift` - Bonjour/mDNS

---

## 📋 Room Protocol

### Same-Platform P2P Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `HELLO` | Guest → Host | Announce joining |
| `ROOM_INFO` | Host → Guest | Room details |
| `PEER_JOINED` | Host → All | New peer notification |
| `PEER_LEFT` | Host → All | Peer left notification |
| `INDEX_FULL` | Host → Guest | Complete file list |
| `INDEX_UPSERT` | Any → Host → All | Files added/updated |
| `INDEX_REMOVE` | Any → Host → All | Files removed |
| `FILE_REQUEST` | Guest → Host | Request to download |
| `FILE_ACCEPT` | Owner → Requester | Accept + start transfer |

### Venue Mode Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `HELLO` | Client → Host | Register with peer info |
| `WELCOME` | Host → Client | Host capabilities |
| `JOIN_ROOM` | Client → Host | Join the venue room |
| `ROOM_INFO` | Host → Client | Room details |
| `SHARE_FILES` | Client → Host | Publish file metadata |
| `INDEX_FULL` | Host → Client | All shared files |
| `REQUEST_FILE` | Client → Host | Request file download |
| `RELAY_PULL` | Client → Host | Start relay download |
| `RELAY_PUSH_META` | Owner → Host | File metadata for relay |
| `TRANSFER_PROGRESS` | Host → Client | Transfer status |
| `TRANSFER_COMPLETE` | Host → Client | Transfer finished |

### Binary Frames (Relay)

File chunks are sent as binary WebSocket frames:
```
[transferIdLen (4 bytes BE)][transferId (UTF-8)][chunk data]
```

---

## 📝 Permissions

### Android (AndroidManifest.xml)

```xml
<!-- P2P -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />

<!-- Network (for Venue Mode) -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
```

### iOS (Info.plist)

```xml
<!-- P2P -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Per trovare dispositivi nelle vicinanze</string>

<!-- Local Network (required for Venue Mode) -->
<key>NSLocalNetworkUsageDescription</key>
<string>Per connettersi ai venue host sulla rete locale</string>

<!-- Bonjour Services -->
<key>NSBonjourServices</key>
<array>
  <string>_pandemic._tcp</string>
  <string>_pandemic._udp</string>
  <string>_audiowallet._tcp</string>
</array>
```

---

## ⚠️ Known Limitations

1. **Cross-platform requires Venue Host**: Android↔iOS only works with LAN host
2. **Foreground only**: Background transfers not implemented
3. **Star topology**: Host coordinates all communication
4. **No transfer resume**: Interrupted transfers restart from zero
5. **AP Isolation**: Some networks block device-to-device; relay should work

---

## 🐛 Debugging

### Venue Host Logs
```bash
cd venue-host && npm run dev
# Watch console output for connections, messages, errors
```

### Android Logs
```bash
adb logcat | grep -E "(VenueDiscovery|NearbyConnections|P2P)"
```

### iOS Logs
Use Xcode Console, filter for `VenueDiscovery`, `MultipeerModule`, or `P2P`

### React Native Logs
```bash
npx react-native log-android
npx react-native log-ios
```

---

## 🔄 Transport Selection

The app automatically selects the appropriate transport:

```typescript
// src/p2p/index.ts + src/venue/index.ts

// Same-platform: Use native P2P
if (Platform.OS === 'android') {
  transport = nearbyConnectionsTransport;
} else if (Platform.OS === 'ios') {
  transport = multipeerTransport;
}

// Cross-platform: Use Venue LAN
if (userSelectsVenueRoom) {
  transport = venueLanTransport;
}
```

---

## 📂 File Structure

### P2P Layer

```
src/p2p/
├── types.ts               # P2P transport types
├── events.ts              # Event emitter
├── transport.base.ts      # Abstract interface & base class
├── transport.android.ts   # Android Nearby Connections
├── transport.ios.ts       # iOS MultipeerConnectivity
├── index.ts               # Platform selection
└── protocol/
    ├── types.ts           # Room message types
    ├── codec.ts           # JSON encode/decode
    ├── roomService.ts     # High-level room management
    └── index.ts           # Exports
```

### Venue Layer

```
src/venue/
├── types.ts              # Venue types
├── discovery.ts          # mDNS discovery
├── transport.ts          # WebSocket transport
├── relay.ts              # File relay
└── index.ts              # Exports

venue-host/
├── src/
│   ├── types.ts          # Zod schemas
│   ├── room-manager.ts   # State management
│   ├── ws-handler.ts     # Protocol handling
│   └── index.ts          # Entry point
└── package.json
```

### Native Modules

```
android/app/src/main/java/com/pandemic/app/
├── p2p/
│   ├── NearbyConnectionsModule.kt
│   └── NearbyConnectionsPackage.kt
└── venue/
    ├── VenueDiscoveryModule.kt
    └── VenueDiscoveryPackage.kt

ios/Pandemic/
├── P2P/
│   ├── MultipeerModule.swift
│   └── MultipeerModule.m
└── VenueDiscovery/
    ├── VenueDiscoveryModule.swift
    └── VenueDiscoveryModule.m
```

---

*P2P + Venue Cross-Platform Implementation for Pandemic v1.0*
