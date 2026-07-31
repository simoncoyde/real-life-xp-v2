# Real-Life XP v2 — setup

You only do this once. After that, updates publish themselves.

**Nothing here touches your current app.** Your existing link keeps working
exactly as it does now until you decide to switch.

---

## What changes for you

| | Now | After |
|---|---|---|
| Publishing an update | Download, rename to `index.html`, upload | Happens automatically |
| Where saves live | Only that one phone | Your account, any device |
| If Safari data is cleared | Everything gone | Nothing lost |
| Art and sound | Must be written as code | Real model and audio files |

---

## Step 1 — Make a new repository (5 min)

Use a **new** repo so your current app stays untouched.

1. Go to **github.com** → **New repository**
2. Name it `real-life-xp-v2`
3. Set it to **Public**
4. Click **Create repository**
5. Upload every file and folder from this project into it

> Keep the folder structure exactly as-is. `src` must stay a folder called
> `src`, `.github` must stay `.github`, and so on.

### ⚠️ The `.github` folder — read this

Folders whose name starts with a dot are **hidden by iPhone and by Mac
Finder**. `.github` is the folder that makes automatic publishing work, so if
it doesn't make it up, nothing will ever build.

**Check:** after uploading, look at your repo's file list. You should see a
folder called `.github`. If you don't, do this:

1. In your repo, click **Add file** → **Create new file**
2. In the filename box, type exactly:
   ```
   .github/workflows/deploy.yml
   ```
   (typing the slashes creates the folders for you)
3. Open `deploy.yml` from this project, copy **all** of it, paste it in
4. Click **Commit changes**

That works fine on a phone, and it's the reliable way to do it.

### Doing this on a phone

The rest of the upload is easier on a computer if you have access to one —
it's a one-time job. If you're on your iPhone: save the files with
**Share → Save to Files → On My iPhone** (not iCloud Drive), then upload from
there via **github.com → Add file → Upload files** in Safari.

---

## Step 2 — Turn on automatic publishing (1 min)

1. In the new repo → **Settings** → **Pages**
2. Under **Source**, choose **GitHub Actions** (not "Deploy from a branch")
3. Done

From now on, every change publishes itself. You'll see a green tick in the
**Actions** tab when a build succeeds, or a red X if something failed.

---

## Step 3 — Create the database (10 min)

This is what gives you logins and saves that follow people around.

1. Go to **supabase.com** → sign up (free)
2. **New project**
   - Name: `real-life-xp`
   - Database password: generate one and save it somewhere safe
   - Region: pick the one closest to you
3. Wait ~2 minutes for it to finish setting up
4. In the left sidebar → **SQL Editor** → **New query**
5. Open the file `supabase-setup.sql` from this project, copy **all** of it,
   paste it in, and press **Run**
6. It should finish with two rows showing `rowsecurity = true`. That means
   players' data is locked to their own account.

### Turn off email confirmation (optional, but easier to start)

**Authentication** → **Sign In / Providers** → **Email** → turn
**Confirm email** off. People can then sign up and play immediately. Turn it
back on later when you're ready for real users.

---

## Step 4 — Connect the two together (3 min)

1. In Supabase → **Project Settings** → **API**
2. Copy these two values:
   - **Project URL**
   - **anon / public** key — the long one labelled `anon`, **not** `service_role`
3. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
4. Click **New repository secret**, twice:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

> The `anon` key is **designed** to be public — it ends up in the app that
> runs on people's phones, and that's fine. What actually protects data is
> the security rules you ran in Step 3. Never put the `service_role` key
> anywhere; that one is genuinely secret.

---

## Step 5 — Build it

1. Go to the **Actions** tab in your repo
2. Click **Build and deploy** → **Run workflow**
3. Wait ~2 minutes
4. Green tick = live. Your link is shown under **Settings → Pages**

If you get a red X, open it and send me what the failed step says.

---

## What this costs

**Nothing.** Right now, today, and for a long time.

| | Free allowance | What that means for you |
|---|---|---|
| Publishing your app | Unlimited | Free forever for a public project |
| Player accounts | 50,000 people signing in per month | You will not get near this for ages |
| Database size | 500 MB | Thousands of players' saves |
| Data transfer | 5 GB a month | Plenty for an app this size |

You'd only start paying once the app is genuinely popular — which is a good
problem to have. Roughly $25/month at that point.

### The one catch, already handled

Free databases **switch themselves off after 7 days with no activity**. Your
data stays safe, but the app stops working until someone turns it back on.

You'd hit this the first time you and Mia both had a quiet week.

There's a second automatic job included (`keep-awake.yml`) that pokes the
database every 3 days so it never falls asleep. It costs nothing and you
don't have to do anything — it just runs.

> One thing to know: GitHub switches off scheduled jobs if a project sits
> completely untouched for 60 days. If you ever come back after a long break
> and the app is offline, go to **Actions** → **Keep database awake** →
> **Run workflow**, and it wakes back up.

---

## If something goes wrong

Your old app is still live and still works. Nothing about this can break it.

Common issues:

- **Red X on "Install dependencies"** — usually a typo in `package.json`
- **Page loads blank** — the `base` path is wrong; tell me your repo name
- **"Cloud saves aren't set up yet"** — the two secrets in Step 4 are missing
  or misspelled. The app still works, just offline-only
- **Can't sign up** — email confirmation is on and the email went to spam

---

## What you get once it's running

- **Accounts** — email and password, with password reset
- **Saves in the cloud** — sign in on any device and your progress is there
- **Offline still works** — the phone is still the working copy, so a gym
  with no signal changes nothing. It syncs when signal returns
- **Nothing is ever lost** — if two devices disagree, the one with more
  logged work wins, and the other is kept as a backup rather than deleted
- **Room for real assets** — 3D model files, audio files, textures
- **Groundwork for social** — the `profiles` table already holds name, XP
  and streak, which is what a leaderboard or friends list reads from
