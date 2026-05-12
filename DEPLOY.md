# 🚀 Deploy Guide — Get Asciify Live

You have **two options**. Both are free.

|                    | GitHub Pages              | Vercel                     |
| ------------------ | ------------------------- | -------------------------- |
| **Setup time**     | ~5 min                    | ~3 min                     |
| **URL**            | `username.github.io/repo` | `repo-xxx.vercel.app`      |
| **Auto-deploy**    | ✅ (workflow already set)  | ✅ (built-in)               |
| **Custom domain**  | ✅ (free)                  | ✅ (free)                   |
| **Speed**          | Good                      | Faster (global CDN)        |
| **Best for**       | Simple GitHub-only repos  | Custom domains, analytics  |

**My recommendation: do both.** Push to GitHub once → both will auto-deploy.

---

## ✅ Step 0 — One-time setup (do these once)

### A. Get a GitHub account
1. Go to https://github.com and sign up (free)
2. **Username matters** — use a short clean one. Whatever you pick will appear in your URL like `yourname.github.io/asciify`

### B. Install Git if you haven't
- **Mac**: open Terminal, type `git --version`. If it asks to install Xcode tools, say yes.
- **Windows**: download from https://git-scm.com
- **Linux**: `sudo apt install git` (Debian/Ubuntu) or your distro equivalent

### C. Tell Git who you are (run in Terminal)
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

---

## 🐙 Step 1 — Push your code to GitHub

You already have a local repo (I set that up earlier). Now we need to push it.

### 1.1 Create a new repo on GitHub
1. Go to https://github.com/new
2. **Repository name**: `asciify`
3. **Description**: `Turn images into typographic art — mask reveals, hover effects, 17+ exports`
4. **Public** (required for free GitHub Pages)
5. **Do NOT check** "Add a README" or "Add a .gitignore" — your repo already has them
6. Click **Create repository**

GitHub shows you commands on the next page. Use the **"…or push an existing repository from the command line"** section.

### 1.2 Push your code (run in Terminal, inside your `roast` folder)
```bash
cd /Users/yashsaindane/Desktop/roast

# Add GitHub as the remote (replace YOURUSERNAME with your GitHub username)
git remote add origin https://github.com/YOURUSERNAME/asciify.git

# Make sure your branch is called "main" (modern default)
git branch -M main

# Push everything + tags
git push -u origin main --tags
```

GitHub will ask for credentials. Use a **Personal Access Token** instead of your password:
1. https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Note: `git push`
4. Expiration: 90 days (or longer)
5. Scopes: ✅ `repo`
6. Click **Generate**, copy the token (starts with `ghp_`)
7. Paste it as your password when Git asks

✅ **Refresh your GitHub repo page** — you should see all the files now.

---

## 🅰 Option A — Deploy with GitHub Pages (simplest)

