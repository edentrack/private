# 🤖 AI Assistant & Voice Commands Setup Guide

## AI Assistant Setup

### Prerequisites
- Supabase project with Edge Functions enabled
- OpenAI API account (get key from https://platform.openai.com/api-keys)

### Step 1: Add OpenAI API Key to Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add a new secret:
   - **Name**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key (starts with `sk-...`)

### Step 2: Configure AI Settings

Add these environment variables in Supabase Edge Functions:

1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add secrets:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `AI_ENABLED` - Set to `true` (or omit, defaults to true)
   - `OPENAI_MODEL` - Optional, defaults to `gpt-4o-mini` (recommended for cost)

### Step 3: Deploy Edge Function

The `ai-chat` function is already in your codebase at:
```
supabase/functions/ai-chat/index.ts
```

Deploy it:
```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy ai-chat
```

### Step 4: Test AI Assistant

1. Open your app
2. Navigate to **AI Assistant** (in navigation menu)
3. You should see the chat interface
4. Try asking: "Analyze my farm's performance"

### Troubleshooting

**Error: "AI features are not yet configured"**
- Check that `OPENAI_API_KEY` is set in Supabase secrets
- Verify the secret name is exactly `OPENAI_API_KEY`

**Error: "AI service temporarily unavailable"**
- Check your OpenAI API key is valid
- Verify you have credits in your OpenAI account
- Check Supabase Edge Function logs

**Error: "Rate limit reached"**
- Default limit is 10 requests per minute per user
- Wait a minute and try again
- Or increase `MAX_REQUESTS_PER_MINUTE` in the function

## Voice Commands Setup

### How It Works

Voice commands use the **Web Speech API** (built into modern browsers). No additional setup required!

### Supported Browsers

✅ **Fully Supported:**
- Chrome 90+ (Desktop & Mobile)
- Edge 90+
- Safari 14+ (iOS 14.7+)
- Opera 76+

❌ **Not Supported:**
- Firefox (no Web Speech API support)
- Older browsers

### Supported Languages

Voice commands work in these languages:

1. **English** (`en-US`)
   - "Log 50 eggs"
   - "Complete feeding"
   - "5 dead birds"

2. **French** (`fr-FR`)
   - "50 œufs"
   - "Alimentation terminée"
   - "5 morts"

3. **Spanish** (`es-ES`)
   - "50 huevos"
   - "Alimentación completada"
   - "5 muertos"

4. **Portuguese** (`pt-PT`)
   - "50 ovos"
   - "Alimentação concluída"
   - "5 mortos"

5. **Swahili** (`sw-KE`)
   - "Mayai 50"
   - "Kulisha kumekamilika"
   - "Vifo 5"

### How to Use Voice Commands

1. **Enable Voice Commands:**
   - Go to **Smart Dashboard** (or any page with voice support)
   - Click the microphone button 🎤
   - Grant microphone permission when prompted

2. **Speak Your Command:**
   - Wait for the microphone to turn red (listening)
   - Speak clearly in your selected language
   - The command will be processed automatically

3. **Supported Commands:**
   - **Log Eggs**: "Log [number] eggs" / "50 œufs" / "Mayai 50"
   - **Complete Task**: "Complete feeding" / "Alimentation terminée"
   - **Log Mortality**: "[number] dead" / "5 morts" / "Vifo 5"

### Troubleshooting Voice Commands

**Microphone not working:**
- Check browser permissions (Settings → Privacy → Microphone)
- Use Chrome or Safari (best support)
- Make sure you're on HTTPS (required for microphone access)

**Commands not recognized:**
- Speak clearly and slowly
- Use exact phrases from the supported commands
- Check that your language matches the app language setting

**"Voice commands not supported":**
- Update your browser to the latest version
- Use Chrome, Edge, or Safari
- Voice commands require modern browser

## Testing Checklist

### AI Assistant
- [ ] OpenAI API key added to Supabase
- [ ] Edge function deployed
- [ ] Can access AI Assistant page
- [ ] Can send messages
- [ ] Receives responses
- [ ] Quick actions work (if provided)

### Voice Commands
- [ ] Microphone permission granted
- [ ] Can activate voice input
- [ ] Commands recognized in English
- [ ] Commands recognized in French
- [ ] Commands trigger correct actions
- [ ] Works on mobile device

## Cost Considerations

### OpenAI API Costs

**Model: gpt-4o-mini** (Recommended)
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens
- Average query: ~500 tokens
- **Cost per query: ~$0.0003** (very cheap!)

**Monthly Estimate:**
- 100 users × 50 queries/month = 5,000 queries
- 5,000 × $0.0003 = **$1.50/month**

**Model: gpt-4** (More expensive)
- Input: $5 per 1M tokens
- Output: $15 per 1M tokens
- **Cost per query: ~$0.01**

### Rate Limiting

Default: **10 requests per minute per user**
- Prevents abuse
- Keeps costs low
- Fair usage for all users

To change: Edit `MAX_REQUESTS_PER_MINUTE` in `supabase/functions/ai-chat/index.ts`

## Security Notes

1. **API Key Security:**
   - Never commit API keys to git
   - Use Supabase secrets (encrypted)
   - Rotate keys if compromised

2. **Rate Limiting:**
   - Prevents abuse
   - Protects against DDoS
   - Fair usage enforcement

3. **User Authentication:**
   - All AI requests require authentication
   - Farm data is isolated per user
   - RLS policies enforced

## Next Steps

1. ✅ Add OpenAI API key to Supabase
2. ✅ Deploy ai-chat edge function
3. ✅ Test AI Assistant
4. ✅ Test voice commands
5. ✅ Monitor costs in OpenAI dashboard
6. ✅ Adjust rate limits if needed

---

**Need Help?** Check Supabase Edge Function logs or OpenAI API dashboard for errors.












