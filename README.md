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
│   ┌─────────────┐         BLE Discovery          ┌─────────────┐           │
│   │   DEVICE A  │◄──────────────────────────────►│   DEVICE B  │           │
│   │   (HOST)    │                                │   (GUEST)   │           │
│   └──────┬──────┘                                └──────┬──────┘           │
│          │                                              │                   │
│          │  ┌──────────────────────────────────────┐   │                   │
│          │  │         LOCAL WI-FI NETWORK          │   │                   │
│          │  │    (Venue Router / Mobile Hotspot)   │   │                   │
│          │  └──────────────────────────────────────┘   │                   │
│          │                    │                        │                   │
│          └────────────────────┼────────────────────────┘                   │
│                               │                                             │
│                    ┌──────────▼──────────┐                                 │
│                    │   HTTP/WebSocket    │                                 │
│                    │   Data Transfer     │                                 │
│                    └─────────────────────┘                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                          LAYER ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        UI LAYER (React Native)                       │  │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │  │
│   │  │   Home   │  │  Host    │  │  Guest   │  │  Transfer Progress   │ │  │
│   │  │  Screen  │  │  Mode    │  │  Mode    │  │       Screen         │ │  │
│   │  └──────────┘  └──────────┘  └──────────┘  └──────────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      SERVICE LAYER                                   │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │  │
│   │  │   Room      │  │   Peer      │  │  Transfer   │  │   Audio    │  │  │
│   │  │   Manager   │  │   Discovery │  │   Manager   │  │   Library  │  │  │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     TRANSPORT LAYER                                  │  │
│   │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │  │
│   │  │   BLE Service        │  │   LAN Service                      │   │  │
│   │  │   - Advertising      │  │   - HTTP Server                    │   │  │
│   │  │   - Scanning         │  │   - WebSocket Server               │   │  │
│   │  │   - GATT             │  │   - File Streaming                 │   │  │
│   │  └──────────────────────┘  └────────────────────────────────────┘   │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      STORAGE LAYER                                   │  │
│   │  ┌──────────────────────┐  ┌────────────────────────────────────┐   │  │
│   │  │   AsyncStorage/MMKV  │  │   FileSystem                       │   │  │
│   │  │   - Metadata Index   │  │   - Audio Files                    │   │  │
│   │  │   - Room State       │  │   - Cache                          │   │  │
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

### Come Host

1. Apri l'app
2. Tap "Crea Stanza"
3. Inserisci un nome per la stanza
4. Attendi che altri si connettano
5. Condividi file dalla tua libreria

### Come Guest

1. Apri l'app
2. Tap "Trova Stanze"
3. Seleziona una stanza dalla lista
4. Sfoglia i file disponibili
5. Scarica i file che ti interessano

---

## ⚠️ Limitazioni di Piattaforma

### iOS

- ⚠️ BLE funziona affidabilmente solo in foreground
- ⚠️ Trasferimenti background inaffidabili
- 💡 Mantieni l'app aperta durante i trasferimenti

### Android

- ✅ Più permissivo per BLE
- ✅ Throughput generalmente superiore
- ⚠️ Background comunque limitato

### Generale

- 📶 Wi-Fi LAN richiede stessa rete
- 🔋 Trasferimenti grandi consumano batteria
- 📱 Tieni lo schermo acceso durante i trasferimenti

---

## 📁 Struttura Progetto

```
pandemic/
├── app/                    # Schermate (expo-router)
│   ├── _layout.tsx        # Root layout
│   ├── index.tsx          # Home screen
│   ├── host.tsx           # Create room
│   ├── join.tsx           # Find rooms
│   ├── room.tsx           # Active room
│   ├── library.tsx        # Audio library
│   └── settings.tsx       # Settings
├── src/
│   ├── components/        # UI components
│   │   ├── Button.tsx
│   │   ├── FileCard.tsx
│   │   ├── RoomCard.tsx
│   │   ├── TransferItem.tsx
│   │   ├── EmptyState.tsx
│   │   └── Header.tsx
│   ├── services/          # Business logic
│   │   ├── BleService.ts
│   │   ├── NetworkService.ts
│   │   ├── RoomService.ts
│   │   └── AudioLibraryService.ts
│   ├── stores/            # Zustand stores
│   │   ├── appStore.ts
│   │   ├── roomStore.ts
│   │   └── transferStore.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   ├── utils/             # Utilities
│   │   ├── id.ts
│   │   └── format.ts
│   └── constants/         # Theme & constants
│       └── theme.ts
├── assets/                # Images, fonts
├── app.json              # Expo config
├── package.json
├── tsconfig.json
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

### MVP (v1.0)
- [x] Creazione stanze
- [x] Discovery BLE
- [x] Join room
- [x] Condivisione metadati
- [x] Trasferimento file (simulato)
- [x] Libreria audio locale

### v1.1
- [ ] Trasferimenti reali via HTTP
- [ ] WebSocket per real-time updates
- [ ] Compressione audio on-the-fly
- [ ] Notifiche push locali

### v2.0
- [ ] Server HTTP nativo
- [ ] Modalità BLE-only completa
- [ ] Playlist condivise
- [ ] Anteprima audio

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

