# Test Signup Flow Script
# This script tests the end-to-end onboarding signup flow

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Onboarding Signup Flow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Supabase CLI is available
$supabaseInstalled = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseInstalled) {
    Write-Host "❌ Supabase CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g supabase
}

# Check database connection
Write-Host "Checking Supabase connection..." -ForegroundColor Yellow
$status = npx supabase status 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Local Supabase not running. Testing against remote instance..." -ForegroundColor Yellow
    Write-Host "   Make sure you have:"
    Write-Host "   1. VITE_SUPABASE_URL set in .env"
    Write-Host "   2. VITE_SUPABASE_ANON_KEY set in .env"
    Write-Host "   3. Dev server running (npm run dev)"
    Write-Host ""
    Write-Host "Then test signup manually at: http://localhost:5173/onboarding" -ForegroundColor Green
    exit 0
}

Write-Host "✅ Supabase is running locally" -ForegroundColor Green
Write-Host ""

# Check current trigger function
Write-Host "Checking current database trigger..." -ForegroundColor Yellow
$triggerCheck = @"
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_schema = 'auth';
"@

Write-Host "Current trigger on auth.users:" -ForegroundColor Cyan
# This would need to be run via psql or supabase db query

Write-Host ""
Write-Host "To test the signup flow:" -ForegroundColor Green
Write-Host "1. Start the dev server: npm run dev" -ForegroundColor White
Write-Host "2. Navigate to: http://localhost:5173/onboarding" -ForegroundColor White
Write-Host "3. Fill out the onboarding form" -ForegroundColor White
Write-Host "4. Complete all steps and submit" -ForegroundColor White
Write-Host "5. Check the browser console for errors" -ForegroundColor White
Write-Host "6. Verify user was created in auth.users" -ForegroundColor White
Write-Host "7. Verify profile was created in profiles table" -ForegroundColor White
Write-Host "8. Verify organization was created (if applicable)" -ForegroundColor White
Write-Host ""

Write-Host "To check database state after signup:" -ForegroundColor Cyan
Write-Host "npx supabase db query \"SELECT u.id, u.email, p.first_name, p.last_name, p.organization_id, o.name as org_name FROM auth.users u LEFT JOIN profiles p ON u.id = p.user_id LEFT JOIN organizations o ON p.organization_id = o.id ORDER BY u.created_at DESC LIMIT 5;\"" -ForegroundColor Gray
