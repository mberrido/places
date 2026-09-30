# Places

A household tracker for hotels, restaurants and places to visit. Places are
saved from Google search (or by hand), enriched with Google data (rating,
photos, hours, website), and browsed on the phone.

Next.js 16 (App Router) · SQLite via Drizzle · Tailwind 4 · installable PWA.

## Status

| Stage | What | State |
|---|---|---|
| 1 | Data model, login, add via Google Autocomplete, enrichment, list + detail | ✅ |
| 2 | Filters (category, distance, rating, status) and map view | ✅ |
| 3 | Instagram paste-a-link: OG fetch → Claude extraction → Places match → confirm | ✅ |
| 4 | iOS Shortcut ingest endpoint, screenshot fallback, multi-place posts | ✅ ready to test |
| 5 | "When" filter using opening hours, hotel booking links, "near me" | |
| 6 | Natural-language filter, Docker on the NAS, backups | |

## Run locally

Needs Node 20.9+.

```sh
npm install
cp .env.example .env.local     # then fill in APP_PASSWORD and GOOGLE_PLACES_API_KEY
npm run dev                    # http://localhost:3003
```

- The database is created at `./data/places.db` on first request, and schema
  migrations in `drizzle/` run automatically on start.
- Without `GOOGLE_PLACES_API_KEY` the app still works: Add falls back to manual
  entry and places show without Google data.
- To try it on your iPhone on the same Wi-Fi:
  open `http://<your-mac's-LAN-IP>:3003`. (Location features need HTTPS, so
  "near me" only works on localhost or once deployed.)

To test in the Mac browser at `http://127.0.0.1:3003` or from a phone, those
hosts are allowed in `allowedDevOrigins` in `next.config.ts`. Without that,
Next blocks the dev scripts and buttons silently do nothing.

Useful scripts: `npm run typecheck`, `npm run lint`, `npm run db:generate`
(after editing `src/db/schema.ts`, creates a new migration in `drizzle/`).

### Environment variables

See [`.env.example`](.env.example). All keys are read on the server only and never sent to the browser.

| Variable | Required | Notes |
|---|---|---|
| `APP_PASSWORD` | first run | Password for the first (admin) account. Only read until that account has one; after that, change it in Settings. |
| `HOUSEHOLD_MEMBERS` | no | e.g. `Mal,Sam`: the first account's members and name. First run only. |
| `SESSION_SECRET` | no | Cookie signing key. If blank, one is generated into the data folder. |
| `GOOGLE_PLACES_API_KEY` | for Google features | See below. |
| `ANTHROPIC_API_KEY` | stage 3+ | Instagram caption / screenshot extraction. |
| `INGEST_TOKEN` | no | The first account's Shortcut token (first run only). Each account's token is in Settings. |
| `META_OEMBED_TOKEN` | no | Instagram oEmbed, if you have a Meta app. |
| `DATABASE_PATH` | no | Defaults to `./data/places.db` (Docker: `/data/places.db`). |
| `BACKUP_DIR` | no | Nightly backups. Defaults to `data/backups` (Docker: `/backups`). |
| `BACKUP_KEEP` | no | How many nightly backups to keep (default 14). |
| `DISABLE_NIGHTLY` | no | `1` turns off the nightly backup and refresh job. |
| `PUID` / `PGID` | Docker | The DSM user/group that owns the data and backup folders. |

## Households, accounts and sharing

The app has **one account per household**. You and your partner share an
account (each picks their own name at login, recorded as "added by"); a
friend's household gets its own. Each account has its own places,
categories, tags, inbox and iOS Shortcut token, and can't see anyone else's.

- **Logging in:** account name (e.g. `home`), password, and your name.
- **The first account** is the admin. It's created automatically: on an
  existing install it owns everything saved so far, and its password comes
  from `APP_PASSWORD` the first time. Its login starts as `home`; rename it
  in Settings → Your household.
- **Adding a household** (admin): Settings → Accounts → *Add a household*:
  a name (what others see, e.g. "Dave & Jo"), a login (e.g. `dave`) and a
  password. Send them the web address, login and password; they can change
  the password and names in their own Settings. The admin can also reset
  a household's password, which logs them out everywhere.
