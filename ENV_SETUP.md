# Environment Variables Setup Guide

## Where to Set Environment Variables

### For Local Development

1. **Create a `.env` file** in the root of your project (same directory as `package.json`):
   ```
   kouti-legal-hub-41/
   ├── .env          ← Create this file
   ├── package.json
   ├── src/
   └── ...
   ```

2. **Copy the example file** and fill in your values:
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env`** with your actual credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_OPENAI_API_KEY=your-openai-key-here
   ```

### Important Notes

- ✅ The `.env` file is already in `.gitignore` - it won't be committed to git
- ✅ Never commit your `.env` file with real credentials
- ✅ The `.env.example` file is safe to commit (it has placeholder values)

## How to Get Your Values

### Supabase Credentials

1. Go to your Supabase project: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **API**
4. You'll find:
   - **Project URL** → This is your `VITE_SUPABASE_URL`
   - **anon/public key** → This is your `VITE_SUPABASE_ANON_KEY`

### OpenAI API Key (Optional)

1. Go to: https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Copy the key (you won't be able to see it again!)

## Current Behavior

### Development Mode
- If environment variables are **not set**, the app will use development fallbacks
- You'll see a warning in the console, but the app will still work
- This allows you to develop without setting up env vars immediately

### Production Mode
- Environment variables are **required**
- The app will **fail to start** if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing
- This prevents deploying without proper configuration

## For Different Environments

### Local Development
Create `.env` in the project root:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-key
```

### Production Deployment

The method depends on your hosting platform:

#### Vercel
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add each variable:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_OPENAI_API_KEY` (optional)

#### Netlify
1. Go to **Site settings** → **Environment variables**
2. Add each variable

#### Docker
Add to your `docker-compose.yml` or use `-e` flags:
```yaml
environment:
  - VITE_SUPABASE_URL=https://your-project.supabase.co
  - VITE_SUPABASE_ANON_KEY=your-key
```

#### Other Platforms
Most platforms have an environment variables section in their dashboard. Look for:
- Environment Variables
- Config Vars
- Secrets
- Settings → Environment

## Testing Your Setup

After setting up your `.env` file:

1. **Restart your dev server** (Vite needs to be restarted to pick up new env vars):
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

2. **Check the console** - you should NOT see warnings about missing environment variables

3. **Verify it's working** - the app should connect to your Supabase project

## Troubleshooting

### "Missing environment variables" warning
- Make sure your `.env` file is in the root directory (same level as `package.json`)
- Make sure variable names start with `VITE_` (required for Vite)
- Restart your dev server after creating/modifying `.env`

### Variables not working in production
- Make sure you've set them in your hosting platform's environment variables
- Make sure they're set for the correct environment (production, not just development)
- Rebuild/redeploy after adding variables

### Still using fallback values
- Check that your `.env` file has no typos in variable names
- Make sure there are no spaces around the `=` sign: `VITE_SUPABASE_URL=https://...` (not `VITE_SUPABASE_URL = https://...`)
- Restart your dev server




