# auto_push.ps1 - Automated hourly git commit and push script
$RepoDir = "E:\Innovahack\Fintech-Innova-Hack"
Set-Location -Path $RepoDir

$LogFile = Join-Path $RepoDir "auto_push.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$Timestamp] Starting auto-push check..." | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Ensure untracked or modified files are staged
# If repo is completely clean, update AUTO_ACTIVITY.md to ensure something gets committed & pushed every hour
$Status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($Status)) {
    $ActivityFile = Join-Path $RepoDir "AUTO_ACTIVITY.md"
    "## Auto Activity Log`n`nLast automated run: $Timestamp" | Out-File -FilePath $ActivityFile -Encoding UTF8
    git add $ActivityFile
} else {
    git add .
}

$StagedDiff = git diff --cached --name-only
if ($StagedDiff) {
    $CommitMsg = "auto: hourly update ($Timestamp)"
    git commit -m $CommitMsg | Out-File -FilePath $LogFile -Append -Encoding UTF8
    $PushResult = git push origin main 2>&1
    "[$Timestamp] Push result: $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
} else {
    "[$Timestamp] No changes detected to commit." | Out-File -FilePath $LogFile -Append -Encoding UTF8
}
