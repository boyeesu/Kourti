# Deploy signup performance optimization
# Run this script to apply the signup performance fixes

Write-Host "🚀 Deploying signup performance optimization..." -ForegroundColor Green

# Check if supabase CLI is available
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Supabase CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "Run: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Push the migration
Write-Host "📤 Pushing database migration..." -ForegroundColor Blue
try {
    npx supabase db push
    Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Migration push failed. Please apply manually in Supabase SQL Editor." -ForegroundColor Red
    Write-Host "" -ForegroundColor Yellow
    Write-Host "Manual steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql" -ForegroundColor Yellow
    Write-Host "2. Copy and paste the contents of supabase/migrations/20260113000001_optimize_signup_performance.sql" -ForegroundColor Yellow
    Write-Host "3. Click 'Run'" -ForegroundColor Yellow
}

Write-Host "" -ForegroundColor Cyan
Write-Host "🔍 To monitor signup performance after deployment:" -ForegroundColor Cyan
Write-Host "SELECT * FROM monitor_signup_performance();" -ForegroundColor Cyan

Write-Host "" -ForegroundColor Yellow
Write-Host "💡 Optional: For zero-downtime index creation (production recommended):" -ForegroundColor Yellow
Write-Host "Run supabase/create_indexes_concurrently.sql separately during low-traffic periods" -ForegroundColor Yellow

Write-Host "" -ForegroundColor Green
Write-Host "🎉 Signup optimization deployment complete!" -ForegroundColor Green