# Siya Bhatkal — personal site

Three pages, built with [Astro](https://astro.build) and hosted free on [Vercel](https://vercel.com):

| Page | Address | File |
|---|---|---|
| Projects & work | `/` | `src/pages/index.astro` |
| About me | `/about` | `src/pages/about.astro` |
| Life lately | `/lately` | `src/pages/lately.astro` |

Live data:

- **Music** (On repeat card and chalkboard): `src/pages/api/music.ts` asks Last.fm for your latest song and top artist this month. It runs on Vercel's servers, so your API key stays private.
- **Workouts:** coming next (Apple Health via an iOS Shortcut).
- **Guestbook:** works in the visitor's browser for now; saving notes for everyone comes next (Supabase).

Other files: `public/site.js` (night mode + language picker), `public/lately.js` (music + guestbook), `public/travel/` (trip photos).

---

## Put it online (one time, about 15 minutes)

### 1. Install the tools on your laptop
- **Node.js** (LTS version): https://nodejs.org
- **Git**: https://git-scm.com/downloads
- **VS Code** (optional, for editing): https://code.visualstudio.com

### 2. Try it on your laptop
Unzip this folder, open a terminal inside it, and run:

```bash
npm install
npm run dev
```

Open http://localhost:4321. The music card will say "Taking a break" until you add your Last.fm details:

1. Copy `.env.example` to a new file named `.env`
2. Fill in your real `LASTFM_API_KEY` (and `LASTFM_USER=siya_bhatkal`)
3. Stop the server (Ctrl+C) and run `npm run dev` again

`.env` is ignored by Git, so your key never gets uploaded.

### 3. Upload it to GitHub
1. Create a new **public or private** repository on github.com called `personal-site` (don't add a README).
2. In the terminal, inside this folder:

```bash
git init
git add .
git commit -m "First version of my site"
git branch -M main
git remote add origin https://github.com/siyabhatkal2010/personal-site.git
git push -u origin main
```

### 4. Deploy on Vercel
1. Sign in at vercel.com with your GitHub account.
2. **Add New → Project**, pick `personal-site`, and click **Import**. Vercel detects Astro automatically.
3. Open **Environment Variables** before deploying and add:
   - `LASTFM_API_KEY` = your Last.fm API key
   - `LASTFM_USER` = `siya_bhatkal`
4. Click **Deploy**. In a minute you'll get an address like `personal-site-xyz.vercel.app`.
5. To get a nicer address: **Settings → Domains** → edit to something like `siyabhatkal.vercel.app` (if available).

From now on, every `git push` updates the live site automatically.

---

## Everyday edits
- **Text:** open the page file in `src/pages/` and edit the words directly in the HTML.
- **Drink, teams, stats:** search the page files for the text you want to change.
- **New trip photo:** drop a `.jpg` into `public/travel/`, then copy one of the trip cards in `about.astro` and point it at the new file.

Then:

```bash
git add .
git commit -m "Update drink of the week"
git push
```

## Troubleshooting
- **Music card says "Taking a break" on the live site:** check both environment variables in Vercel (Settings → Environment Variables), then **Deployments → ⋯ → Redeploy**. Also check that recent plays show up on your Last.fm profile.
- **Old song showing:** the music is cached for about 2 minutes, and iPhone scrobblers often only sync when their app is opened.
