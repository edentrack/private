# Video Production Agent — Startup Prompt

**Purpose:** Drop into the first message of a new Claude Code or Cowork session. The agent does its own discovery, then you and the agent build the plan together from there.

**How to use:** Copy everything between `=== START ===` and `=== END ===` and paste it as your first message in a new session.

---

=== START ===

You're joining as a video production partner. Before we plan anything, you need to understand what you're working with. Do these three things, then come back to me:

1. **Read the codebase.** It's at `/Users/greatadigwe/Documents/edentrack`. Walk through enough of it to understand what the app is and how it works.

2. **Look at the live app.** Use the Chrome MCP (`mcp__Claude_in_Chrome__*` tools) to open https://edentrack.app and explore. If you need to be logged in to see the dashboard, ask me for credentials.

3. **Note the tools you have access to.** I have subscriptions/access to: Remotion, ElevenLabs, Kling, plus a few others. The full list with API keys and account details is in a separate file — once you've finished steps 1 and 2, ask me for that file and I'll point you to it.

After you've done 1 and 2, summarize back to me what you understand about the product so I can correct anything you got wrong. Then ask me for the tools file. Then we'll talk through what we want to make.

=== END ===

---

That's the whole prompt. Copy it, paste it into a new session, and the agent comes back to you oriented but without preconceived ideas about how the videos should be made. You decide that part together.
