# Bacup — URLs checklist (Supabase + Google Cloud)

Use **HTTPS** everywhere for production. Fill in the three values below once, then copy each list.

---

## Step 0 — Write these down (from your dashboards)

| What | Where to find it | Your value |
|------|------------------|------------|
| **A. Supabase project ref** | Supabase → **Project Settings** (gear) → **API** → **Project URL** looks like `https://abcdefgh.supabase.co` → the part **`abcdefgh`** is your ref | `________________` |
| **B. Vercel app hostname** | Vercel → your project → **Domains** or deployment URL, e.g. `bacup-3.vercel.app` (no `https://`) | `________________` |
| **C. Local dev port** | Usually `3000`. If you use another port (e.g. 3010), use that below everywhere it says `localhost`. | `________________` |

In the lists below, replace:

- `YOUR_SUPABASE_REF` → value **A**
- `YOUR_VERCEL.app` → value **B** (full hostname like `bacup-3.vercel.app`)
- `YOUR_PORT` → value **C** (e.g. `3000`)

---

## 1) Supabase — Authentication → URL configuration

Open: **Supabase Dashboard** → **Authentication** → **URL Configuration**

### Site URL (one field)

Paste **exactly** (production):

```text
https://www.thebacup.com
```

*(For testing only on Vercel before the custom domain works, you can temporarily set Site URL to `https://YOUR_VERCEL.app` — then change back to `www.thebacup.com` when the domain is live.)*

### Redirect URLs — add **each line** as its own entry (“Add URL”)

After replacing placeholders:

```text
https://www.thebacup.com/auth/callback
https://thebacup.com/auth/callback
https://YOUR_VERCEL.app/auth/callback
http://localhost:YOUR_PORT/auth/callback
http://127.0.0.1:YOUR_PORT/auth/callback
```

**Important:** These are for your **website** after Supabase finishes Google login — **not** the `supabase.co/auth/v1/callback` URL (that one goes in **Google**, below).

Click **Save** if the UI asks.

---

## 2) Google Cloud — OAuth 2.0 Client (Web application)

Open: [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → Application type **Web application**.

Create **one** Web client. You will paste **Client ID** and **Client secret** into:

- **Supabase** → Authentication → Providers → **Google**
- **Vercel** → Environment variables → `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Authorized JavaScript origins — add each

After replacing placeholders:

```text
https://www.thebacup.com
https://thebacup.com
https://YOUR_VERCEL.app
http://localhost:YOUR_PORT
```

### Authorized redirect URIs — add each

After replacing `YOUR_SUPABASE_REF` and `YOUR_VERCEL.app` and `YOUR_PORT`:

```text
https://YOUR_SUPABASE_REF.supabase.co/auth/v1/callback
https://www.thebacup.com/api/integrations/google/callback
https://thebacup.com/api/integrations/google/callback
https://YOUR_VERCEL.app/api/integrations/google/callback
http://localhost:YOUR_PORT/api/integrations/google/callback
```

**Why two kinds of URLs?**

| URL ends with | Purpose |
|---------------|---------|
| `…supabase.co/auth/v1/callback` | **“Sign in with Google”** (Supabase Auth). Google sends the user here first. **Required.** |
| `…/api/integrations/google/callback` | **Gmail & Calendar** inside Bacup. **Required** if you use those features. |

Do **not** put `https://YOUR_VERCEL.app/auth/callback` in Google’s redirect list — that is **not** where Google sends users for Supabase login.

Click **Save**.

---

## 3) Vercel — Environment variables (not URLs, but required)

**Vercel** → Project → **Settings** → **Environment Variables** → add for **Production** (and **Preview** if you use previews):

| Name | Value source |
|------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → **anon public** key |
| `NEXT_PUBLIC_APP_URL` | `https://www.thebacup.com` |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials → your Web client → **Client ID** |
| `GOOGLE_CLIENT_SECRET` | Same → **Client secret** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → **service_role** (server only; never in browser) |

Redeploy after changing variables.

---

## 4) Vercel — Domains (fixes “404” on thebacup.com)

**Vercel** → Project → **Settings** → **Domains**:

- Add **`www.thebacup.com`** and **`thebacup.com`**.
- Follow Vercel’s DNS instructions at your domain registrar (A/CNAME records).
- The app is configured to redirect **`thebacup.com` → `https://www.thebacup.com`** once traffic hits Vercel.

If **`thebacup.com`** is not added in Vercel or DNS is wrong, you will see **404** on the apex domain.

---

## 5) Supabase — Enable Google provider

**Supabase** → **Authentication** → **Providers** → **Google** → enable → paste the **same** Client ID and Client secret as in Vercel → Save.

---

## Quick copy block (example with fake values)

If your ref is `abcdxyz123`, Vercel is `bacup-3.vercel.app`, port `3000`:

**Supabase Redirect URLs:**

```text
https://www.thebacup.com/auth/callback
https://thebacup.com/auth/callback
https://bacup-3.vercel.app/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

**Google → Redirect URIs:**

```text
https://abcdxyz123.supabase.co/auth/v1/callback
https://www.thebacup.com/api/integrations/google/callback
https://thebacup.com/api/integrations/google/callback
https://bacup-3.vercel.app/api/integrations/google/callback
http://localhost:3000/api/integrations/google/callback
```

**Google → JavaScript origins:**

```text
https://www.thebacup.com
https://thebacup.com
https://bacup-3.vercel.app
http://localhost:3000
```

Replace `abcdxyz123` / `bacup-3` / `3000` with yours.

---

## Order to do things (recommended)

1. Create **Google** OAuth Web client → copy ID + secret.  
2. Paste **all Google URLs** (origins + redirect URIs) → Save.  
3. Set **Supabase** Site URL + **all Redirect URLs** → Save.  
4. Turn on **Google** in Supabase with ID + secret.  
5. Set **Vercel** env vars + **Domains** → Redeploy.  

If anything still fails, check **Vercel → Deployment → Logs** and the browser error text (screenshot helps).
