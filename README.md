# Plot Twist Engine

**A browser-based arcade strategy game where the whole room votes to change the rules.**

Plot Twist Engine is an early multiplayer prototype for 2–6 players. Each pilot joins from a phone or computer with a room code, races a rover across a shared grid, collects energy fragments, and tries to reach the exit. Before each of the first three rounds, the room votes between two rule twists. Each winning twist stays active, so the fourth round combines the choices the group has made.

> **Prototype status:** This build is intended for local playtests and iteration. It has no accounts, persistent room storage, daily challenge, or global leaderboard yet. The leaderboard currently ranks players inside the active room.

## Features

- Room creation and joining with a five-character code; no login or installation.
- Rooms for 2–6 players, with a shared rover grid and host-controlled match start.
- Keyboard, arrow-key, and touch controls.
- Three collection rounds followed by a final round with all selected modifiers.
- Two-option group votes with a visible countdown and deterministic tie resolution.
- Server-side movement validation, fragment collection, exits, and scoring.
- Live room standings, score totals, and a same-room rematch.
- Responsive interface for mobile and desktop.
- Vercel static hosting and serverless API support, with shared room state in Upstash Redis.

## How to play

1. One player creates a room and shares the code.
2. At least one more player joins; the host starts when the group is ready.
3. Vote for one of the two twists before each of the first three rounds. A vote lasts up to 18 seconds. If the group has not all voted when time expires, current votes are counted and ties are broken consistently for that room and round.
4. Move around the 11 × 8 grid, collect fragments, and reach the exit. Each round lasts up to 40 seconds. Walls and active rovers block movement.
5. Fragments are worth 10 points each; reaching the exit adds 25 points. Selected twists can change those values or movement.
6. The fourth round combines the twists selected earlier. Highest total score wins. Use **Rematch** to play again in the same room.

### Current rule twists

| Twist | Effect |
| --- | --- |
| Turbo Treads | Each move can glide one extra tile when the path is clear. |
| Rich Pockets | Fragments are worth 15 points instead of 10. |
| Edge Portal | Moving off one edge wraps the rover to the opposite edge. |
| Fragment Field | Two extra fragments appear each round. |
| Exit Boost | Reaching the exit is worth 40 bonus points instead of 25. |
| Corner Drift | Every second move can slide one extra tile. |

Modifiers persist once selected. If one appears again and wins another vote, it is not stacked twice.

## Run locally

Requires Node.js 20 or newer. There are no third-party runtime dependencies.

### Windows

```powershell
./Start-Game.ps1
```

### macOS, Linux, or any shell with Node.js

```sh
node server.js
```

Open [http://localhost:4173](http://localhost:4173). To play from other devices on the same Wi-Fi, use the host computer's LAN address with port `4173`, for example `http://192.168.1.20:4173`. The hosting computer must remain on and the server process must stay running.

## Deploy to Vercel

[`vercel.json`](vercel.json) places the API Function in Singapore (`sin1`) near the recommended Redis region. Static files are served by Vercel, while [`api/[...path].js`](api/%5B...path%5D.js) handles the room API. Room state is shared through the Upstash Redis REST API, so separate Function instances can read and update the same rooms.

1. Import this repository into your Vercel account. The repository is private, so grant Vercel access to `Josephy1714/plot-twist-engine` when prompted.
2. Create an Upstash Redis database through the Vercel Marketplace. Choose Singapore (`ap-southeast-1`) when available so the database is close to the Function region.
3. Confirm that the Vercel project has these environment variables in Preview and Production:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   The Upstash integration can add them for you. If adding them manually, use the REST URL and token from the Upstash database console. Never commit these values to the repository.
4. Deploy the project and wait for the build to finish. Open the assigned `vercel.app` URL, create a room, then join from a second browser or device.
5. Share the URL and room code with other pilots. Rematches use the same room.

Vercel serves the static game without a sleeping web server. Functions can still cold-start after idle periods. Redis is required for rooms to be shared across Function invocations. The prototype keeps room state in one Redis key and expires that key after eight hours without a room-changing request. Keep the Vercel Function and Redis database in the same region for responsive polling. Check the plans and usage limits for both Vercel and Upstash before deployment.

## Technical overview

- `index.html` contains the responsive interface and browser-side game client.
- `server.js` contains the shared game rules and a local Node server for same-network playtests.
- `api/[...path].js` exposes the game API as a Vercel Function and uses Upstash Redis for shared room state.
- `vercel.json` places the Function in Singapore.
- `package.json` defines the local Node start command; the game has no Node package dependencies.

Locally, room state stays in memory and rooms expire after six hours while inactive. On Vercel, room state is shared through Redis and room-changing requests refresh an eight-hour storage TTL. There is no account identity, persistent global leaderboard, daily challenge, or anti-cheat system. The scoreboard ranks players only within the current room. Do not use this prototype for sensitive information or high-stakes competition.

## Playtest checklist

- How quickly do players understand the vote and each modifier?
- Do movement, collisions, and reaching the exit feel fair?
- Is 40 seconds long enough, and does voting feel brisk?
- Do accumulated modifiers make the final round exciting or confusing?
- Is the live leaderboard and score breakdown clear?
- Are reconnects, stale rooms, or mobile controls a problem?

The first follow-up improvement should target the clearest problem observed in a multi-player session.

## Roadmap

1. Playtest with a group and improve the core round loop from observed feedback.
2. Add seeded daily challenges with shareable links.
3. Add device-saved personal bests, then a persistent daily leaderboard with score validation.
4. Add room recovery and durable storage if rooms need to survive server restarts.
