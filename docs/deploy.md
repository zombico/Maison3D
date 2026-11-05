# Deploying the public demo

The live demo runs at <https://maison3d.fly.dev>. To host your own, you need a container host with HTTPS and secrets: the
microphone and WebXR only work over HTTPS. The image is the repo's `Dockerfile`; it has no npm dependencies and includes
Piper for spoken replies.

**Keep it to one machine.** Each visitor's room and the day's turn counts live in the server's memory.

## Fly.io

```bash
fly launch --copy-config --no-deploy
fly secrets set META_API_KEY=your-key
fly deploy --remote-only --ha=false
```

`--ha=false` matters: a new Fly app otherwise gets two machines. If the first deploy reports that it could not provision
IP addresses, add them with `fly ips allocate-v6` and `fly ips allocate-v4 --shared`.

`fly.toml` keeps the machine running, because stopping it would clear every room and reset the turn counts, including the
daily cap. A deploy or restart still clears them.

## Render

New > Blueprint, pick this repo (`render.yaml`), and paste the Meta API key as `META_API_KEY`. The `starter` plan doesn't
sleep.

## Limits

Public mode (`MAISON_PUBLIC=1`, set by the image) limits turns with these variables, set in `fly.toml` and `render.yaml`.
A turn can make up to nine model calls, though most make two or three.

| Variable | Value | Limit |
|---|---|---|
| `MAISON_TURNS_PER_VISITOR` | 30 | Turns per visitor per day |
| `MAISON_TURNS_PER_ADDRESS` | 300 | Turns per IP address per day, high enough for a group on one network |
| `MAISON_TURNS_PER_DAY` | 1500 | Turns across the whole site per day, the real guard on cost |
