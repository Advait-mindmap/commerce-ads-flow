#!/usr/bin/env pwsh

# Git initialization and push script
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Starting Git Setup and Push" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Remove old .git if it exists
if (Test-Path .git) {
    Write-Host "Removing old .git directory..." -ForegroundColor Yellow
    Remove-Item -Force -Recurse .git
}

# Initialize git
Write-Host "Initializing git repository..." -ForegroundColor Green
git init

# Configure git
Write-Host "Configuring git user..." -ForegroundColor Green
git config user.email "user@example.com"
git config user.name "User"

# Add all files
Write-Host "Adding all files to git..." -ForegroundColor Green
git add -A

# Commit
Write-Host "Creating initial commit..." -ForegroundColor Green
git commit -m "Initial commit with Vite alias fix"

# Add remote
Write-Host "Adding remote origin..." -ForegroundColor Green
git remote add origin https://github.com/Advait-mindmap/commerce-ads-flow.git

# Rename branch to main
Write-Host "Renaming branch to main..." -ForegroundColor Green
git branch -M main

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Green
Write-Host "You will be prompted for credentials. Use your GitHub Personal Access Token (not password)" -ForegroundColor Yellow
git push -u origin main

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Git push completed!" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Verify
Write-Host "`nVerifying git status..." -ForegroundColor Green
git status
git log --oneline -1