- **Sharing:** on any place, **Share with…** picks one or more households
  and an optional note. It lands in their **Inbox** as "Mal shared The Pig".
  They choose a category and **Save to our list** (they get their own copy,
  with fresh Google data), or **Not for us**. Your place page shows who you
  shared it with and whether they saved it.
- **Costs:** every household uses this server's Google and Claude keys.
  Google usage in Settings (admin only) is the total for all households.

## Browsing, filters and the map

- Filters live in the URL, so any view can be bookmarked or added to the home
  screen, e.g. `/?cat=hotel&near=me&km=50` = hotels within 50 km of wherever
  you are. Params: `q`, `status`, `cat`, `near` (`me` or `lat,lng` + `nearName`),
  `km`, `rating`, `price`, `tags`, `when` (`today`, `weekend`, `nextweekend`,
  or `dates` with `from`/`to`), `sort` (`recent`/`distance`/`rating`), `view=map`.
- **Ask**: type a sentence in the search box ("hotel within 50km this weekend",
  "cheap lunch near Padstow tomorrow") and tap **Ask ✨** (or press Enter).
  Claude turns it into the normal filters, which then show as chips you can
  remove, with a one-line summary and **Undo**. Towns are placed on the map
  with Google's cheap location lookup.
- **When** hides places that are closed on every chosen day, using the cached
  Google opening hours. Places with no hours stay in the list marked *Hours
  unknown*, and ones open on only some of the days say so (*Sat only*,
  *Closed Sun*). Hotels are never filtered: the dates are passed to their
  booking links instead (a weekend means Friday and Saturday nights).
- Filtering runs in the browser over the whole (small) list, so it's instant
  and "near me" can use the phone's GPS. Location needs HTTPS or localhost.
- Rating and price filters hide places with no Google data. Distance filters
  hide places with no pin and say how many were hidden.
- The map uses [MapLibre](https://maplibre.org) with free
  [OpenFreeMap](https://openfreemap.org) tiles (no key, nothing sent to
  Google). `npm run dev`/`build` copy MapLibre's worker into
  `public/vendor/` first (see `scripts/copy-maplibre-worker.mjs`).

## Adding from Instagram

**Add → From Instagram** (or the **Inbox** tab): paste a post or reel link, or
the caption text itself. Each paste becomes an inbox item that is processed in
the background:

1. **Fetch.** The server reads the post page's Open Graph tags (caption,
   account, image) the way link previews do. If `META_OEMBED_TOKEN` is set,
   Instagram's oEmbed API is tried next. Only `instagram.com` post/reel links
   and Instagram's own image CDNs are ever fetched.
2. **Extract.** The caption, account and image go to Claude (`claude-opus-5-5`,
   structured output), which returns the specific places mentioned, each with
   a category, a confidence and a Google search query. Round-up posts return
   several places.
3. **Match.** Each place is looked up with Google Text Search (top 3).
4. **Confirm.** The inbox shows each place with its Google matches: tick,
   pick the right match (or "none of these"), adjust the category, save.

Profile links work too (e.g. `instagram.com/the_pig_hotels`): the account
itself is treated as the place, and a group's branches are offered so you can
tick several.

The Instagram link and caption are stored with every place saved this way.
If Instagram returns nothing useful, the item asks you to paste the caption or
**upload a screenshot**. Screenshots can also be used from the start (Add →
From Instagram → Upload a screenshot). They're shrunk in the browser, normalised
by the server (long edge 1568px, JPEG), read by Claude, and deleted once the
item is saved or dismissed.

Other ways in:

- **Desktop bookmarklet**: Settings → Share to Places → drag "📍 Save to
  Places" to the bookmarks bar. Click it on an Instagram page and the link
  opens in the app, ready to go.
