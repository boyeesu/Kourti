# Dev Environment Issue - Root Cause Analysis

## Problem Summary
The development server cannot start because `@vitejs/plugin-react` package is not being installed properly in `node_modules`, despite being listed in `package.json`.

## Root Cause
**Windows Path Length Limitation**: The project path is very long:
```
C:\Users\Daniel.Esuga\Kouti Legal Main Repo\kouti-legal-hub-41\node_modules\@vitejs\plugin-react
```

Windows has a 260-character path length limit by default, and npm may fail silently when trying to install packages in deeply nested paths.

## Error Message
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@vitejs/plugin-react' imported from 
C:\Users\Daniel.Esuga\Kouti Legal Main Repo\kouti-legal-hub-41\node_modules\.vite-temp\vite.config.ts.timestamp-...
```

## Solutions

### Solution 1: Enable Long Path Support (Recommended)
1. Open PowerShell as Administrator
2. Run: `New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force`
3. Restart your computer
4. Then run: `npm install` and `npm run dev`

### Solution 2: Move Project to Shorter Path
Move the project to a shorter path like:
- `C:\dev\kouti-legal-hub-41`
- `C:\projects\kouti-legal`

Then:
```powershell
cd C:\dev\kouti-legal-hub-41
npm install
npm run dev
```

### Solution 3: Use Yarn or pnpm
These package managers sometimes handle long paths better:

**Using Yarn:**
```powershell
npm install -g yarn
yarn install
yarn dev
```

**Using pnpm:**
```powershell
npm install -g pnpm
pnpm install
pnpm dev
```

### Solution 4: Manual Package Installation
If the above don't work, try:
```powershell
cd "C:\Users\Daniel.Esuga\Kouti Legal Main Repo\kouti-legal-hub-41"
npm install @vitejs/plugin-react@4.7.0 --save-dev --force
Remove-Item -Recurse -Force node_modules\.vite-temp -ErrorAction SilentlyContinue
npm run dev
```

## Verification
After applying a solution, verify:
1. Check if package exists: `Test-Path "node_modules\@vitejs\plugin-react\package.json"`
2. Should return `True`
3. Try starting server: `npm run dev`
4. Should see: `VITE v7.x.x  ready in xxx ms` and `➜  Local:   http://localhost:8080/`

## Additional Notes
- The app has development fallbacks for Supabase, so environment variables are optional for local dev
- The server should start on port 8080 (configured in vite.config.ts)
- If you see environment variable warnings, they're non-blocking in development mode
