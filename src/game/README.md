# Real-Life XP

Turn real workouts into levels, loot and boss fights.

**What we're building: [VISION.md](./VISION.md)**

**Start here: [SETUP.md](./SETUP.md)** — one-time setup, written for
non-developers.

## What this is

A mobile-first fitness RPG. You log real exercise, earn XP, level 1–99, fight
a weekly boss, open chests, and lose XP to decay if you miss your daily
target. Built as an installable web app (PWA) — no app store needed.

## Project layout

```
src/
  main.jsx              entry point
  App.jsx               wires storage + auth to the game
  components/
    AuthGate.jsx        sign in / sign up / play offline
  game/
    RealLifeXP.jsx      the game itself
  lib/
    supabase.js         auth + cloud save calls
    storage.js          offline-first sync layer
  styles/
    auth.css            login screen styling
public/                 static assets served as-is
supabase-setup.sql      database schema + security rules
.github/workflows/      builds and publishes on every push
```

## Design rules

- **Offline first.** The phone's own storage is the working copy. The cloud is
  a mirror. A dropped connection must never cost someone a logged workout.
- **Never silently lose progress.** When two devices disagree, the save with
  more logged work wins and the other is kept as a recoverable backup.
- **Play is never gated.** "Continue without an account" always works.
- **Security lives in the database.** Row Level Security, not key secrecy.

## Local development

```bash
npm install
npm run dev
```

Create a `.env.local` for cloud features (optional — it runs without one):

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```
