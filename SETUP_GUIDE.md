# 🔧 PANDEMIC - Setup e Risoluzione Problemi

## 🚀 Metodo Più Semplice: Expo Go

**Non serve Xcode o Android Studio!**

### Passi:

1. **Installa Expo Go sul tuo device:**
   - iOS: [App Store - Expo Go](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Play Store - Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Assicurati che il server Expo sia in esecuzione:**
   ```bash
   npm start
   ```

3. **Scansiona il QR code:**
   - iOS: Apri Camera app → punta al QR code
   - Android: Apri Expo Go → tap "Scan QR code"

4. **L'app si caricherà automaticamente!**

**✅ Vantaggi:**
- Nessuna installazione di Xcode/Android Studio
- Funziona immediatamente
- Hot reload automatico

**⚠️ Limitazioni:**
- Alcune funzionalità native potrebbero essere limitate
- BLE funziona ma potrebbe avere limitazioni

---

## 🛠️ Fix Problemi Simulatori/Emulatori

### Problema 1: Xcode non configurato (iOS)

**Errore:**
```
Xcode must be fully installed before you can continue
```

**Soluzione:**

```bash
# 1. Installa Xcode da App Store (se non l'hai fatto)
# 2. Apri Xcode e accetta i termini
# 3. Installa command line tools
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

# 4. Verifica installazione
xcode-select -p
# Dovrebbe mostrare: /Applications/Xcode.app/Contents/Developer
```

**Poi prova:**
```bash
npm run ios
```

---

### Problema 2: Android SDK non trovato

**Errore:**
```
Failed to resolve the Android SDK path
Error: spawn adb ENOENT
```

**Soluzione:**

#### Opzione A: Installa Android Studio

1. Scarica [Android Studio](https://developer.android.com/studio)
2. Installa e configura Android SDK
3. Aggiungi al tuo `~/.zshrc`:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```
4. Riavvia terminale

#### Opzione B: Usa solo Expo Go (più semplice!)

Non serve Android Studio se usi Expo Go su device fisico.

---

### Problema 3: Versioni pacchetti non compatibili

**Warning:**
```
react-native-gesture-handler@2.30.0 - expected version: ~2.28.0
react-native-reanimated@4.2.1 - expected version: ~4.1.1
react-native-screens@4.19.0 - expected version: ~4.16.0
```

**Soluzione (opzionale):**

Questi warning di solito non bloccano l'app, ma se vuoi fixarli:

```bash
# Installa versioni compatibili
npm install react-native-gesture-handler@~2.28.0 react-native-reanimated@~4.1.1 react-native-screens@~4.16.0

# Poi riavvia
npm start -- --clear
```

**Nota:** Le versioni attuali potrebbero funzionare comunque, sono solo warning.

---

## 📱 Test con Device Fisico (Consigliato)

### Per iOS:

1. **Connetti iPhone via USB**
2. **Abilita Developer Mode:**
   - Settings → Privacy & Security → Developer Mode → ON
3. **Fidati del computer:**
   - Quando connetti, tap "Trust This Computer"
4. **Build e installa:**
   ```bash
   npx expo prebuild
   npx expo run:ios --device
   ```

### Per Android:

1. **Connetti device via USB**
2. **Abilita USB Debugging:**
   - Settings → About Phone → Tap "Build Number" 7 volte
   - Settings → Developer Options → USB Debugging → ON
3. **Verifica connessione:**
   ```bash
   adb devices
   # Dovrebbe mostrare il tuo device
   ```
4. **Build e installa:**
   ```bash
   npx expo prebuild
   npx expo run:android --device
   ```

---

## 🎯 Raccomandazione

**Per iniziare velocemente:**
1. ✅ Usa **Expo Go** sul tuo device fisico
2. ✅ Nessuna configurazione complessa
3. ✅ Funziona subito

**Per sviluppo avanzato:**
1. Installa Xcode (iOS) o Android Studio (Android)
2. Fai build nativo
3. Test completo di tutte le funzionalità

---

## 🔍 Verifica Setup

### Check rapido:

```bash
# Verifica Node
node --version  # Dovrebbe essere >= 18

# Verifica Expo CLI
npx expo --version

# Verifica server Expo
npm start
# Dovrebbe mostrare QR code
```

---

## 💡 Tips

- **Porta già in uso?** Il server Expo è già in esecuzione sulla porta 8081. Puoi usarlo direttamente!
- **Hot reload:** Modifiche al codice si riflettono automaticamente
- **Debug:** Usa React Native Debugger o Chrome DevTools

---

*Ultimo aggiornamento: v1.0.0*

