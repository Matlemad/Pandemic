# 🚀 PANDEMIC - Quick Start Guide

## Test Rapido (5 minuti)

### 1️⃣ Avvia il Server Expo

Il server è già in esecuzione! Se non lo è:

```bash
npm start
```

Vedrai un QR code nel terminale.

---

### 2️⃣ Test su Simulatore (UI Only)

**iOS:**
```bash
npm run ios
```

**Android:**
```bash
npm run android
```

**Cosa puoi testare:**
- ✅ Navigazione tra schermate
- ✅ UI e design
- ✅ Libreria audio
- ✅ Impostazioni
- ❌ BLE (non funziona su simulatore)

---

### 3️⃣ Test su Device Fisico (BLE Funzionante)

**Prerequisiti:**
- Device iOS o Android
- Bluetooth attivo
- Stessa Wi-Fi locale (opzionale, per trasferimenti)

#### Metodo A: Expo Go (Più Semplice)

1. Installa **Expo Go** da App Store / Play Store
2. Apri Expo Go
3. Scansiona il QR code dal terminale
4. L'app si caricherà

**⚠️ Limitazione:** Alcune funzionalità native potrebbero non funzionare perfettamente con Expo Go.

#### Metodo B: Build Nativo (Consigliato)

**iOS:**
```bash
# 1. Prebuild
npx expo prebuild

# 2. Apri Xcode
open ios/Pandemic.xcworkspace

# 3. Seleziona il tuo iPhone come target
# 4. Clicca Run (⌘R)
```

**Android:**
```bash
# 1. Prebuild
npx expo prebuild

# 2. Connetti device via USB
# 3. Abilita USB Debugging

# 4. Build e installa
npx expo run:android --device
```

---

## 🧪 Test Scenari

### Scenario 1: UI e Navigazione

1. Apri app
2. Naviga: Home → Host → Join → Library → Settings
3. Verifica che tutto funzioni

### Scenario 2: Creazione Stanza

1. Tap "Crea Stanza"
2. Inserisci nome: "Test Room"
3. Tap "Crea Stanza"
4. Verifica Room screen

### Scenario 3: Discovery (2 Device)

**Device A (Host):**
1. Crea stanza
2. Mantieni app aperta

**Device B (Guest):**
1. Tap "Trova Stanze"
2. Attendi 5-10 secondi
3. Dovresti vedere "Test Room"

**⚠️ Nota:** BLE funziona solo su device fisici, non su simulatore!

---

## 🔧 Troubleshooting

### "Nessuna stanza trovata"

- ✅ Bluetooth attivo?
- ✅ App in foreground (iOS)?
- ✅ Device vicini (< 10m)?
- ✅ Permessi concessi?

### "Network non disponibile"

- ✅ Stessa Wi-Fi su entrambi i device?
- ✅ Wi-Fi locale (non richiede Internet)?

### App non si avvia

```bash
# Pulisci cache
npm start -- --clear

# Reinstalla dipendenze
rm -rf node_modules && npm install
```

---

## 📱 Cosa Funziona ORA

### ✅ Funziona
- UI completa
- Navigazione
- State management
- Libreria audio locale
- Import file
- Discovery BLE (device fisico)
- Join room (simulato)
- UI trasferimenti (simulato)

### ⚠️ Parzialmente Funziona
- BLE discovery (solo device fisico)
- Network detection (richiede Wi-Fi)

### ❌ Non Ancora Implementato
- HTTP server nativo (trasferimenti reali)
- WebSocket server (coordinazione real-time)
- BLE transfer completo (fallback mode)

---

## 🎯 Prossimi Passi

Per testare trasferimenti reali, serve implementare:
1. HTTP server nativo per file streaming
2. WebSocket per coordinazione
3. BLE GATT completo per fallback

---

**💡 Tip:** Inizia con Expo Go per testare UI, poi passa a build nativo per BLE!

