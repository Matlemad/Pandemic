# 🔧 Fix Permessi Media Library

## Problema

L'errore indica che il permesso AUDIO non è dichiarato nell'AndroidManifest.

## Soluzione

### Opzione 1: Prebuild (Consigliato per test completo)

I permessi vengono aggiunti automaticamente durante il prebuild:

```bash
# 1. Ferma il server Expo
# 2. Fai prebuild
npx expo prebuild

# 3. Riavvia
npm start -- --clear
```

### Opzione 2: Expo Go (Limitato)

In Expo Go, alcuni permessi potrebbero non funzionare perfettamente. L'app continuerà a funzionare ma:
- ❌ Scansione libreria audio potrebbe non funzionare
- ✅ Import file manuale funziona
- ✅ Gestione file locali funziona

### Opzione 3: Build Nativo

Per testare completamente i permessi:

```bash
# Android
npx expo prebuild
npx expo run:android --device

# iOS  
npx expo prebuild
npx expo run:ios --device
```

---

## Cosa ho fatto

1. ✅ Aggiunto `audioPermission` nella configurazione del plugin
2. ✅ Migliorata gestione errori (app non crasha se permessi negati)
3. ✅ Retry automatico dei permessi quando necessario

---

## Verifica

Dopo il prebuild, verifica che in `android/app/src/main/AndroidManifest.xml` ci sia:

```xml
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

---

*Nota: In Expo Go, alcuni permessi potrebbero essere limitati. Per test completo, usa build nativo.*

