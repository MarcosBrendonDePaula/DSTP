# DSTP Relay

Tiny HTTP forwarder that makes the DSTP mod work with a **remote** DSTP backend.

## Why this exists

Don't Starve Together's Lua sandbox only allows HTTP calls to `127.0.0.1` / `localhost`. This is a hardcoded whitelist in the game binary — you cannot bypass it from Lua.

If you want to host DSTP centrally (one backend, many DST servers connecting to it), each DST server host has to run this relay on their machine. The relay listens on `127.0.0.1:3000`, passes the DST sandbox check, and forwards every request to your public DSTP backend.

```
DST Server (user's machine)
   │
   ▼  HTTP 127.0.0.1:3000  (passes DST sandbox)
dstp-relay.exe
   │
   ▼  HTTPS
https://your-backend.example.com  (your central DSTP)
```

## Install & run

1. Download the ZIP from releases. It contains:
   - `dstp-relay.exe` (or `dstp-relay-linux` / `dstp-relay-mac`)
   - `dstp-relay.config.json` — pre-filled with sensible defaults
   - `start.bat` (Windows) or `start.sh` (Linux/Mac)
2. Extract to any folder.
3. Edit `dstp-relay.config.json` if you want a different upstream panel. The
   shipped default points to the public DSTP instance. If you self-host, put
   your URL here.
4. Double-click `start.bat` (or run `./start.sh`). A black window opens showing
   the relay status. Keep it open.
5. Install the DSTP mod in DST. It's already configured to use
   `http://127.0.0.1:47834` (the relay's port) — no configuration needed.

Done. The mod talks to the relay on localhost; the relay forwards to your
chosen panel backend.

## Configuration

Config file `dstp-relay.config.json` next to the binary:

| Option | Env var | Default | Description |
|---|---|---|---|
| `upstream` | `DSTP_UPSTREAM` | `https://local.marcosbrendon.com` | Central backend URL |
| `port` | `DSTP_PORT` | `47834` | Local port to listen on. **Must match the mod's BACKEND_URL port.** |
| `token` | `DSTP_TOKEN` | `null` | Optional shared secret sent as `X-DSTP-Relay-Token` header |

Env vars override the config file. The config file overrides the baked defaults.
Fields starting with `_` (like `_comment`, `_docs`) are ignored, so you can keep
notes inline.

## Build from source

```bash
cd relay
bun install
bun run build:all   # produces dist/dstp-relay{.exe,-linux,-mac}
```

## Security notes

- The relay binds to `127.0.0.1` only — never exposed to LAN/WAN.
- All traffic is TLS terminated at the upstream if it's HTTPS.
- If your backend requires auth, use `DSTP_TOKEN` so the backend can verify requests come from a legitimate relay, not a stray script.
