# 🦠 Pandemic - Release Notes

## 📦 Contenuto Release

Questa release include:
- **📱 App Android** (APK firmato installabile)
- **🍎 App iOS** (TestFlight via App Store Connect)
- **🖥️ Venue Host** (Eseguibili standalone per Mac/Windows/Linux)

---

## 📱 Android App

### Installazione

1. Scarica `Pandemic-android-release.apk` (APK firmato)
2. Sul tuo Android:
   - Vai su **Impostazioni → Sicurezza**
   - Abilita **"Origini sconosciute"** o **"Installa app sconosciute"**
   - Apri il file APK scaricato
   - Segui le istruzioni di installazione

### Requisiti

- Android 10+ (API 29+)
- Bluetooth attivo
- Permessi: Posizione (per BLE), Storage (per file audio)

### Funzionalità

- ✅ **Phone Host Mode**: Crea stanze LAN direttamente dal telefono
- ✅ **Hotspot Mode**: Condividi credenziali Wi-Fi via BLE GATT
- ✅ **Venue Discovery**: Trova stanze create da laptop/desktop
- ✅ **BLE Discovery**: Trova stanze create da altri telefoni
- ✅ **File Sharing**: Condividi e scarica file audio in tempo reale
- ✅ **Audio Library**: Playback e gestione file locali

### Note

- **Android 10-11**: La discovery automatica può essere intermittente. Usa **"Connessione Manuale"** o **Hotspot Mode** come workaround.
- Vedi [ANDROID_DISCOVERY_ISSUES.md](./ANDROID_DISCOVERY_ISSUES.md) per dettagli tecnici.

---

## 🍎 iOS App (TestFlight)

### Installazione

1. Il tester riceve un invito email da TestFlight
2. Installa l'app **TestFlight** da App Store
3. Apri il link dall'email → l'app si installa automaticamente

### Requisiti

- iPhone con iOS 15+
- Account Apple (per TestFlight)

### Funzionalità

- ✅ **Phone Host Mode**: Crea stanze LAN (WebSocket server via Network.framework)
- ✅ **Bonjour Discovery**: Trova stanze automaticamente sulla rete locale
- ✅ **BLE Discovery**: Trova stanze via Bluetooth (CoreBluetooth)
- ✅ **File Sharing**: Condividi e scarica file audio
- ✅ **Audio Library**: Playback e gestione file locali
- ✅ **QR Code**: Scansiona QR per join diretto
- ✅ **Content Disclaimer**: Conferma diritti al primo avvio

---

## 🖥️ Venue Host (Dashboard Web)

### Download

Scegli l'eseguibile per la tua piattaforma:

| Piattaforma | File | Dimensione |
|-------------|------|------------|
| **macOS (Apple Silicon)** | `pandemic-venue-host-macos-arm64` | ~45MB |
| **macOS (Intel)** | `pandemic-venue-host-macos-x64` | ~50MB |
| **Windows** | `pandemic-venue-host-win-x64.exe` | ~36MB |
| **Linux** | `pandemic-venue-host-linux-x64` | ~44MB |

### Installazione

**Nessuna installazione richiesta!** L'eseguibile è standalone (non richiede Node.js).

#### macOS
1. Scarica il file appropriato
2. Doppio click per avviare
3. Se vedi un warning di sicurezza:
   - Vai su **Preferenze di Sistema → Sicurezza e Privacy**
   - Clicca **"Apri comunque"** accanto al messaggio

#### Windows
1. Scarica `pandemic-venue-host-win-x64.exe`
2. Doppio click per avviare
3. Windows Defender potrebbe chiedere conferma → clicca **"Esegui comunque"**

#### Linux
```bash
chmod +x pandemic-venue-host-linux-x64
./pandemic-venue-host-linux-x64
```

### Come Usare

1. **Avvia** l'eseguibile
2. Si apre automaticamente il browser su **http://localhost:8787**
3. **Crea una room** nella dashboard:
   - Inserisci un nome per la room
   - (Opzionale) Carica file audio da condividere come host
   - Clicca **"Create Room"**
4. I telefoni sulla stessa rete Wi-Fi vedranno automaticamente la room

### Dashboard Features

- 📊 **Stats real-time**: Peers connessi, file condivisi, trasferimenti attivi
- 🏠 **Room Management**: Crea/modifica room, toggle lock
- 📤 **Host Library**: Upload file audio direttamente dal browser
- 📱 **Connected Peers**: Lista dei dispositivi connessi
- 📋 **Activity Log**: Log delle attività in tempo reale