- **Android**: the installed app appears in the share sheet (Web Share Target).
- **iPhone**: the Shortcut below. iOS doesn't support share targets for web apps.

Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com)
→ API keys, and set `ANTHROPIC_API_KEY`. Each post costs roughly one Claude
request plus one Text Search per place found. Requests use server-side refusal
fallbacks (`fallbacks: "default"`), so a post a safety filter declines is retried
on another model rather than failing.

## Hotels and "near me"

- A hotel's page has **Check prices**, with dates (from the When filter, or the
  coming weekend), linking to Booking.com (name, town and dates filled in),
  Google Hotels (dates are best effort, since Google encodes them in an opaque
  token) and the hotel's own site. Hotels that only take direct bookings, like
  The Pig, aren't on Booking.com, which then just shows its home page.
- **Add → Near me** uses the phone's GPS and Google Nearby Search to list what's
  within 500 m (or 2 km), nearest first, filterable by food and drink, hotels,
  or things to do. Tap one to save it. It needs HTTPS (or localhost) for
  location, so on a phone it works once deployed.

## Google Cloud setup

Everything this app uses is part of **Places API (New)**: Autocomplete, Place
Details, Place Photos, Text Search and Nearby Search.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a
   project (e.g. "Places"), and **link a billing account** (Billing → My
   projects → ⋮ → Change billing). Without it every call fails with a vague
   "The caller does not have permission". Google requires billing,
   but each SKU has a free monthly allowance, which a household won't normally exceed.
