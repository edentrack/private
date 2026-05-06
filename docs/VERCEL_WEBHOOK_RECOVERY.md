# Vercel webhook recovery

If a PR merge to `main` doesn't trigger an automatic Vercel deploy, the
GitHub → Vercel webhook is broken. This is what happened on the
`audit-polish-step1` deploy in May 2026 — Vercel had to be force-deployed
manually with `vercel --prod --force`.

## Diagnosis

1. GitHub → repo Settings → Webhooks. Find the row for `vercel.com`.
2. Click into it → **Recent Deliveries** tab.
3. If you see `503` / `404` / `timeout` for recent deliveries, the hook is dead.

## Recovery — option A (preferred, no re-auth)

Click the most recent failing delivery → **Redeliver**. If it succeeds, you're done.

If it keeps failing with the same status, go to option B.

## Recovery — option B (re-install Vercel GitHub app)

1. https://github.com/settings/installations → find Vercel.
2. Click **Configure** → scroll to repository access → either toggle the repo off and on, or **Uninstall** and reinstall.
3. After reinstall, push any small commit to `main` (or merge a draft PR) to verify the new webhook fires.
4. Cross-reference with `vercel project ls` — the project's git connection should still show `edentrack/private`.

## Recovery — option C (Vercel side)

1. https://vercel.com/{team}/edentrack/settings/git → confirm Production branch is `main` and the GitHub repo connection is healthy.
2. If the connection shows broken, click **Disconnect** then **Connect Git Repository** and re-link.
3. Vercel will register a fresh webhook on GitHub. Verify it appears in GitHub → repo → Settings → Webhooks.

## Manual deploy fallback

While the webhook is being fixed, deploys can be forced from the local repo:

```sh
cd /Users/greatadigwe/Documents/edentrack
vercel --prod --force
```

Confirm with the deploy URL Vercel prints. Hit `https://edentrack.app/species/catfish.jpg` — if it's a real channel catfish image (and not the eel-like clarias), the deploy is live.

## Prevention

The smoke-test workflow in `.github/workflows/smoke-test-prod.yml` runs every hour and fails if `https://edentrack.app/species/*.jpg` returns non-200 — which catches the case where the webhook silently broke after a merge. Watch the **Actions** tab for that workflow's status; a string of red runs after a merge is the signal that the webhook needs the recovery steps above.
