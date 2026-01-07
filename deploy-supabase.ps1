# Supabase Deployment Script
# This script links to your Supabase project and deploys all Edge Functions

param(
    [string]$ProjectRef = "zjbvnvydgsxqmmrrmvif",
    [switch]$DeployAll = $false,
    [string[]]$Functions = @()
)

# Change to the project directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "🚀 Starting Supabase Deployment..." -ForegroundColor Cyan
Write-Host ""

# Step 1: Link to Supabase project
Write-Host "📎 Linking to Supabase project: $ProjectRef" -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to link to Supabase project" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Successfully linked to project" -ForegroundColor Green
Write-Host ""

# Step 2: Get list of functions
$functionsDir = Join-Path $scriptPath "supabase\functions"
$allFunctions = Get-ChildItem -Path $functionsDir -Directory | Where-Object { 
    $_.Name -ne "_shared" -and $_.Name -ne "tests" 
} | ForEach-Object { $_.Name }

if ($DeployAll -or $Functions.Count -eq 0) {
    $functionsToDeploy = $allFunctions
    Write-Host "📦 Deploying all functions: $($allFunctions -join ', ')" -ForegroundColor Yellow
} else {
    $functionsToDeploy = $Functions
    Write-Host "📦 Deploying selected functions: $($functionsToDeploy -join ', ')" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Deploy each function
$failedDeployments = @()
$successfulDeployments = @()

foreach ($function in $functionsToDeploy) {
    Write-Host "🔨 Deploying function: $function" -ForegroundColor Cyan
    
    npx supabase functions deploy $function
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully deployed: $function" -ForegroundColor Green
        $successfulDeployments += $function
    } else {
        Write-Host "❌ Failed to deploy: $function" -ForegroundColor Red
        $failedDeployments += $function
    }
    Write-Host ""
}

# Step 4: Summary
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 Deployment Summary" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "✅ Successful: $($successfulDeployments.Count)" -ForegroundColor Green
if ($successfulDeployments.Count -gt 0) {
    Write-Host "   $($successfulDeployments -join ', ')" -ForegroundColor Green
}

if ($failedDeployments.Count -gt 0) {
    Write-Host "❌ Failed: $($failedDeployments.Count)" -ForegroundColor Red
    Write-Host "   $($failedDeployments -join ', ')" -ForegroundColor Red
    exit 1
} else {
    Write-Host "🎉 All functions deployed successfully!" -ForegroundColor Green
    exit 0
}




