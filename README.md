# FairBloom API

Express + MongoDB + Socket.IO backend for FairBloom.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values.
3. `npm run dev` (auto-reload) or `npm start`.

## Scripts

| Script                 | What it does                              |
| ---------------------- | ----------------------------------------- |
| `npm start`            | Start the server (use this in production) |
| `npm run dev`          | Start with nodemon auto-reload            |
| `npm run lint`         | Check code with ESLint                    |
| `npm run lint:fix`     | Auto-fix ESLint problems                  |
| `npm run format`       | Format code with Prettier                 |
| `npm run format:check` | Check formatting without changing files   |
| `npm run seed`         | Seed the database                         |
| `npm run backup`       | Write an encrypted backup to `BACKUP_DIR` |
| `npm run restore`      | Restore from a backup                     |

## Deploying

### Vercel

`app.js` exports the Express app, and Vercel runs it as a serverless function. MongoDB connects on
the first request and the connection is reused while the instance stays warm.

- Framework Preset: **Express** (Project → Settings → Build & Deployment). Leave the build and output settings empty.
- Set the environment variables listed below. `TRUST_PROXY` is set automatically on Vercel.
- MongoDB Atlas → Network Access must allow `0.0.0.0/0`, because Vercel has no fixed outbound IPs.
- Limits: Socket.IO doesn't run on Vercel. The mobile app polls instead, so it isn't needed. Request
  bodies are capped at 4.5 MB, so larger image uploads fail with a 413 error.

### Other hosts

There is no build step. Any Node 18+ host (Render, Railway, a VPS with PM2, etc.) works:

- **Install:** `npm ci --omit=dev`
- **Start:** `npm start`
- **Health check:** `GET /api/health`

Set these on the host (not in a committed file):

- `NODE_ENV=production`. This turns off the dev-only CORS rule that allows any LAN/localhost origin.
- `MONGO_URI`, `JWT_SECRET`, the `SMTP_*` values and `BACKUP_PASSPHRASE`.
- `CLIENT_ORIGIN`: the admin web URL(s), comma separated.
- `TRUST_PROXY=1` when behind a load balancer or reverse proxy (most hosts), so rate limiting sees real client IPs.
- `PORT` is usually provided by the host.

Uploaded images are stored in MongoDB, so the server keeps no state on local disk. The exception is
`npm run backup`, which writes to `BACKUP_DIR`. On hosts with temporary disks, point that at a persistent volume.
