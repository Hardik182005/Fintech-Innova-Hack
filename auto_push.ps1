# auto_push.ps1 - Automated hourly git commit and push script
$RepoDir = "E:\Innovahack\Fintech-Innova-Hack"
Set-Location -Path $RepoDir

$LogFile = Join-Path $RepoDir "auto_push.log"
$EnvFile = Join-Path $RepoDir ".env"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$Timestamp] Starting auto-push check..." | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Load .env credentials if present
$Username = ""
$Token = ""
$Email = ""

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim()
            if ($key -eq "GH_USERNAME") { $Username = $val }
            if ($key -eq "GH_TOKEN") { $Token = $val }
            if ($key -eq "GH_EMAIL") { $Email = $val }
        }
    }
}

# Override Git Author/Committer if specified
if ($Username) {
    $env:GIT_AUTHOR_NAME = $Username
    $env:GIT_COMMITTER_NAME = $Username
}
if ($Email) {
    $env:GIT_AUTHOR_EMAIL = $Email
    $env:GIT_COMMITTER_EMAIL = $Email
}

$Branch = (git branch --show-current).Trim()
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = "main"
}

# Ensure untracked or modified files are staged
$Status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($Status)) {
    $ActivityFile = Join-Path $RepoDir "AUTO_ACTIVITY.md"
    "## Auto Activity Log`n`nLast automated run by ${Username} at ${Timestamp}" | Out-File -FilePath $ActivityFile -Encoding UTF8
    git add $ActivityFile
} else {
    git add .
}

$StagedDiff = git diff --cached --name-only
if ($StagedDiff) {
    $CommitMsg = "auto: hourly update ($Timestamp)"
    git commit -m $CommitMsg | Out-File -FilePath $LogFile -Append -Encoding UTF8
    
    if ($Username -and $Token) {
        $AuthenticatedRemote = "https://${Username}:${Token}@github.com/Hardik182005/Fintech-Innova-Hack.git"
        $PushResult = git push $AuthenticatedRemote $Branch 2>&1
    } else {
        $PushResult = git push origin $Branch 2>&1
    }
    
    "[$Timestamp] Push result (as $Username) for branch '$Branch': $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
} else {
    "[$Timestamp] No changes detected to commit." | Out-File -FilePath $LogFile -Append -Encoding UTF8
}