### 2.A.1 Enable Pages
1. Go to your repo on GitHub → **Settings** (top tab)
2. Left sidebar → **Pages**
3. Under "Build and deployment", set **Source** to: **GitHub Actions**
4. Click **Save** (if there's a button)

### 2.A.2 Wait for the workflow to run
1. Go to the **Actions** tab in your repo
2. You'll see a workflow called **"Deploy to GitHub Pages"** running (yellow circle → green checkmark)
3. Takes about 1-2 minutes
4. When it's green, click the workflow run → you'll see a URL near the top

### 2.A.3 Visit your site
Your site is now live at:
```
https://YOURUSERNAME.github.io/asciify/
```

🎉 **Done.** Every `git push origin main` from now on will redeploy automatically.

---

## 🅱 Option B — Deploy with Vercel (faster + custom domains easier)

### 2.B.1 Sign up for Vercel
1. Go to https://vercel.com/signup
2. Click **Continue with GitHub** (easiest — uses your GitHub account)
3. Authorize Vercel to read your repos

### 2.B.2 Import the project
1. Vercel dashboard → click **Add New…** → **Project**
2. Find **asciify** in the list of your repos → click **Import**
3. **Framework Preset**: leave as **Other** (it'll auto-detect from `vercel.json`)
4. **Build settings** should already be filled from `vercel.json`:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Click **Deploy**

### 2.B.3 Wait ~30 seconds
Vercel will build + deploy. You'll see a confetti animation and a URL like:
```
https://asciify-yourname.vercel.app
```

🎉 **Done.** Every push to `main` redeploys automatically.

---

## 🌐 Step 3 (optional) — Custom domain

Both platforms let you add a custom domain for free.

### On Vercel
1. Project dashboard → **Settings** → **Domains**
2. Add your domain (e.g. `ascii.yourname.com`)
3. Vercel shows you DNS records to add at your domain registrar (Namecheap / Cloudflare / etc.)
4. Add them, wait ~5 minutes for propagation
5. HTTPS is automatic

### On GitHub Pages
1. Repo → **Settings** → **Pages**
2. Under "Custom domain", enter your domain
3. Add a CNAME DNS record pointing to `YOURUSERNAME.github.io`
4. Check "Enforce HTTPS" once DNS propagates

---

## 🔄 Step 4 — Updating the live site

Whenever you change something:
```bash
# In your project folder
git add -A
git commit -m "describe what you changed"
git push
```

That's it. GitHub Actions (for Pages) or Vercel (for Vercel) will rebuild and redeploy automatically within 1-2 minutes.

---

## 🖼 Step 5 — Fix the preview thumbnail URL (do this AFTER first deploy)

The Open Graph meta tags in `src/dashboard.html` are currently pointing to `https://chimmichangaaas.github.io/asciify/`. If your URL is different (e.g. a Vercel URL or custom domain), the preview won't load right when shared.

### Quick fix
Open `src/dashboard.html` and find these lines near the top (search for `chimmichangaaas.github.io`):

```html
<meta property="og:url" content="https://chimmichangaaas.github.io/asciify/" />
<meta property="og:image" content="https://chimmichangaaas.github.io/asciify/docs/og-image.png" />
<meta property="og:image:secure_url" content="https://chimmichangaaas.github.io/asciify/docs/og-image.png" />
<meta name="twitter:image" content="https://chimmichangaaas.github.io/asciify/docs/og-image.png" />
<link rel="canonical" href="https://chimmichangaaas.github.io/asciify/" />
<meta property="og:image:secure_url" content="https://chimmichangaaas.github.io/asciify/docs/og-image.png" />
<link rel="image_src" href="https://chimmichangaaas.github.io/asciify/docs/og-image.png" />
```

Replace `https://chimmichangaaas.github.io/asciify/` with your actual live URL, save, commit, push.

Same goes for the share URL helper in `src/dashboard.ts` — search for `PUBLIC_URL` and update it.

---

## 🐛 Troubleshooting

### `git push` says "Permission denied"
You used your password instead of a Personal Access Token. See Step 1.2 above to create one.

### GitHub Pages says "Page not found" after deploy
Wait 1-2 minutes after the workflow goes green. GitHub takes a moment to propagate. If it's still 404 after 5 min, check **Settings → Pages** and confirm Source is "GitHub Actions" (not "Deploy from branch").

### Vercel build fails with "Cannot find module"
You probably committed `node_modules` by accident. Delete it from the repo:
```bash
git rm -r --cached node_modules
git commit -m "Don't track node_modules"
git push
```

### My share link still shows the old URL after deploy
The share button uses a fallback URL when running on `file://` or `localhost`. After you deploy + open your live site, the share button will use the actual hosted URL. Just clear cache + revisit.

### Site loads but ASCII rendering is broken
Probably the `dist/code.js` isn't being served. Make sure your build output is committed:
```bash
ls dist/
# Should show: index.html, dashboard.html, code.js, ui.html, docs/
```

---

## 📋 Quick reference — your URLs

| What | Where |
|---|---|
| Local source code | `/Users/yashsaindane/Desktop/roast` |
| GitHub repo | `https://github.com/YOURUSERNAME/asciify` |
| GitHub Pages site | `https://YOURUSERNAME.github.io/asciify/` |
| Vercel site | `https://asciify-YOURUSERNAME.vercel.app` |
| Custom domain | (whatever you set) |

---

## ✅ Suggested order

1. Read this whole guide once (you're doing it!)
2. **Step 0** — GitHub account + Git installed
3. **Step 1** — push to GitHub
4. **Step 2.A** — enable GitHub Pages (you instantly get a URL)
5. **Step 5** — update OG meta tags to match your real URL
6. Push again → wait for redeploy → share your URL
7. (Optional) **Step 2.B** — also set up Vercel
8. (Optional) **Step 3** — custom domain

---

Need help? The most likely sticking point is the GitHub auth (Personal Access Token in Step 1.2). Take your time on that one.