### Requisiti

- **Nessun requisito software** (eseguibile standalone)
- **Rete**: Tutti i dispositivi devono essere sulla stessa rete Wi-Fi
- **Porta**: 8787 (assicurati che non sia bloccata dal firewall)

---

## 🚀 Quick Start

### Scenario 1: Solo Telefoni (Phone Host Mode)

1. **Device A** (Host):
   - Apri l'app → "Crea LAN Room"
   - Avvia la stanza

2. **Device B** (Guest):
   - Apri l'app → "Trova Stanze"
   - Vedi la stanza di Device A
   - Tap per entrare

### Scenario 2: Laptop + Telefoni (Venue Mode)

1. **Laptop**:
   - Avvia `pandemic-venue-host-*`
   - Dashboard si apre automaticamente
   - Crea una room nella dashboard

2. **Telefoni**:
   - Apri l'app → "Trova Stanze"
   - Vedi la stanza del Venue Host
   - Tap per entrare

### Scenario 3: Hotspot Mode

1. **Device A** (Host con hotspot):
   - Attiva hotspot sul telefono
   - Apri l'app → "Crea LAN Room" → Abilita "Modalità Hotspot"
   - Inserisci SSID e Password hotspot
   - Avvia la stanza

2. **Device B** (Guest):
   - Apri l'app → "Trova Stanze"
   - Vedi stanza con badge 🔥 Hotspot
   - Tap → Leggi credenziali via BLE
   - Connettiti all'hotspot manualmente
   - Torna nell'app e connettiti

---

## 🐛 Problemi Noti

### Android 10-11 (API 29-30)

La discovery mDNS automatica può essere **intermittente o non funzionare**. Workaround:

1. **Hotspot Mode**: Il device moderno crea la stanza, gli altri si connettono
2. **Connessione Manuale**: Inserisci manualmente l'IP del venue host
3. **Phone Host**: Crea la stanza da Android vecchio, gli altri la trovano

Vedi [ANDROID_DISCOVERY_ISSUES.md](./ANDROID_DISCOVERY_ISSUES.md) per dettagli tecnici.

### macOS Security Warning

Se vedi "pandemic-venue-host-macos-arm64 cannot be opened because it is from an unidentified developer":

1. Vai su **Preferenze di Sistema → Sicurezza e Privacy**
2. Clicca **"Apri comunque"** accanto al messaggio
3. Conferma aprendo di nuovo

### Windows Defender

Windows potrebbe bloccare l'eseguibile. Clicca **"Altre informazioni"** → **"Esegui comunque"**.

---

## 📖 Documentazione

- [README principale](./README.md) - Panoramica completa
- [ANDROID_DISCOVERY_ISSUES.md](./ANDROID_DISCOVERY_ISSUES.md) - Problemi discovery Android
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architettura tecnica
- [SETUP_GUIDE.md](./SETUP_GUIDE.md) - Setup ambiente sviluppo

---

## 🔄 Changelog

### v1.3.0

- ✅ **iOS Full Support**: moduli nativi Objective-C (WebSocket server, Bonjour, BLE)
- ✅ **TestFlight distribution**: build e submit via EAS
- ✅ **QR Code sharing**: genera QR con deep link per join diretto
- ✅ **QR Scanner**: scansione in-app da "Find Rooms"
- ✅ **Native file write**: scrittura binaria affidabile su iOS (`writeBase64ToFile`)
- ✅ **Audio session**: riconfigurazione automatica prima di ogni play su iOS
- ✅ **Content disclaimer**: checkbox al primo avvio
- ✅ **Signed Android APK**: APK firmato per distribuzione
- ✅ **File extension fix**: aggiunta automatica estensione audio per compatibilità iOS

### v1.2.0

- ✅ Phone Host Mode: Crea stanze LAN direttamente dal telefono
- ✅ BLE GATT per hotspot credentials
- ✅ Auto-reconnect WebSocket con exponential backoff
- ✅ Risoluzione mDNS sequenziale (workaround bug Android NSD)
- ✅ WiFi Multicast Lock per Android vecchi
- ✅ Venue Host eseguibile standalone (no Node.js richiesto)
- ✅ Dashboard web integrata nel venue host

---

**Versione**: v1.3.0  
**Data**: 2026-04-16
