# auto_push.ps1 - Automated multi-user rotational hourly push script to main branch
$RepoDir = "E:\Innovahack\Fintech-Innova-Hack"
Set-Location -Path $RepoDir

$LogFile = Join-Path $RepoDir "auto_push.log"
$UsersFile = Join-Path $RepoDir "users.json"
$IndexFile = Join-Path $RepoDir ".user_index"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$Timestamp] Starting auto-push check..." | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Ensure target branch is always 'main'
$Branch = "main"
$CurrentBranch = (git branch --show-current).Trim()
if ($CurrentBranch -ne $Branch) {
    git checkout $Branch 2>&1 | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Load user list
if (-not (Test-Path $UsersFile)) {
    "[$Timestamp] ERROR: users.json not found." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

$Users = Get-Content $UsersFile | ConvertFrom-Json
$UserCount = $Users.Count

if ($UserCount -eq 0) {
    "[$Timestamp] ERROR: No users configured in users.json." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

# Read current rotational index
$Index = 0
if (Test-Path $IndexFile) {
    $RawIdx = (Get-Content $IndexFile -Raw).Trim()
    [int]::TryParse($RawIdx, [ref]$Index) | Out-Null
    $Index = $Index % $UserCount
}

$CurrentUser = $Users[$Index]
$Username = $CurrentUser.username
$Email = $CurrentUser.email
$Token = $CurrentUser.token

# Update index for next run
$NextIndex = ($Index + 1) % $UserCount
$NextIndex | Out-File -FilePath $IndexFile -Encoding UTF8 -NoNewline

"[$Timestamp] Selected contributor [$($Index + 1)/$UserCount]: $Username" | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Override Git Author/Committer environment variables for this commit
if ($Username) {
    $env:GIT_AUTHOR_NAME = $Username
    $env:GIT_COMMITTER_NAME = $Username
}
if ($Email) {
    $env:GIT_AUTHOR_EMAIL = $Email
    $env:GIT_COMMITTER_EMAIL = $Email
}

# Ensure untracked or modified files are staged
$Status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($Status)) {
    $ActivityFile = Join-Path $RepoDir "AUTO_ACTIVITY.md"
    "## Auto Activity Log`n`nLast automated push by @${Username} on ${Timestamp}" | Out-File -FilePath $ActivityFile -Encoding UTF8
    git add $ActivityFile
} else {
    git add .
}

$StagedDiff = git diff --cached --name-only
if ($StagedDiff) {
    $CommitMsg = "auto: hourly update by @${Username} ($Timestamp)"
    git commit -m $CommitMsg | Out-File -FilePath $LogFile -Append -Encoding UTF8
    
    $env:GIT_TERMINAL_PROMPT = "0"
    $PushSuccess = $false

    if ($Username -and $Token) {
        $AuthenticatedRemote = "https://${Username}:${Token}@github.com/Hardik182005/Fintech-Innova-Hack.git"
        $PushResult = git push $AuthenticatedRemote $Branch 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PushSuccess = $true
        }
    }
    
    if (-not $PushSuccess) {
        "[$Timestamp] Token push unavailable or failed; using default origin remote..." | Out-File -FilePath $LogFile -Append -Encoding UTF8
        $PushResult = git push origin $Branch 2>&1
    }
    
    "[$Timestamp] Push result (by $Username to branch '$Branch'): $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
} else {
    "[$Timestamp] No changes detected to commit." | Out-File -FilePath $LogFile -Append -Encoding UTF8
}
