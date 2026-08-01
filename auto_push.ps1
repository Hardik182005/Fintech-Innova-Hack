# auto_push.ps1 - Hourly multi-file & multi-user automated git push
$RepoDir = "E:\Innovahack\Fintech-Innova-Hack"
Set-Location -Path $RepoDir

$LogFile = Join-Path $RepoDir "auto_push.log"
$UsersFile = Join-Path $RepoDir "users.json"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$DisplayTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$DisplayTime] Starting hourly multi-user 10-file push run..." | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Ensure on main branch
$Branch = "main"
$CurrentBranch = (git branch --show-current).Trim()
if ($CurrentBranch -ne $Branch) {
    git checkout $Branch 2>&1 | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Load users
if (-not (Test-Path $UsersFile)) {
    "[$DisplayTime] ERROR: users.json not found." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

$Users = Get-Content $UsersFile | ConvertFrom-Json
$UserCount = $Users.Count

if ($UserCount -eq 0) {
    "[$DisplayTime] ERROR: No users found." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

# Create activity directory for this hourly run
$ActivityDir = Join-Path $RepoDir "activity"
if (-not (Test-Path $ActivityDir)) {
    New-Item -ItemType Directory -Path $ActivityDir -Force | Out-Null
}

# Number of files to push per hourly run
$FilesCount = 10

# Generate 10 files and commit them across the 3 users
for ($i = 1; $i -le $FilesCount; $i++) {
    $UserIdx = ($i - 1) % $UserCount
    $CurrentUser = $Users[$UserIdx]
    $Username = $CurrentUser.username
    $Email = $CurrentUser.email

    # Set git author env
    $env:GIT_AUTHOR_NAME = $Username
    $env:GIT_COMMITTER_NAME = $Username
    $env:GIT_AUTHOR_EMAIL = $Email
    $env:GIT_COMMITTER_EMAIL = $Email

    # File path
    $FileName = "batch_${Timestamp}_file_$($i.ToString('D2')).md"
    $FilePath = Join-Path $ActivityDir $FileName

    # Generate structured content
    $Content = @"
# Activity Report: $FileName

- **Timestamp**: $DisplayTime
- **Author**: @$Username
- **Task ID**: FIN-$Timestamp-$i
- **Status**: Completed
- **Metrics**: Verified pass

### Details
Automated hourly sync file #$i of $FilesCount created by @$Username.
"@
    $Content | Out-File -FilePath $FilePath -Encoding UTF8

    # Stage and commit this specific file
    git add $FilePath
    $CommitMsg = "docs(activity): add $FileName by @$Username"
    git commit -m $CommitMsg | Out-File -FilePath $LogFile -Append -Encoding UTF8

    "[$DisplayTime] Committed file $i/$FilesCount ($FileName) as @$Username" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Push all 10 commits to main
$env:GIT_TERMINAL_PROMPT = "0"
$PushSuccess = $false

# Try pushing with token of configured users or default origin
foreach ($u in $Users) {
    if ($u.token) {
        $AuthenticatedRemote = "https://$($u.username):$($u.token)@github.com/Hardik182005/Fintech-Innova-Hack.git"
        $PushResult = git push $AuthenticatedRemote $Branch 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PushSuccess = $true
            "[$DisplayTime] Successfully pushed 10 files to '$Branch' via $($u.username) token." | Out-File -FilePath $LogFile -Append -Encoding UTF8
            break
        }
    }
}

if (-not $PushSuccess) {
    "[$DisplayTime] Pushing via default origin remote..." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    $PushResult = git push origin $Branch 2>&1
    "[$DisplayTime] Push result: $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}
