# EdenTrack — Daily Workflow Cheat Sheet

You have the project on **two machines**, kept in sync via GitHub:

- **GitHub (cloud):** https://github.com/edentrack/private
- **Mac mini:** `/Users/great/Downloads/project 4`
- **Laptop:** `~/Documents/edentrack`

## Golden Rule

> Pull **before** you start. Push **when** you finish.

---

## Starting work on a machine

```bash
# Mac mini
cd "/Users/great/Downloads/project 4"

# OR Laptop
cd ~/Documents/edentrack
```

Then always:

```bash
git pull
```

Run the app:

```bash
npm run dev
```

(Opens at http://localhost:5173)

---

## Saving & syncing your changes

After you've made edits and tested them:

```bash
git add .
git commit -m "short description of what changed"
git push
```

That uploads to GitHub. Now the other machine can `git pull` to get them.

---

## Useful commands

| What you want                          | Command                                      |
|----------------------------------------|----------------------------------------------|
| See what files you've changed          | `git status`                                 |
| See the actual code changes            | `git diff`                                   |
| See history of commits                 | `git log --oneline -20`                      |
| Undo uncommitted changes in a file     | `git checkout -- path/to/file`               |
| Throw away ALL uncommitted changes     | `git reset --hard` (careful, no undo)        |
| Install new npm package                | `npm install <package-name>`                 |
| Build production bundle                | `npm run build`                              |

---

## Environment file (`.env.local`)

- Contains Supabase keys. **Never** commit it (it's already in `.gitignore`).
- If it's missing on a machine, copy it manually from the other machine with:
  ```bash
  cat .env.local
  ```
  then paste into `nano .env.local` on the other side.

---

## Things to avoid

- ❌ Editing the **same file** on both machines without pushing/pulling in between (causes merge conflicts).
- ❌ `npm audit fix --force` — can break dependencies.
- ❌ Committing `.env.local`, `node_modules/`, or `dist/`.
- ❌ Force-pushing (`git push --force`) unless you know exactly why.

---

## If you hit a merge conflict

Git will mark the conflicting file with `<<<<<<<`, `=======`, `>>>>>>>` lines. Easiest fix:

1. Open the file, pick which version you want, delete the markers.
2. `git add <the-file>`
3. `git commit`
4. `git push`

Or ask Cursor/Claude: "resolve the merge conflict in <filename>".

---

## Working with AI editors

Both Cursor and Claude Code work identically on either machine — they just edit files locally. The workflow is the same:

1. `git pull`
2. Let the AI make changes.
3. Test with `npm run dev`.
4. `git add . && git commit -m "..." && git push`.

You can even switch machines mid-feature — just commit + push first, then pull on the other side.

---

## First-time setup on a new machine (reference)

```bash
# 1. Install tools
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
brew install git gh node

# 2. Sign in to GitHub
gh auth login   # GitHub.com → HTTPS → Yes → Web browser

# 3. Clone + install
cd ~/Documents
git clone https://github.com/edentrack/private.git edentrack
cd edentrack
npm install

# 4. Create .env.local (paste from other machine)
nano .env.local

# 5. Run
npm run dev
```
