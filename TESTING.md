# 🧪 PANDEMIC - Guida al Testing

Questa guida spiega come testare l'app Pandemic nelle varie modalità.

---

## 📱 Opzioni di Test

### 1. Simulatore iOS / Emulatore Android (UI Only)

**Cosa funziona:**
- ✅ Navigazione tra schermate
- ✅ UI e design system
- ✅ State management (Zustand)
- ✅ Libreria audio locale
- ✅ Import file
- ✅ Impostazioni

**Cosa NON funziona:**
- ❌ BLE discovery (richiede device fisico)
- ❌ Network LAN (simulatore non ha IP reale)
- ❌ Trasferimenti reali

**Come avviare:**

```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Oppure usa Expo Go
# 1. Installa Expo Go su simulatore/emulatore
# 2. Scansiona QR code dal terminale
```

**Cosa puoi testare:**
1. Naviga tra tutte le schermate
2. Prova a creare una stanza (simulata)
3. Importa file audio dalla libreria
4. Modifica impostazioni
5. Verifica UI responsive

---

### 2. Device Fisico (Test Completo)

**⚠️ RICHIEDE:**
- Device iOS o Android fisico
- Bluetooth attivo
- Stessa rete Wi-Fi locale (per trasferimenti)

**Come avviare:**

#### iOS (Device Fisico)

```bash
# 1. Prebuild (genera progetto nativo)
npx expo prebuild

# 2. Connetti iPhone via USB
# 3. Apri Xcode
open ios/Pandemic.xcworkspace

# 4. Seleziona il tuo device come target
# 5. Clicca Run (⌘R)

# Oppure via CLI:
npx expo run:ios --device
```

**Permessi richiesti:**
- Bluetooth
- Local Network
- Media Library

#### Android (Device Fisico)

```bash
# 1. Prebuild
npx expo prebuild

# 2. Abilita USB Debugging sul device
# 3. Connetti via USB
# 4. Verifica connessione
adb devices

# 5. Build e installa
npx expo run:android --device

# Oppure usa Expo Go (più semplice per test iniziali)
# 1. Installa Expo Go da Play Store
# 2. Scansiona QR code
```

**Permessi richiesti:**
- Bluetooth
- Location (per BLE su Android 10+)
- Storage/Media

---

## 🧪 Scenari di Test

### Test 1: UI e Navigazione

**Obiettivo:** Verificare che tutte le schermate funzionino

**Passi:**
1. Avvia app
2. Verifica Home screen
3. Tap "Crea Stanza" → verifica Host screen
4. Tap back → verifica Home
5. Tap "Trova Stanze" → verifica Join screen
6. Tap "La mia libreria" → verifica Library screen
7. Tap "Impostazioni" → verifica Settings screen

**Risultato atteso:**
- Tutte le schermate si caricano
- Navigazione fluida
- UI renderizzata correttamente

---

### Test 2: Creazione Stanza

**Obiettivo:** Testare il flusso di creazione stanza

**Passi:**
1. Vai su Home
2. Tap "Crea Stanza"
3. Inserisci nome stanza (es: "Test Room")
4. Tap "Crea Stanza"
5. Verifica che appaia Room screen

**Risultato atteso:**
- Stanza creata
- Room screen mostra info stanza
- Stato "Host" visibile

**Nota:** BLE advertising richiede device fisico

---

### Test 3: Libreria Audio

**Obiettivo:** Testare import e gestione file audio

**Passi:**
1. Vai su "La mia libreria"
2. Tap icona cartella (importa file)
3. Seleziona file audio dal device
4. Verifica che file appaia in lista
5. Tap lungo su file → elimina

**Risultato atteso:**
- File importato correttamente
- Metadata estratti
- File visibile in lista
- Eliminazione funziona

---

### Test 4: Discovery BLE (Device Fisico)

**Obiettivo:** Testare discovery di stanze vicine

**Prerequisiti:**
- 2 device fisici
- Bluetooth attivo su entrambi
- App installata su entrambi

**Passi:**

**Device A (Host):**
1. Avvia app
2. Tap "Crea Stanza"
3. Inserisci nome: "Test Room A"
4. Tap "Crea Stanza"
5. Mantieni app in foreground

**Device B (Guest):**
1. Avvia app
2. Tap "Trova Stanze"
3. Attendi 5-10 secondi
4. Verifica che "Test Room A" appaia in lista

**Risultato atteso:**
- Device B vede Device A
- Room name corretto
- Signal strength visibile
- Tap su room → join (simulato)

**Troubleshooting:**
- Se non vedi la stanza:
  - Verifica Bluetooth attivo su entrambi
  - Avvicina i device (< 10m)
  - Verifica permessi BLE
  - Su iOS: app deve essere in foreground

---

### Test 5: Join Room (Device Fisico)

