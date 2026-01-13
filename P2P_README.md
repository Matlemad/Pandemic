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
   - File is automatically saved to Library
   - Full file title is preserved (not truncated)

5. **Library Management**:
   - Access Library from Home or Room ("+ Add" button)
   - Import files from device storage
   - Reorder tracks manually
   - Play individual tracks or use playlist mode
   - All files persist across app restarts

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
- 📊 Connected peers count, file count, active transfers
- 🏠 Room setup (create/update room name, toggle lock)
- 🗑️ Close Room button (disconnects all peers, stops mDNS)
- 📤 Host Library (upload audio files to share as host)
- 👥 Connected peers list (device names, platforms, file counts)
- 🎵 Shared files list (with metadata)
- 📋 Real-time activity log
- Auto-refreshes every 2 seconds

**Room Management:**
- Create a room name to start accepting connections
- Toggle room lock to restrict file uploads to room creator only. The creator can always share files, even when joining their own room as a guest.
- Close room to stop mDNS and disconnect all peers
- Host files persist across restarts (saved to disk)

### Manual Connection (Fallback)

If mDNS discovery doesn't work (AP isolation, older devices):
1. Note the venue host IP from terminal (e.g., `ws://192.168.1.5:8787`)
2. In app: "Trova Stanze" → "📶 Connetti manualmente a Venue Host"
3. Enter IP and port

### File Synchronization

**How it works:**
- When you join a room, you immediately receive all existing files (host + peers)
- Files shared before you join are visible when you enter
- Host files persist across sessions (saved to disk)
- Peer files are session-based (removed when peer disconnects)
- When you leave and return, host files are still visible

**Download behavior:**
- Downloaded files are automatically saved to Library
- Full file titles are preserved (e.g., "8. La Zanzara" not "8")
- Files are saved to `<documentDirectory>/library/`
- Metadata (title, artist, duration) is extracted and stored

### Testing Cross-Platform

1. **Start Venue Host** on laptop connected to Wi-Fi:
   ```bash
   cd venue-host && npm run dev
   ```

2. **Create Room in Dashboard**:
   - Open http://localhost:8787
   - Enter a room name (e.g., "Party Mix 2024")
   - Click "Create Room"
   - Optionally upload host files via "Host Library"

3. **Connect Devices** to the same Wi-Fi network

4. **On Android Device**:
   - Open app → "Trova Stanze"
   - Look for "Venue Rooms (Wi-Fi)" section
   - Tap the venue room to join
   - You should immediately see:
     - All connected peers
     - Host files (if any uploaded)
     - Files shared by other peers
   - Share files from library (tap "+ Add" → Library → select files)

5. **On iOS Device**:
   - Open app → "Trova Stanze"
   - Same venue room should appear
   - Tap to join
   - Should see all files and peers immediately
   - Download files (they're saved to Library automatically)

6. **Verify**:
   - No internet required! Disconnect WAN, keep LAN.
   - Files shared before a peer joins are visible when they join
   - Files persist when leaving/returning (host files)
   - Downloaded files appear in Library with full titles

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
6. **Session-based files**: Peer files are removed when they disconnect (host files persist)

---

## 🔧 Recent Improvements (v1.1)

### File Synchronization Fixes
- **Immediate sync on join**: Files are now synchronized immediately when callbacks are set, even if `INDEX_FULL` arrived before the component mounted
- **Host files always visible**: Host files uploaded via dashboard are always included in the index
- **Peer files on join**: When a peer joins, they receive all existing files (host + other peers)

### Download Improvements
- **Full title preservation**: File titles are no longer truncated (uses `file.title` instead of extracting from `fileName`)
- **Automatic Library save**: Downloaded files are automatically added to Library with correct metadata
- **Chunked base64 conversion**: Large files are converted to base64 in chunks to avoid stack overflow

### Dashboard Enhancements
- **Close Room button**: Allows host to close the room, stop mDNS, and disconnect all peers
- **Host Library**: Upload audio files directly from dashboard to share as host
- **Persistent state**: Room name and host files are saved to disk and restored on restart

### Transport Improvements
- **Callback synchronization**: `setOnFilesUpdated()` and `setOnPeerJoined()` now immediately call callbacks with existing state
- **State cleanup**: Proper cleanup of `localFileUris` on disconnect

---

## 🐛 Debugging

### Venue Host Logs
```bash
cd venue-host && npm run dev
# Watch console output for connections, messages, errors
```

### Common Issues & Solutions

**Files not visible when joining:**
- Ensure callbacks are set in Room component (`setOnFilesUpdated`)
- Check venue host logs for `INDEX_FULL` messages
- Try refreshing the app (r r in Metro)

**File titles truncated:**
- Fixed in v1.1 - ensure you're using the latest code
- Check that `file.title` is being used instead of `fileName`

**Files disappear when leaving/returning:**
- This is expected: peer files are session-based
- Host files persist across sessions
- Re-join to see current files

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
