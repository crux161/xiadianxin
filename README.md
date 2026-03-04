# 下点心 (XiaDianxin)

*"Put in a little heart"* — a high-performance peer-to-peer video calling super-app, powered by the **Sankaku/RT** QUIC media transport.

> **下点心** (xià diǎn xīn) is a pun: 点心 means "snacks/dim sum", while 下点心 reads as "put in a little heart" — care in every connection.

## Architecture

```
┌───────────────────────────────────────────────────┐
│                     Tauri v2                      │
│  ┌─────────────────┐   IPC    ┌────────────────┐  │
│  │  React Frontend  │ ◄─────► │  Rust Backend  │  │
│  │  Semi Design UI  │ invoke  │  lib.rs        │  │
│  │  SankakuBridge   │ events  │  mDNS · Profile│  │
│  │  getUserMedia()  │         └───────┬────────┘  │
│  └─────────────────┘                 │ FFI       │
│                               ┌──────▼────────┐  │
│                               │ sankaku-core  │  │
│                               │  QUIC · FEC   │  │
│                               │  H.265 video  │  │
│                               └───────────────┘  │
└───────────────────────────────────────────────────┘
```

## Features

| Feature | Status |
|---------|--------|
| Real webcam capture (`getUserMedia`) | Implemented |
| mDNS peer discovery (IPv4 + IPv6) | Implemented |
| 9-digit calling codes (###-###-###) | Implemented |
| Local profile storage | Implemented |
| Localization (English / Chinese) | Implemented |
| Reference art in event cards | Implemented |
| Tally lights (CAM / MIC live indicators) | Implemented |
| Voicemail recording UI | Implemented |
| H.265 encoding via Sankaku/RT | Stub (integration point marked) |
| STUN/TURN matchmaking server | Planned |

## Key Files

| File | Role |
|------|------|
| `src-tauri/src/lib.rs` | Backend — mDNS (mdns-sd), profile persistence, calling codes, stubbed Sankaku transport |
| `src/services/SankakuBridge.ts` | IPC adapter — wraps all `invoke()` + `listen()` for profiles, peers, calls |
| `src/App.tsx` | Shell — i18n-wrapped layout, real peer list from mDNS, dial pad, settings |
| `src/components/CallView.tsx` | In-call — real webcam via `getUserMedia`, tally lights, control bar, voicemail |
| `src/components/SettingsPanel.tsx` | Settings — profile editor, language toggle, avatar picker |
| `src/components/DialPad.tsx` | Dial — 9-digit keypad with auto-formatting, video/audio call buttons |
| `src/components/EventCard.tsx` | Cards — reference art integration for notices and idle states |
| `src/hooks/useMediaDevices.ts` | Hook — webcam/mic access, track toggling, cleanup |
| `src/i18n/{en,zh}.ts` | String maps — complete English and Chinese translations |
| `src/i18n/index.tsx` | i18n — React Context provider with `useI18n()` hook |

### Call State Machine

```
         ┌───────┐
         │ Idle  │◄──────────────────────┐
         └───┬───┘                       │
             │                           │
    dial_code / incoming-call event      │ end_call
             │                           │
     ┌───────▼────────┐    ┌─────────────┴──────┐
     │  Connecting /   │───►│  InCallVideo /     │
     │  IncomingCall   │    │  InCallAudio       │
     └───────┬────────┘    └────────────────────┘
             │ decline
     ┌───────▼────────┐
     │   Voicemail    │
     └────────────────┘
```

### 9-Digit Calling System

Each instance generates a unique calling code at first launch (e.g. `418-073-926`).
The code is stored in `~/.local/share/com.saffron.xiadianxin/profile.json` and
advertised via mDNS TXT records on `_xiadianxin._udp.local.`.

To call another instance, enter their code in the Dial tab or click a discovered
peer in the Peers tab.

## Prerequisites

- **Rust** (stable, >= 1.77) — `rustup update stable`
- **Node.js** (>= 18) + npm
- **Tauri v2 CLI** — `cargo install tauri-cli --version "^2"`
- macOS: Xcode Command Line Tools
- Linux: `webkit2gtk-4.1`, `libappindicator3`, `librsvg2`

## Quick Start

```bash
npm install
npm run tauri dev
```

The app launches, generates a calling code, starts mDNS discovery, and requests
webcam/mic permissions when you initiate a call. Other instances on the same
network appear automatically in the Peers tab.

### Localization

Default language is **English**. Switch to Chinese in Settings (gear icon in sidebar footer).
The language preference persists in `profile.json`.

## Sankaku/RT Integration

The backend commands are stubs at marked integration points. To wire real H.265 transport:

1. Add `sankaku-core` to `src-tauri/Cargo.toml`.
2. In `dial_code()` / `accept_call()`, open a QUIC connection via `SankakuStream::connect()`.
3. Pipe `getUserMedia` frames from the frontend to the backend via a frame-data IPC channel.
4. Encode to H.265 (FFmpeg/hardware encoder) and feed into `SankakuSender::send_frame()`.
5. On the receive side, decode `InboundVideoFrame` payloads and emit to the frontend for rendering.

**Do not modify** `reference/sankaku/` without documenting changes in its README.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | Semi Design (ByteDance) |
| Frontend | React 18 + TypeScript 5 |
| Desktop Shell | Tauri 2.0 |
| Peer Discovery | mdns-sd (mDNS/DNS-SD, IPv4+IPv6) |
| Transport (stub) | Sankaku/RT — QUIC + Wirehair FEC |
| Fonts | HarmonyOS Sans SC |
| Localization | Context-based i18n (en/zh) |

## License

Proprietary — Saffron.
