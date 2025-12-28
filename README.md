# 🦠 PANDEMIC

**Condivisione audio locale offline-first tra dispositivi mobili**

Pandemic è un'applicazione mobile che permette la condivisione di file audio direttamente tra dispositivi nella stessa area fisica, **senza connessione Internet**, **senza server centrali** e **senza blockchain**.

---

## 📋 Indice

- [Panoramica](#panoramica)
- [Architettura](#architettura)
- [Stack Tecnologico](#stack-tecnologico)
- [Modello di Connettività](#modello-di-connettività)
- [Protocollo MVP](#protocollo-mvp)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)
- [Limitazioni di Piattaforma](#limitazioni-di-piattaforma)

---

## 🎯 Panoramica

### Idea Core

Gli utenti fisicamente vicini (stesso locale, evento, festival) possono:
- **Scoprire** altri dispositivi nelle vicinanze
- **Sfogliare** i metadati audio condivisi
- **Scaricare** file audio compressi direttamente device-to-device

### Mental Model

Questo sistema si comporta come:
- 📀 Un tavolo di scambio digitale
- 📻 Una radio da locale
- 📄 Volantini digitali che camminano con le persone

**NON** come:
- ❌ Un servizio cloud
- ❌ Una piattaforma streaming
- ❌ Una rete P2P torrent

---

## 🏗️ Architettura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PANDEMIC - ARCHITETTURA                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    BLE Discovery + GATT     ┌─────────────┐              │
│   │   DEVICE A  │◄───────────────────────────►│   DEVICE B  │              │
│   │   (HOST)    │  (Room info + Hotspot creds)│   (GUEST)   │              │
│   └──────┬──────┘                             └──────┬──────┘              │
│          │                                           │                      │
│          │  ┌──────────────────────────────────────┐ │                      │
│          │  │         LOCAL WI-FI NETWORK          │ │                      │
│          │  │  (Venue Router / Phone Hotspot 📱)   │ │                      │
│          │  └──────────────────────────────────────┘ │                      │
│          │                    │                      │                      │
│          └────────────────────┼──────────────────────┘                      │
│                               │                                             │
│                    ┌──────────▼──────────┐                                 │
│                    │   WebSocket/HTTP    │                                 │
│                    │   Data Transfer     │                                 │
│                    └─────────────────────┘                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          LAYER ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        UI LAYER (React Native)                       │  │
│   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────────┐ │  │
│   │  │  Home  │ │ Host   │ │ LAN    │ │  Guest   │ │    Library       │ │  │
│   │  │ Screen │ │ Mode   │ │ Host📱 │ │  Mode    │ │    + Player      │ │  │
│   │  └────────┘ └────────┘ └────────┘ └──────────┘ └──────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      SERVICE LAYER                                   │  │
│   │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────────┐ │  │
│   │  │   Room    │  │   Peer    │  │ Transfer  │  │   Audio Library   │ │  │
│   │  │   Manager │  │  Discovery│  │   Manager │  │   + Playback      │ │  │
│   │  └───────────┘  └───────────┘  └───────────┘  └───────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     TRANSPORT LAYER                                  │  │
│   │  ┌───────────────────┐  ┌──────────────────┐ ┌────────────────────┐ │  │
│   │  │   BLE Service     │  │   LAN Service    │ │ Phone Host Server │ │  │
│   │  │   - Advertising   │  │   - mDNS         │ │ - WebSocket (8787)│ │  │
│   │  │   - Scanning      │  │   - Venue client │ │ - File Relay      │ │  │
│   │  │   - GATT Server   │  │   - File relay   │ │ - GATT credentials│ │  │
│   │  └───────────────────┘  └──────────────────┘ └────────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      STORAGE LAYER                                   │  │
│   │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │  │
│   │  │   AsyncStorage       │  │   FileSystem                       │   │  │
│   │  │   - Metadata Index   │  │   - Audio Files                    │   │  │
│   │  │   - Room State       │  │   - Library folder                 │   │  │
│   │  └──────────────────────┘  └────────────────────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Stack Tecnologico

| Layer | Tecnologia | Scopo |
|-------|------------|-------|
| **Framework** | React Native + Expo | Cross-platform mobile |
| **Linguaggio** | TypeScript | Type safety |
| **Navigazione** | expo-router | File-based routing |
| **State** | Zustand | Gestione stato globale |
| **BLE** | react-native-ble-plx | Bluetooth Low Energy |
| **Network** | expo-network | Stato rete e IP |
| **Storage** | expo-file-system | File audio locali |
| **Storage** | AsyncStorage | Metadati e impostazioni |

---

## 📡 Modello di Connettività

### Decisione Architetturale

Adottiamo un **MODELLO DUAL-STACK DI NETWORKING LOCALE**:

1. **Bluetooth (BLE)** = discovery + coordinazione
2. **Wi-Fi LAN** = trasferimento dati
3. **Room host** = index + coordinatore, NON storage

### Matrice Decisionale

| Aspetto | BLE | Wi-Fi LAN | Decisione |
|---------|-----|-----------|-----------|
| **Discovery** | ✅ Eccellente | ❌ Richiede rete | **BLE** |
| **Throughput** | ❌ 50-200 KB/s | ✅ 10-100+ Mbps | **Wi-Fi** |
| **Range** | ~10-30m | ~50-100m | Comparabile |
| **Battery** | ✅ Basso | ⚠️ Moderato | BLE per idle |
| **Background iOS** | ❌ Limitato | ⚠️ Limitato | Foreground |
| **Setup** | ✅ Zero config | ⚠️ Richiede rete | BLE più semplice |
| **File grandi** | ❌ Impraticabile | ✅ Ottimale | **Wi-Fi** |
| **Fallback** | ✅ Sempre | ❌ Dipende | BLE come backup |

### Cosa NON Usiamo

- ❌ **WebRTC** (richiede IP networking, non funziona su BLE)
- ❌ **TURN / STUN** (server esterni)
- ❌ **Mesh relaying** (troppo complesso, consuma batteria)
- ❌ **GPS enforcement** (privacy, batteria)

---

## 🔄 Protocollo MVP

### Flusso Completo

```
FASE 1: CREAZIONE ROOM (HOST)
═══════════════════════════════════════════════════════════════════════════════
    HOST                                          
    1. User taps "Create Room"                    
    2. Generate: roomId (UUID), sessionToken, ephemeralHostId
    3. Get local IP address (if Wi-Fi available) 
    4. Start BLE advertising: roomId, roomName, hostAddress
    5. Start HTTP/WebSocket server on port 8080   
    6. Initialize room state: peers: [], sharedFiles: []

FASE 2: DISCOVERY (GUEST)
═══════════════════════════════════════════════════════════════════════════════
    GUEST                                         
    1. User taps "Join Room"                      
    2. Start BLE scanning                         
    3. Discover nearby rooms (sorted by RSSI)
    4. Display list to user
    5. User selects room                          

FASE 3: JOIN ROOM (HANDSHAKE)
═══════════════════════════════════════════════════════════════════════════════
    GUEST                              HOST
    1. Connect via BLE GATT ──────────► 
                                        2. Accept connection
    3. Request join: { peerId, peerName } ────────► 
                                        4. Generate session token
                            ◄────────── 5. Response: { sessionToken, hostAddress }
    6. Disconnect BLE                   
    7. Connect HTTP/WS to hostAddress ─►
                                        8. Validate token
                                        9. Add to peers list
                            ◄────────── 10. Broadcast: PEER_JOINED

FASE 4: METADATA SYNC
═══════════════════════════════════════════════════════════════════════════════
    GUEST                              HOST
    1. Publish shared files ───────────────────────► 
                                        2. Aggregate to room index
                            ◄────────── 3. Broadcast: INDEX_UPDATED

FASE 5: FILE TRANSFER (P2P over LAN)
═══════════════════════════════════════════════════════════════════════════════
    GUEST A (requester)        HOST              GUEST B (owner)
    1. Request file: { fileId, ownerId } ───►
                               2. Lookup owner address
                               3. Response: { ownerAddress }
                            ◄── 
    4. Direct HTTP GET ─────────────────────────► 
                                                  5. Stream file
                            ◄─────────────────────   (chunked)
    6. Save to local storage   
    7. Notify HOST: TRANSFER_COMPLETE ───────────►
```

### Modalità Bluetooth-Only (Fallback)

Per scenari senza Wi-Fi (campeggio, aree remote, disastri):

- **Transport**: BLE GATT
- **MTU**: ~185–512 bytes
- **Throughput**: ~50–200 KB/s (best case)
- **Dimensione file consigliata**: ≤ 1–3 MB
- **UI avvisa**: "Modalità Bluetooth — trasferimenti lenti"

---

## 🚀 Installazione

### Prerequisiti

- Node.js >= 20.x
- npm o yarn
- Expo CLI
- Xcode (per iOS)
- Android Studio (per Android)

### Setup

```bash
# Clona il repository
git clone https://github.com/yourusername/pandemic.git
cd pandemic

# Installa dipendenze
npm install

# Avvia in development
npm start

# Avvia su iOS
npm run ios

# Avvia su Android  
npm run android
```

### Build per Device Fisico

Per testare BLE e networking locale, è necessario un build nativo:

```bash
# Prebuild (genera progetti nativi)
npx expo prebuild

# Build iOS
npx expo run:ios --device

# Build Android
npx expo run:android --device
```

---

## 📱 Utilizzo

### Same-Platform P2P (Android↔Android, iOS↔iOS)

**Come Host:**
1. Apri l'app
2. Tap "Crea Stanza"
3. Inserisci un nome per la stanza
4. Attendi che altri si connettano
5. Condividi file dalla tua libreria

**Come Guest:**
1. Apri l'app
2. Tap "Trova Stanze"
3. Cerca in "Stanze Vicine (P2P)"
4. Seleziona una stanza dalla lista
5. Sfoglia i file disponibili
6. Scarica i file che ti interessano

### Cross-Platform (Android↔iOS) - Venue Mode 🌐

Per condividere file tra Android e iOS serve un **Venue Host** locale (laptop/Raspberry Pi) sulla stessa rete Wi-Fi.

**1. Avvia il Venue Host:**
```bash
cd venue-host
npm install
npm run dev
```

**2. Monitora la Dashboard:**
Apri http://localhost:8787 per:
- Creare/gestire la room (nome, lock, close)
- Caricare file audio come host (Host Library)
- Monitorare peers e file in tempo reale
- Vedere trasferimenti attivi

**3. Sui device mobili:**
1. Connettiti alla stessa rete Wi-Fi del Venue Host
2. Apri l'app → "Trova Stanze"
3. Cerca in "Venue Rooms (Wi-Fi Cross-Platform)"
4. Tocca la room del venue host per entrare
5. Vedi immediatamente:
   - Tutti i peer connessi
   - File host (se caricati nella dashboard)
   - File condivisi da altri peer
6. Per condividere: "+ Add" → Library → Seleziona file → "Condividi"
7. Per scaricare: Tocca il pulsante download → File salvato in Library automaticamente

**Fallback connessione manuale:**
Se mDNS non funziona (reti con AP isolation, Android 11):
- Tocca "📶 Connetti manualmente a Venue Host"
- Inserisci IP del laptop (es. `192.168.1.5`) e porta (`8787`)

📖 Dettagli completi in [P2P_README.md](./P2P_README.md)

### Cross-Platform (Android↔iOS) - Phone Host Mode 📱

**Alternativa senza laptop!** Un telefono può fare da host usando la stessa rete Wi-Fi o il proprio **hotspot**.

**Scenario 1: Stessa rete Wi-Fi**
1. Host apre l'app → "Crea LAN Room (Wi-Fi/Hotspot)"
2. Inserisce nome stanza → "Avvia Stanza"
3. Guests sullo stesso Wi-Fi vedono automaticamente la stanza in "Trova Stanze"
4. Tap sulla stanza → connessione diretta

**Scenario 2: Hotspot dell'Host (nessun Wi-Fi disponibile)** 🔥
1. Host attiva l'hotspot del telefono (nelle impostazioni di sistema)
2. Host apre l'app → "Crea LAN Room"
3. Abilita **"Modalità Hotspot"** e inserisce:
   - Nome rete (SSID) dell'hotspot
   - Password dell'hotspot
4. "Avvia Stanza" → BLE + mDNS + WebSocket server partono

**Per i Guests:**
1. Apri l'app → "Trova Stanze"
2. Vedi la stanza con badge 📡 e 🔥 Hotspot (trovata via BLE)
3. Tap sulla stanza → appare modal con credenziali hotspot
4. Premi **"Apri Impostazioni Wi-Fi"** → si aprono le impostazioni
5. Connettiti all'hotspot dell'host
6. Torna nell'app → premi **"Sono Connesso"**
7. Ora sei nella stanza!

**Come funziona sotto il cofano:**
- L'host pubblica le credenziali dell'hotspot via **BLE GATT** (caratteristica leggibile)
- I guests trovano l'host via BLE scanning
- Toccando la stanza, il guest si connette via GATT e legge SSID + password
- Dopo la connessione all'hotspot, il guest si collega al WebSocket server dell'host

**Limitazioni:**
- iOS/Android non permettono la connessione automatica all'hotspot (serve intervento manuale)
- L'hotspot deve essere attivato manualmente dall'host

### Audio Library 🎵

La **Libreria Audio** è il punto centrale per gestire i tuoi file audio:

**Funzionalità:**
- **Import da dispositivo**: Importa file audio dalla memoria locale del device
- **Download automatico**: I file scaricati dalle room vengono salvati automaticamente
- **Riordinamento**: Riordina i brani manualmente (frecce ▲/▼)
- **Playback singolo**: Tocca un brano per riprodurlo
- **Playlist sequenziale**: Usa il player globale in basso per riprodurre in ordine
- **Persistenza**: Tutti i file e l'ordine vengono salvati tra riavvii

**Accesso:**
- Dalla Home: Tocca "La tua Libreria"
- Dalla Room: Tocca "+ Add" → si apre la Library (non il file picker del sistema)
- I file condivisi vengono selezionati dalla Library

**Player globale:**
- Barra player fissa in basso con controlli Play/Pause, Next, Previous
- Auto-avanzamento: quando un brano finisce, parte il successivo
- Progress bar e informazioni brano corrente

---

## ⚠️ Limitazioni di Piattaforma

### iOS

- ⚠️ BLE funziona affidabilmente solo in foreground
- ⚠️ Trasferimenti background inaffidabili
- ❌ **Connessione automatica a hotspot impossibile** - Apple blocca la connessione programmatica a reti Wi-Fi
- 💡 Mantieni l'app aperta durante i trasferimenti

### Android

- ✅ Più permissivo per BLE
- ✅ Throughput generalmente superiore
- ⚠️ Background comunque limitato
- ⚠️ **Hotspot richiede conferma utente** - `WifiNetworkSuggestion` mostra sempre una notifica
- ⚠️ Android 12+ richiede permessi BLE runtime (`BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT`)

### Generale

- 📶 Wi-Fi LAN richiede stessa rete
- 🔋 Trasferimenti grandi consumano batteria
- 📱 Tieni lo schermo acceso durante i trasferimenti
- 🔥 **Hotspot mode**: la connessione all'hotspot richiede sempre intervento manuale dell'utente

---

## 📁 Struttura Progetto

```
pandemic/
├── app/                    # Schermate (expo-router)
│   ├── _layout.tsx        # Root layout
│   ├── index.tsx          # Home screen
│   ├── host.tsx           # Create room (P2P same-platform)
│   ├── join.tsx           # Find rooms (P2P + Venue + LAN Host)
│   ├── room.tsx           # Active room
│   ├── lan-host.tsx       # 📱 Phone Host Mode (crea LAN room da telefono)
│   ├── library.tsx        # Audio library (import, playback, reorder)
│   └── settings.tsx       # Settings
├── src/
│   ├── components/        # UI components
│   ├── services/          # Business logic
│   │   ├── AudioLibraryService.ts  # Library management
│   │   ├── AudioPlaybackService.ts # Playback control
│   │   ├── BleService.ts           # BLE scanning + GATT read
│   │   ├── P2PRoomServiceAdapter.ts # P2P/Venue adapter
│   │   └── native/
│   │       └── BleAdvertisingNative.ts # BLE advertising wrapper
│   ├── stores/            # Zustand stores
│   │   └── libraryStore.ts # Audio library state
│   ├── p2p/               # Native P2P transport (Nearby/Multipeer)
│   │   ├── transport.base.ts   # Abstract interface
│   │   ├── transport.android.ts
│   │   ├── transport.ios.ts
│   │   └── protocol/      # Room protocol
│   ├── venue/             # Venue LAN cross-platform
│   │   ├── types.ts       # Venue types
│   │   ├── discovery.ts   # mDNS discovery + advertisement
│   │   ├── transport.ts   # WebSocket transport
│   │   └── relay.ts       # File relay
│   ├── lanHost/           # 📱 Phone Host Mode
│   │   ├── types.ts       # LAN host types
│   │   ├── hostState.ts   # In-memory room state
│   │   ├── PhoneHostServer.ts # Native WS server wrapper
│   │   ├── wsHandler.ts   # WebSocket message handler
│   │   └── index.ts       # Exports
│   ├── types/             # TypeScript types
│   ├── utils/             # Utilities
│   └── constants/         # Theme & constants
├── venue-host/            # 🌐 Local LAN host (Node.js)
│   ├── src/
│   │   ├── index.ts       # Entry + HTTP server
│   │   ├── types.ts       # Zod schemas
│   │   ├── room-manager.ts # Room & peer state
│   │   ├── ws-handler.ts   # WebSocket protocol
│   │   ├── host-state.ts   # Persistent state (room, files)
│   │   ├── dashboard.ts    # Web dashboard HTML
│   │   └── admin-api.ts   # REST API for dashboard
│   ├── package.json
│   └── README.md
├── ios/                   # Native iOS modules
│   └── Pandemic/
│       ├── LanHost/       # WebSocket server (Network.framework)
│       ├── VenueDiscovery/ # mDNS (NetService)
│       ├── BleAdvertising/ # BLE GATT server (CoreBluetooth)
│       └── P2P/           # MultipeerConnectivity
├── android/               # Native Android modules
│   └── app/src/main/java/com/pandemic/app/
│       ├── lanhost/       # WebSocket server (Java-WebSocket)
│       ├── venue/         # mDNS (NsdManager)
│       ├── BleAdvertisingModule.kt # BLE GATT server
│       └── nearby/        # Nearby Connections
├── assets/                # Images, fonts
├── app.json              # Expo config
├── package.json
├── tsconfig.json
├── P2P_README.md         # 📖 P2P + Venue documentation
└── README.md
```

---

## 🎨 Design System

### Palette Colori

```
Background:     #0A0A0B  (nero profondo)
Surface:        #141416  (grigio scuro)
Primary:        #FF2D6A  (magenta neon)
Secondary:      #00F5D4  (cyan elettrico)
Accent:         #FFB800  (ambra caldo)
Text Primary:   #FFFFFF
Text Secondary: #A0A0A5
```

### Estetica

L'interfaccia è ispirata all'atmosfera di un warehouse party:
- 🌑 Tema scuro dominante
- 💡 Accenti neon vibranti
- 🏭 Stile industriale/underground
- ✨ Effetti glow sottili

---

## 🔮 Roadmap

### MVP (v1.0) ✅
- [x] Creazione stanze P2P
- [x] Discovery (Nearby Connections / MultipeerConnectivity)
- [x] Join room
- [x] Condivisione metadati
- [x] Libreria audio locale

### v1.1 - Cross-Platform ✅
- [x] Venue Host (Node.js) per Android↔iOS
- [x] mDNS discovery (Bonjour / NSD)
- [x] WebSocket transport + file relay
- [x] Dashboard web per monitoring
- [x] Connessione manuale fallback
- [x] Host Library (upload file dalla dashboard)
- [x] Room management (create, lock, close)
- [x] Sincronizzazione file migliorata (file visibili anche se caricati prima dell'ingresso)
- [x] Audio Library con playback e riordinamento
- [x] Download automatico in Library con titoli completi

### v1.2 - Phone Host Mode ✅
- [x] **Phone Host Mode**: un telefono può fare da host (senza laptop)
- [x] WebSocket server nativo in-app (Android: Java-WebSocket, iOS: Network.framework)
- [x] mDNS advertisement da telefono
- [x] **BLE GATT per hotspot credentials**: scambio SSID/password via Bluetooth
- [x] UI per modalità hotspot (inserimento credenziali)
- [x] Modal con credenziali + bottone "Apri Impostazioni Wi-Fi"
- [x] Badge 📡/🔥 per stanze BLE/Hotspot
- [x] Gestione robusta del server WebSocket (SO_REUSEADDR, stop asincrono)
- [ ] Resume trasferimenti interrotti
- [ ] Notifiche push locali

### v2.0
- [ ] Modalità BLE-only completa (transfer via GATT)
- [ ] Playlist condivise
- [ ] Anteprima audio streaming
- [ ] Compressione audio on-the-fly

---

## 👨‍💻 Guida per sviluppatori

### Prerequisiti ambiente

- **Node.js**: consigliato >= 20.x  
- **Java**: **Java 17** (Temurin/OpenJDK) per Android/Gradle  
- **Android Studio** (SDK + Platform Tools installati)  
- **Xcode** (per build iOS)  

Per configurare velocemente Java 17 sul Mac:

```bash
brew install --cask temurin@17

# Aggiungi a ~/.zshrc
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
export PATH=$JAVA_HOME/bin:$PATH
```

Per configurare l'SDK Android:

```bash
# In ~/.zshrc
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools

# In android/local.properties
sdk.dir=/Users/<USERNAME>/Library/Android/sdk
```

### Flussi di sviluppo

- **Solo UI / sviluppo rapido** (Expo Go):
  - `npm start` e scansione QR da Expo Go
  - BLE e permessi nativi hanno limitazioni, ma l'UI funziona

- **Dev build Android** (consigliato per BLE + permessi completi):
  - `npx expo prebuild`
  - `JAVA_HOME=$(/usr/libexec/java_home -v 17) npx expo run:android --device`

- **Dev build iOS**:
  - `npx expo prebuild`
  - `npx expo run:ios --device`

### Documentazione interna

- **Architettura dettagliata**: `ARCHITECTURE.md`
- **Testing e scenari QA**: `TESTING.md`
- **Setup ambiente & troubleshooting**: `SETUP_GUIDE.md`, `RESET_COMPLETE.md`, `FIX_PERMISSIONS.md`, `FIX_ERROR.md`
- **Deep linking e routing**: `DEEP_LINKING.md`

Questi file sono pensati per nuovi sviluppatori che entrano nel progetto e vogliono una panoramica completa di architettura, protocolli e setup ambiente.

---

## 📄 Licenza

MIT License

---

## 👥 Contributori

Made with ❤️ for offline-first, local-first communities.

---

**🦠 PANDEMIC - Offline-first. Locale. Peer-to-peer.**