**Obiettivo:** Testare connessione a stanza

**Prerequisiti:**
- Device A con stanza attiva
- Device B che ha scoperto la stanza

**Passi:**
1. Device B: Tap su stanza scoperta
2. Attendi handshake BLE
3. Verifica connessione a Room screen

**Risultato atteso:**
- Handshake completato
- Device B entra in Room screen
- Stato "Guest" visibile
- Peer count aggiornato su Device A

---

### Test 6: Condivisione File

**Obiettivo:** Testare condivisione metadati file

**Passi:**
1. Device A (Host): Vai su Room screen
2. Tap FAB "+" (in basso a destra)
3. Seleziona file da condividere
4. Tap "Condividi"
5. Verifica file in lista "I tuoi file condivisi"

**Device B (Guest):**
1. Vai su Room screen
2. Verifica file in "File disponibili"
3. Tap download su un file

**Risultato atteso:**
- File condiviso visibile
- Metadata corretti
- Download reale del file

---

### Test 7: Trasferimenti

**Obiettivo:** Testare UI trasferimenti

**Passi:**
1. Device B: Avvia download di un file
2. Vai su tab "Trasferimenti"
3. Verifica progress bar
4. Verifica percentuale e speed
5. Attendi completamento

**Risultato atteso:**
- Progress bar animata
- Percentuale aggiornata
- Speed reale visibile
- File salvato in Library al termine

---

## 🔧 Debug e Troubleshooting

### Problemi Comuni

#### 1. BLE non funziona

**Sintomi:**
- Nessuna stanza trovata
- Errori permessi

**Soluzioni:**
- Verifica Bluetooth attivo
- Controlla permessi app
- Su iOS: app in foreground
- Su Android: verifica Location permission

#### 2. Network non disponibile

**Sintomi:**
- "Solo Bluetooth" invece di "Wi-Fi LAN"

**Soluzioni:**
- Connetti entrambi i device alla stessa Wi-Fi
- Verifica che Wi-Fi non richieda login
- Disabilita VPN se attiva

#### 3. App crasha su avvio

**Sintomi:**
- Crash immediato
- Red screen error

**Soluzioni:**
```bash
# Pulisci cache
npm start -- --clear

# Reinstalla dipendenze
rm -rf node_modules
npm install

# Rebuild nativo
npx expo prebuild --clean
```

#### 4. TypeScript errors

**Sintomi:**
- Errori di compilazione

**Soluzioni:**
```bash
# Verifica errori
npx tsc --noEmit

# Fix automatici (se possibile)
npx tsc --noEmit --fix
```

---

## 📊 Checklist Testing

### UI/UX
- [ ] Tutte le schermate si caricano
- [ ] Navigazione funziona
- [ ] Tema scuro applicato
- [ ] Componenti renderizzati correttamente
- [ ] Responsive su diversi screen size

### Funzionalità Base
- [ ] Creazione stanza
- [ ] Discovery BLE (device fisico)
- [ ] Join stanza
- [ ] Libreria audio
- [ ] Import file
- [ ] Condivisione metadati
- [ ] UI trasferimenti

### Edge Cases
- [ ] Host disconnette
- [ ] Network drop
- [ ] App in background (iOS)
- [ ] Permessi negati
- [ ] File molto grandi

### Performance
- [ ] Avvio rapido
- [ ] UI fluida
- [ ] Nessun memory leak
- [ ] Battery usage ragionevole

---

## 📝 Note

- **BLE:** Funziona solo su device fisico
- **Network:** Richiede stessa Wi-Fi locale
- **iOS:** Background molto limitato
- **Android:** Più permissivo ma comunque limitato

---

### Test 8: QR Code Join

**Obiettivo:** Testare join via QR code

**Passi:**

**Device A (Host):**
1. Crea LAN Room
2. QR code appare automaticamente sotto la room attiva

**Device B (Guest):**
1. Vai su "Trova Stanze"
2. Tap "Scan QR Code"
3. Scansiona il QR del Device A
4. Verifica connessione alla room

**Risultato atteso:**
- QR contiene deep link `pandemic://join?...`
- Scanner riconosce il QR e si connette
- Se hotspot mode, mostra credenziali Wi-Fi

---

### Test 9: Content Disclaimer

**Obiettivo:** Verificare disclaimer al primo avvio

**Passi:**
1. Installa l'app (prima volta)
2. Apri l'app
3. Verifica modal con checkbox
4. Prova a premere "Continue" senza checkbox → disabilitato
5. Seleziona checkbox → "Continue" si abilita
6. Tap "Continue"
7. Chiudi e riapri l'app → disclaimer NON riappare

**Risultato atteso:**
- Modal appare solo al primo avvio
- Testo disclaimer visibile nella home sotto il subtitle

---

*Ultimo aggiornamento: 2026-04-16*

