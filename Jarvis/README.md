# JARVIS - personal AI assistant for Android (Java + XML)

A real, working assistant app: chat with Google Gemini, voice in/out, device commands,
notes, memory, and file/PDF analysis. Java + XML only (no Kotlin, no Compose). minSdk 26, targetSdk 34.

## Build the APK without a PC (GitHub Actions)
1. Create a GitHub repository (suggested name: `jarvis-android-assistant`).
2. Upload everything from this folder (keep the `.github/workflows/build.yml` path).
3. Open the **Actions** tab -> **Build APK** -> *Run workflow* (it also runs on every push to `main`).
4. When it finishes, open the run and download the **jarvis-debug-apk** artifact, unzip it, install `app-debug.apk`.
5. In the app: **Settings** -> paste your free Gemini key from https://aistudio.google.com/apikey -> *Save & test connection*.

The repo has no Gradle wrapper jar (it is a binary file). The workflow installs Gradle 8.7 itself.
To build inside AndroidIDE, create a blank Java project there (it generates the wrapper), then copy `app/src`,
`app/build.gradle`, `build.gradle`, `settings.gradle` and `gradle.properties` over it.

## What works
| Feature | How |
|---|---|
| AI chat with history and personality | Gemini REST API, called directly from the phone |
| Current information | Gemini "Google Search" grounding (toggle in Settings; auto-retries without it if your quota refuses it) |
| Voice input | Android `SpeechRecognizer` (English-India, Hindi, English-US/UK; set in Settings). Tap the mic to start, tap again to stop |
| Voice output | Android `TextToSpeech` (Hindi voice for Devanagari text, English-India otherwise; speed in Settings) |
| Open apps / settings | "open WhatsApp", "open wifi settings", "bluetooth settings kholo" |
| Notes | "note buy milk", "read my notes", "open notes" (Notes screen: tap = copy, long-press = delete) |
| Memory | "remember that my sister's name is Riya" - injected into every AI request; manage in Memory screen |
| Alarms / reminders / timers | "set alarm at 6:30 am", "remind me at 5 pm to call Riya", "timer for 10 minutes" - opens the Clock app with the values filled in |
| Calculator | "calculate 12*(3+4)", "20 percent of 150", "what is 5 plus 3" |
| Weather | "weather in Delhi" (Open-Meteo, no key needed; home city in Settings) |
| Web search | "search best laptops 2026" opens your browser. For a direct answer just ask the question |
| Dial | "call 9876543210" asks for confirmation, then opens the dialer |
| Files | Paperclip button -> text/code files, PDFs and images are sent to Gemini with your question |

## Honest limits (Android rules, not bugs)
- **No always-on "Hey Jarvis"**: Android does not let normal apps listen to the microphone permanently in the background. Voice starts when you tap the mic.
- **Reminders are clock alarms**: apps cannot silently add reminders to other apps, so the Clock app opens and you confirm.
- **Calls/SMS are not sent silently**: JARVIS opens the dialer; you press call. SMS is not implemented.
- **No control of other apps' screens** (that would need an Accessibility service, which is deliberately not used).
- **Opening apps by name** only finds apps with a launcher icon.
- Chat history, notes and facts are stored unencrypted in the app's private storage (other apps cannot read it). Only the API key is additionally encrypted.
- The API key lives on the phone. For a public Play Store release, put the key behind your own backend instead.

## Architecture
```
ui/        SplashActivity, MainActivity, NotesActivity, HistoryActivity, SettingsActivity, MessageAdapter
ai/        GeminiClient (REST + error mapping), PromptBuilder (personality + memory), Attachment, AiException
commands/  CommandRouter (detection + actions), Calculator, WeatherService
voice/     VoiceManager (STT + TTS)
data/      DbHelper (SQLite: messages, notes, memory, commands), Message, Row
security/  SecureStore (EncryptedSharedPreferences)
net/       Http (HTTPS helper, connectivity check)
files/     FileProcessor (Storage Access Framework -> Gemini)
```
Request flow: user text -> `MainActivity.send()` -> `CommandRouter.tryHandle()`; if it is not a command ->
`GeminiClient.generate()` -> reply -> chat bubble (+ `VoiceManager.speak()`).
Only what the user types or says can trigger a device command; AI replies and file contents never can.

## Security notes
- No API key in source or Git. It is typed once and stored with AES-256 via the Android Keystore.
- The key is sent in an HTTP header over HTTPS only; cleartext traffic is disabled; `allowBackup=false`.
- Sensitive action (dialer) needs a confirmation dialog. Settings/model input is sanitised.
- Never commit `*.jks`, `keystore.properties` or `.env` (already in `.gitignore`).

## Test checklist
- No internet: send a message -> "No internet connection."
- Wrong key: Settings -> test -> "Invalid API key."
- Voice: allow microphone, tap mic, speak, check the reply is spoken; deny permission -> clear message.
- Commands: each phrase in the table above.
- Files: attach a .txt and a PDF -> ask for a summary.
- Rotate the phone, try a small and a large screen, Android 8 to 14.