2. **APIs & Services → Library**, search for **Places API (New)** and click
   **Enable**. (The older "Places API" isn't needed.)
3. **APIs & Services → Credentials → Create credentials → API key.** Then
   **Edit** the key:
   - **API restrictions → Restrict key →** tick only **Places API (New)**.
   - **Application restrictions:** don't pick *Websites (HTTP referrers)*: the
     server sends no referrer, so every call is refused. The key is only ever used from the server,
     so the tightest option is **IP addresses** with your home's public IP
     (your Mac and the NAS share it). If your ISP changes your IP now and
     then, leave this as **None** and rely on the API restriction plus the quotas below.
4. **Cap the spend.** In **APIs & Services → Places API (New) → Quotas**, lower the
   per-day limits for the requests you care about (e.g. Place Details to 200/day,
   Place Photos to 500/day), so a bug can't run up a bill. Then add a budget
   alert under **Billing → Budgets & alerts** (e.g. £5).
5. Put the key in `.env.local` (dev) or `.env` (NAS) as `GOOGLE_PLACES_API_KEY`.

**Settings → Google API usage** in the app shows how many calls it has made this
month for each SKU, compared with the approximate free allowance.

### How Google data is stored

Google's terms let us keep a `place_id` indefinitely, but other Places content
(ratings, hours, photos) should only be cached for a limited time. So:

- `places.google_place_id` is permanent.
- Ratings, hours, website, phone and photo references live in `google_cache`
  and are refreshed when you open a place whose data is older than 30 days (in
  the background, after the page has loaded), or when you tap
  **Refresh Google data**, and every night by the nightly job (see Backups).
- Photos are never stored. `/api/photos/…` fetches them from the Places Photo
  endpoint through the server (keeping the key private), and they're cached
  briefly in the browser and in memory.
- Search requests share a session token with the Details call that follows,
  so Google bills the whole search as one session. Previewing a place and then
  saving it costs one Details call, not two.

## Deploying to the Synology NAS (DS920+, DSM 7.2)

Same pattern as weekly-shop: one container from a GitHub-built image, SQLite
on a mounted folder, reachable at **`http://<nas-ip>:8421`** on your home
network, with DSM's reverse proxy giving it a public HTTPS address on your
synology.me name for use away from home. The login cookie is only marked
Secure when you come in over HTTPS, so the plain LAN address works too.
Location ("near me") and the iPhone home-screen app need the HTTPS address.

### 1. Folders

1. **Container Manager** installed (Package Center); this creates the `docker` shared folder.
2. In **File Station**: create `docker/places/data` and `docker/places/backups`.
   (To keep backups on a separate shared folder instead, create it and change
   the `/backups` volume in `docker-compose.yml`.)
3. Find your DSM user's uid/gid over SSH: `id` → e.g. `uid=1026 gid=100`.
   Both folders you created are already owned by that user.

### 2. Compose file and `.env`

The image is built by GitHub Actions on every push to `main`
(`.github/workflows/docker.yml`) and published as
**`ghcr.io/mberrido/places:latest`** (linux/amd64 for the DS920+). On the NAS
you only need two files in `/volume1/docker/places`:
[`deploy/docker-compose.yml`](deploy/docker-compose.yml) (as
`docker-compose.yml`) and a `.env` made from [`.env.example`](.env.example).

```sh
cd /volume1/docker/places
cp .env.example .env
openssl rand -base64 32      # paste as INGEST_TOKEN
vi .env && chmod 600 .env
```

Fill in `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, and `PUID`/`PGID`
from step 1. `APP_PASSWORD`, `HOUSEHOLD_MEMBERS` and `INGEST_TOKEN` only set
up the first account on an empty database. If you're bringing your Mac's
database across (below), your accounts come with it and these are ignored.
Leave `DATABASE_PATH` and `BACKUP_DIR` commented out (the image sets them).
Wrap values containing `$`, `#` or spaces in single quotes.

**Private repo?** The image is private too. Log the NAS in once: create a
GitHub token (classic) with only `read:packages`, then
`sudo docker login ghcr.io -u mberrido`.

### 3. Start it

- **GUI:** Container Manager → Project → Create → name `places`, path
  `/docker/places`, *Use existing docker-compose.yml* → Next → Done.
- **SSH:** `cd /volume1/docker/places && sudo docker-compose pull && sudo docker-compose up -d`

Check: open `http://<nas-ip>:8421` (or `curl -s http://127.0.0.1:8421/api/health`
→ `{"ok":true,…}`) and the
container shows **Healthy**. The database is created and migrated on first start.

**Bringing your local data across:** stop the container, copy your Mac's
`data/places.db` into `docker/places/data/` (via SMB), then start it again.
Also copy `data/.session-secret` if you want to stay logged in; otherwise
you just log in again. Accounts, passwords and Shortcut tokens are in the
database, so they come across too.

### 4. Public HTTPS (DSM reverse proxy)

1. **Control Panel → Login Portal → Advanced → Reverse Proxy → Create**
   - Source: **HTTPS**, hostname `places.<name>.synology.me`, port **443**, tick **Enable HSTS**.
   - Destination: **HTTP**, `localhost`, port **8421**.
   - **Custom Header** tab: **Create → WebSocket**, then add
     `X-Forwarded-For` = `$proxy_add_x_forwarded_for` and
     `X-Forwarded-Proto` = `$scheme`.
2. **Control Panel → Security → Certificate → Settings**: assign your
   `*.<name>.synology.me` certificate to the `places.` entry.
3. Router: TCP **443** forwarded to the NAS (already done for weekly-shop).
   Don't forward 8421 or port 80.
4. Open `https://places.<name>.synology.me` on each phone, log in, then
   **Share → Add to Home Screen**.
5. Update the iOS Shortcut's URL to `https://places.<name>.synology.me/api/ingest`.
6. Optional: tighten the Google key's application restriction to your home's
   public IP now that all calls come from the NAS.

The login is protected by the password, a lockout after 5 failures per IP
per 15 minutes (the app reads the real client IP from `X-Forwarded-For`),
`Secure`/`HttpOnly`/`SameSite=Lax` cookies and HSTS. The Shortcut endpoint has
its own lockout for wrong tokens.

**If logging in or saving fails behind the proxy** ("Invalid Server Actions
request" in the container log), DSM isn't passing the original host through.
Add a custom header `X-Forwarded-Host` = `$host` to the reverse-proxy rule.

### 5. Updates

Push to `main`. GitHub Actions typechecks, lints, builds and pushes a new
`latest`, then (if the `WATCHTOWER_URL` and `WATCHTOWER_TOKEN` repo secrets are
set, as for weekly-shop) asks Watchtower to pull it and restart the container.
Without Watchtower: `sudo docker-compose pull && sudo docker-compose up -d`.
Roll back by pinning an earlier `sha-…` tag in `docker-compose.yml`.
Schema changes in `drizzle/` are applied automatically on start.

### 6. Backups

- **Nightly snapshots:** after 03:00 each night the app writes
  `places-YYYY-MM-DD.db` to `docker/places/backups` using SQLite's online backup API
  (consistent even while the app is writing) and keeps the last 14. It catches up
  on start-up if the NAS was off at 03:00. Settings → Backups shows the latest
  and has **Back up now**.
- **Off-NAS copy:** add `docker/places` (the database, its nightly snapshots,
  `.env` and the session secret) to a **Hyper Backup** task, with client-side
  encryption on, since `.env` holds API keys.
- **Restore:**
  ```sh
  cd /volume1/docker/places
  sudo docker-compose stop
  cp backups/places-2026-10-01.db data/places.db
  rm -f data/places.db-wal data/places.db-shm
  sudo docker-compose start
  ```

The same nightly job refreshes Google data older than 30 days (up to 100
places a night) and clears inbox items that got stuck mid-processing.

## iOS Shortcut

The Shortcut adds **Save to Places** to the share sheet in Instagram (and
Photos, for screenshots). It POSTs to `/api/ingest` with the household token and
returns straight away; the post is read in the background and waits in the
**Inbox** for you to confirm.

You'll need the **endpoint** and **token** from Settings → Share to Places.
Each household has its own token, which decides whose inbox a share goes to,
so your friend builds (or imports) the Shortcut with *their* token.
The endpoint must be reachable from the phone: the public
`https://places.<name>.synology.me/api/ingest` once deployed, or
`http://<mac-ip>:3003/api/ingest` on home Wi-Fi while testing.

Build it once in the **Shortcuts** app, then share it to your wife's phone with
Share → Copy iCloud Link (edit the `by` value after she imports it):

1. **+** to create a shortcut and name it **Save to Places** (pick an icon).
2. Tap the **ⓘ** at the bottom → turn on **Show in Share Sheet**. Back in the
   editor, tap the top line (*Receive … from Share Sheet*) and select only
   **URLs**, **Text** and **Images**. Set *If there's no input* to **Get
   Clipboard**, so running it from the home screen sends a copied link.
3. Add **Get Type** (of *Shortcut Input*).
4. Add **If**: *Type* **is** `Image`.
   - Inside the If, add **Resize Image**: *Shortcut Input* to width **1600**
     (optional, but makes uploads quicker).
   - Add **Get Contents of URL**: the endpoint URL. Expand **Show More**:
     - Method: **POST**
     - Headers: `Authorization` = `Bearer <your token>`
     - Request Body: **Form** with fields `image` (**File**, value *Resized Image*)
       and `by` (**Text**, value your name).
5. In the **Otherwise** branch add another **Get Contents of URL**, set up the
   same way except the form fields are `input` (**Text**, value *Shortcut Input*)
   and `by` (**Text**, your name).
6. After **End If**, add **Get Dictionary Value**: *Value* for key `message`
   in *If Result*.
7. Add **Show Notification** with *Dictionary Value*.

To use it: in Instagram tap the share icon on a post (or **···** on a profile)
and choose **Save to Places**. If it isn't listed, scroll the share sheet's
action row to **More** / **Edit Actions** and add it to Favourites. For a post
that won't share a link, take a screenshot and share that from Photos.

Responses the notification may show: *Sent to the Places inbox*, *Already in
the Places inbox*, *Wrong token…* (check the header), or a reason the input was
rejected. Five wrong tokens from the same address lock it out for 15 minutes.

### `/api/ingest` reference

```
POST /api/ingest
Authorization: Bearer <INGEST_TOKEN>

multipart/form-data   input=<link or caption>  or  image=<file>,  by=<name> (optional)
application/json      {"input": "...", "by": "..."}
text/plain            the link or caption

→ 202 {"ok": true, "message": "Sent to the Places inbox", "id": 12}
→ 4xx {"ok": false, "message": "<why>"}
```
