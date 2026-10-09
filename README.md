# Coach-Connect — Intelligent Stall Recommendation for Rail Travel

Passenger website for discovering station stalls, menus and prices while
travelling by train. Passengers can browse catalogue information only; the
website does not support purchasing or ordering.

The core rule of the product: **GPS near a station is not proof of travel.**
Coach-Connect verifies a journey on the server (route + movement + schedule +
location) and only then unlocks stall recommendations for the station the train
is actually approaching.

---

## What's in the box

| Part | Tech |
| --- | --- |
| `client/` — passenger website | React 19, Vite 6, TypeScript, react-router-dom 7, Supabase JS |
| `server/` — API | Express 4, TypeScript (tsx), zod, helmet, rate limiting, Supabase JS |
| `supabase/` — database | SQL migrations + DEMO seed data |

Passenger flow:

1. **Login** — phone OTP (Supabase) or a clearly-labelled demo session when
   Supabase is not configured.
2. **Start journey** — train number + coach + location → `POST /api/journey/verify`.
3. **Train mode** — verified journey shows current/next station, ETA, and a
   transparent confidence breakdown (each signal, its score and its weight).
4. **Stalls at your next station** — `GET /api/stalls/next-station`, refreshed
   automatically every 60 s.
5. **Stall menus** — view stall details, item availability and menu prices.

---

## Quick start

```powershell
# 1. install everything (root, server, client)
npm run setup

# 2. run API + website together  →  API :4000, website :5173
npm run dev
```

Open <http://localhost:5173>, click **Start Journey**, then on the login page
choose **Continue in demo mode**.

Try the built-in demo route:

| Field | Value |
| --- | --- |
| Train number | `12951` (Mumbai Rajdhani, DEMO ROUTE) |
| Coach | `S1` |
| Location | allow it — or verify while "near" a demo station |

Demo stations on the route: MMCT, BVI, VAPI, ST, BRC, RTM, KOTA, SWM, JP, AWR,
DEC, NDLS. Demo stalls exist at BVI, VAPI, ST, BRC, KOTA, JP and NDLS.

### Individual scripts

```powershell
npm run dev:api        # API only
npm run dev:web        # website only
npm run typecheck      # server + client tsc
npm run build          # client dist + server dist
npm start              # run the built API (serves client/dist if present)
```

---

## Configuration

Copy the examples and fill in real values — `.env` files are git-ignored:

```powershell
copy .env.example .env            # backend
copy client\.env.example client\.env   # frontend
```

**Nothing is required to run in demo mode.** The app works end-to-end with no
keys:

| Mode | Trigger | Behaviour |
| --- | --- | --- |
| Demo | `SUPABASE_URL` / `SUPABASE_ANON_KEY` empty | Local demo passenger, in-memory data, `is_demo` stalls and routes |
| Supabase | both Supabase values set | Phone OTP login and journeys stored in Postgres |
| RailKit | `RAILKIT_API_KEY` set | Live train routes/timetables from RailKit; otherwise demo routes |

Rules:

- `RAILKIT_API_KEY` lives **only** in `server/.env`. It is never sent to the
  browser.
- RailKit requests are disabled by default (`RAILKIT_ENABLED=false`) and, when
  enabled, are limited by the in-memory monthly budget
  (`RAILKIT_MONTHLY_REQUEST_LIMIT=50`). Cached and DEMO responses do not consume
  requests. The local counter resets on server restart; it is not production
  persistence.
- The browser only ever sees `VITE_*` values (public by design).
- In development Vite proxies `/api` → `http://localhost:4000`.

### Supabase setup (when you want real OTP login)

1. Create a project, enable the **Phone** auth provider.
2. Fill in `.env` (server) and `client/.env` (frontend) with `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` and the two `VITE_*` equivalents.
3. Run the SQL in `supabase/migrations/0001_initial_schema.sql`, then
   `0002_rls_policies.sql`, then `supabase/seed.sql` (SQL editor or
   `supabase db push`).
4. Restart `npm run dev`.

---

## API surface

Base URL: `http://localhost:4000/api` — every response uses the envelope
`{ ok: true, data }` or `{ ok: false, error }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service status + which modes are active |
| GET | `/trains/:trainNumber` | Normalised route/stoppage list (`source: railkit \| demo`) |
| GET | `/stations/:stationCode` | Station lookup |
| POST | `/journey/verify` | **The** verification endpoint (train + coach + GPS) |
| GET | `/journey/active` | Current journey |
| POST | `/journey/:id/end` | End a journey |
| GET | `/stalls/next-station?journeyId=` | Stalls at the next station (verified journey required) |
| GET | `/stalls/:id` · `/stalls/:id/menu` | Stall detail and menu |

### Verification (server-side only)

Weighted signals: corridor distance 0.40, movement 0.22, schedule 0.13, route
resolved 0.10, station proximity 0.10.

`verified = confidence >= VERIFY_THRESHOLD (0.65) AND corridor <= MAX_OFF_CORRIDOR_KM (12)`

The UI therefore always separates **"Location detected"** from
**"Journey verified"** — a location fix alone never unlocks stalls.

---

## Project layout

```
Coach-Connect/
├─ client/                passenger website
│  └─ src/
│     ├─ components/      ui/, layout/, journey/, stalls/
│     ├─ context/         Auth, Journey, Toast
│     ├─ hooks/           useGeolocation
│     ├─ lib/             api (fetch wrapper), supabase, format
│     └─ pages/           Landing, Login, Journey, Dashboard, Stalls,
│                         StallMenu, NotFound
├─ server/
│  └─ src/
│     ├─ routes/          health, train, station, journey, stall, profile
│     ├─ services/        railkit, trainRoute, journeyVerification,
│     │                   journeyProgress, stall
│     ├─ db/              repository (memory | supabase)
│     └─ data/            DEMO routes and stalls (is_demo = true)
├─ supabase/
│  ├─ migrations/         0001 schema, 0002/0003 RLS policies
│  └─ seed.sql            DEMO stalls + menus (idempotent)
└─ .env.example           all backend/frontend variables, documented
```

---

## Product rules baked into the code

- One active journey per passenger; re-verifying the same train/coach updates it.
- Stalls are only listed for the **next** station of a verified journey.
- Menus and prices are view-only; passengers cannot add items or place orders.
- DEMO data is flagged `is_demo` and always labelled in the UI, and can be turned
  off with `ENABLE_DEMO_DATA=false`.
- Existing order tables are preserved, but the passenger API and RLS access are
  disabled without deleting stored records.
