# Apply Chat RLS Infinite Recursion Fix
# This script applies the migration to fix the infinite recursion error in conversation_participants RLS policies

Write-Host "🔧 Applying Chat RLS Infinite Recursion Fix..." -ForegroundColor Green

# Check if supabase CLI is available
if (!(Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Supabase CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "Run: npm install -g supabase" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 Manual Application Steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql" -ForegroundColor Cyan
    Write-Host "2. Copy and paste the contents of:" -ForegroundColor Cyan
    Write-Host "   supabase/migrations/20260110000001_fix_chat_rls_infinite_recursion.sql" -ForegroundColor Cyan
    Write-Host "3. Click 'Run'" -ForegroundColor Cyan
    exit 1
}

# Push the migration
Write-Host "📤 Pushing database migration..." -ForegroundColor Blue
try {
    npx supabase db push
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration applied successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔄 Please refresh your application to see the fix take effect." -ForegroundColor Cyan
    } else {
        throw "Migration push failed"
    }
} catch {
    Write-Host "❌ Migration push failed. Please apply manually in Supabase SQL Editor." -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Manual Application Steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql" -ForegroundColor Cyan
    Write-Host "2. Copy and paste the contents of:" -ForegroundColor Cyan
    Write-Host "   supabase/migrations/20260110000001_fix_chat_rls_infinite_recursion.sql" -ForegroundColor Cyan
    Write-Host "3. Click 'Run'" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  This migration fixes the infinite recursion error in conversation_participants RLS policies." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Chat RLS fix deployment complete!" -ForegroundColor Green
