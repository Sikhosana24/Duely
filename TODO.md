# Duely Development TODO

## Phase 1: Window & UI Polish ✅ In Progress - Stealth Implementation
1. [ ] src-tauri/src/lib.rs: Add set_content_protected(true) in set_pill_mode(enabled=true), false when disabled
2. [ ] src/App.tsx: Add "STEALTH" button to toggle pill_mode (stealth pill invisible in screen share)
3. [ ] Update TODO.md with completion status
4. [ ] Test: npm run tauri dev, toggle STEALTH during screen share (Teams/Zoom), verify exclusion
- [x] Update tauri.conf.json: resizable=false, skipTaskbar=true
- [x] src-tauri/src/lib.rs: Add drag_window, set_position (presets), global hotkeys (Ctrl+\ toggle)
- [x] src/App.tsx: Draggable header, position preset buttons, hotkey listeners, stealth toggle (in progress)

## Phase 2: Live Listening & Transcription
- [ ] New src/services/audio.ts: Web Audio API mic capture
- [ ] src-tauri/src/lib.rs: Add transcription command (Whisper/Ollama)
- [ ] src/App.tsx: Live transcript display, auto-poll every 3s, hotword "Hey Duely"

## Phase 3: Screen OCR
- [ ] src-tauri/src/lib.rs: Screen capture command
- [ ] New src/services/ocr.ts: Tesseract.js processing
- [ ] src/App.tsx: OCR preview in context

## Phase 4: Auto-Features & UI
- [ ] src/App.tsx: Auto-suggestions polling, confidence scorer, tone switcher (Prof/Casual/Tech/Assertive), quick actions (shorter/longer/simpler)
- [ ] Session memory: LocalStorage + SQLite
- [ ] Summary/email generator, PDF export

## Phase 5: Offline & Advanced
- [ ] Cargo.toml: Add crates (global-shortcut, sql, fs, shell, whisper-rs)
- [ ] package.json: tesseract.js, pdf-lib
- [ ] src-tauri/src/lib.rs: Ollama fallback
- [ ] Knowledge base preload

## Dependencies & Testing
- [ ] Install Rust/JS deps
- [ ] Test: `npm run tauri dev`
- [ ] Full feature integration

Progress: Implementing stealth capture-evasion via set_content_protected in pill_mode.
