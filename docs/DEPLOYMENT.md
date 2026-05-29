# Deployment Guide

Godoy Engine Alpha v0.1 uses a split deployment model:

- Static client on Vercel or Netlify.
- Dedicated WebSocket server on Render or Railway.

## Client Environment

Set these variables on the client hosting platform before a public deploy:

```txt
VITE_GODOY_RELEASE_VERSION=v0.1.0-alpha
VITE_GODOY_RELEASE_CHANNEL=Public Alpha
VITE_GODOY_WS_URL=wss://YOUR_HOSTED_SERVER
VITE_GODOY_FEEDBACK_URL=https://YOUR_FEEDBACK_FORM_OR_ISSUE_TRACKER
```

Local development can omit `VITE_GODOY_WS_URL`; the client falls back to `ws://127.0.0.1:8787` only on local hostnames.

## Vercel Client

`vercel.json` configures:

- Framework: Vite
- Build command: `npm run build:client`
- Output directory: `dist`
- SPA fallback to `index.html`

## Netlify Client

`netlify.toml` configures:

- Build command: `npm run build:client`
- Publish directory: `dist`
- SPA redirect fallback to `index.html`

## Render Server

`render.yaml` configures a Node web service with:

- Build command: `npm install`
- Start command: `npm start`
- Health path: `/health`
- Host binding: `0.0.0.0`

Render supplies the public port through platform routing; the server also supports the standard `PORT` environment variable.

## Railway Server

`railway.json` configures:

- Railpack builder
- Start command: `npm start`
- Health path: `/health`
- Restart policy for failed server processes

Railway supplies `PORT`; set `GODOY_MULTIPLAYER_HOST=0.0.0.0` in the service variables.

## Server Environment

```txt
NODE_ENV=production
GODOY_MULTIPLAYER_HOST=0.0.0.0
GODOY_SERVER_TICK_RATE=20
GODOY_DEFAULT_WORLD_ID=public-alpha
GODOY_PERSIST_WORLDS=1
GODOY_SERVER_DATA_DIR=server-data
```

Use platform-managed secrets and variables for deployment. Do not commit `.env` files.

## Public Test Flow

1. Deploy the server.
2. Confirm `https://YOUR_SERVER/health` returns `ok: true`.
3. Set `VITE_GODOY_WS_URL=wss://YOUR_SERVER` on the client project.
4. Deploy the client.
5. Open the client URL.
6. Use Join Multiplayer and confirm the offline message no longer appears.
7. Test two browser tabs with the same deployed client URL.

## Release Checks

Run this locally before publishing:

```bash
npm run verify:alpha
```

The release suite includes production build, runtime config, WebGL fallback, settings, camera/collision, visual/game-feel, inventory/crafting, save migration, and multiplayer smoke checks.
