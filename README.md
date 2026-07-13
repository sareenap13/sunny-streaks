# 🌻 Sunny Streaks

A two-player health competition for you and a friend. Log water, steps, workouts,
mobility, and sleep — scores sync live between your devices and reset every 14 days.

## Scoring

| Metric | Points |
|---|---|
| Water | +2 per 20 oz |
| Steps | +1 per 10,000 steps |
| Workout | 30–59 min = 2, 60–89 min = 3, 90+ min = 4 |
| Mobility / stretching (15+ min) | +1 |
| Sleep (7.5+ hours) | +1 |

Scores reset every 14 days. The in-app "📖 Rules" button shows this same breakdown.

## How it works

- No accounts or passwords — one person creates a game and shares a link/code,
  the other opens it and picks their side.
- Both devices subscribe to the same Firestore document, so entries sync in
  real time.
- Each metric can be added to throughout the day (e.g. log water after every
  glass) rather than overwritten.

## Project structure

```
public/                  — the deployed static site
  index.html
  style.css
  app.js
  firebase-config.js      — your real Firebase keys (gitignored, not in repo)
  firebase-config.example.js — template to copy from
firestore.rules          — Firestore security rules
firebase.json / .firebaserc — Firebase Hosting + project config
preview.html             — static mockup used during design, not deployed
```

## Running locally

1. Copy the config template and fill in your own Firebase project's values:
   ```
   cp public/firebase-config.example.js public/firebase-config.js
   ```
2. Serve the `public/` folder (must be over `http://`, not `file://`, since it
   uses ES modules):
   ```
   cd public && python3 -m http.server 8000
   ```
3. Open `http://localhost:8000`.

## Deploying

```
firebase deploy --only firestore:rules   # after editing firestore.rules
firebase deploy --only hosting           # after editing anything in public/
```

Requires the [Firebase CLI](https://firebase.google.com/docs/cli) logged in
(`firebase login`) with access to the Firebase project referenced in
`.firebaserc`.
