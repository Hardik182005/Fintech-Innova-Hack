# auto_push.ps1 - Automated commit/push script for Fintech-Innova-Hack (Safe & Isolated)
#
# =============================================================================================
# INTEGRITY FIX -- 2026-08-01 (full evidence in docs/REPOSITORY_INTEGRITY_AUDIT.md)
# =============================================================================================
# WHAT THIS SCRIPT WAS DOING (now disabled, kept below as a commented-out block for audit
# purposes -- do not re-enable):
#
#   Every hourly run, the script picked 10 of its own hard-coded templates and, for each one,
#   OVERWROTE a real source path (e.g. credence/vault/calculator.py, credence/passport/
#   signature.py, tests/unit/test_formatting.py, docs/api/passport_schema.md) with fabricated
#   file content. Each generated file was stamped with a `# Module update: <unix-ts>-<n>`
#   header and written with a UTF-8 BOM -- a reliable fingerprint for "machine-generated, not
#   human-written" that has nothing to do with the module's actual purpose. One of these
#   fabricated files, credence/vault/calculator.py, defined
#   `calculate_tier_splits(amount: float, ...)` -- a float-typed money calculation, which
#   directly violates this repo's integer-minor-units invariant (see credence/money.py).
#   A second fabricated file, credence/precision.py, defined `scale_to_cents(amount: float)`,
#   the same defect. Both have since been deleted from the working tree.
#
#   The script then committed each fabricated file under a canned "clean human" commit
#   message (e.g. "refactor(vault): optimize waterfall allocation calculation") and rotated
#   the git author identity across THREE DIFFERENT real people's usernames/emails, loaded
#   from users.json (gitignored, not committed) -- including two entries holding live GitHub
#   Personal Access Tokens belonging to other real accounts. It then pushed using whichever
#   of those tokens authenticated successfully, embedded directly in the remote URL.
#
#   Net effect verified against the real GitHub remote (origin/main) during this audit:
#   79 of the most recent 100 commits on origin/main are these fabricated commits, attributed
#   across 3 different author identities, none of which reflect real human work. That history
#   is already pushed and is NOT rewritten by this fix (force-rewriting shared history is a
#   separate, deliberate decision for the repo owner to make -- not something an automated
#   fix should do silently).
#
#   Notably, the fabrication loop staged and committed ONLY the one synthetic file it had just
#   written (`git add $TargetFile` / `git commit $TargetFile`) -- it never staged real,
#   already-modified project files sitting in the working tree. So every hourly run produced
#   visible-looking "activity" while never actually capturing the user's real work.
#
# WHAT IS DISABLED:
#   - All fabricated file generation ($HumanTemplates and the loop that writes them to real
#     source paths with a `# Module update:` header + BOM).
#   - All canned/fake commit messages tied to that generation.
#   - All multi-user identity rotation (GIT_AUTHOR_NAME/EMAIL spoofing) and PAT-in-URL pushes
#     using other accounts' tokens.
#
# WHAT IS PRESERVED (the user explicitly wants their auto-commit scheduler to keep working):
#   - The hourly commit+push job itself, via the same Task Scheduler entry
#     (see setup_task.ps1 -- "Fintech-Innova-Hack-HourlyPush").
#   - Logging to auto_push.log in the same format/location.
#   - It now commits whatever REAL changes already exist in the working tree (if any), as a
#     single commit, under the machine's own actually-configured git identity (git config
#     user.name/user.email -- already set to the repo owner, Hardik182005), and pushes via the
#     existing `origin` remote, which already authenticates through the Windows Git Credential
#     Manager (`git config credential.helper` = manager) -- no embedded tokens, no borrowed
#     identities, no invented content.
# =============================================================================================

$RepoDir = "E:\Innovahack\Fintech-Innova-Hack"
Set-Location -Path $RepoDir

$LogFile = Join-Path $RepoDir "auto_push.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$Timestamp] Starting safe hourly push run (real working-tree changes only)..." | Out-File -FilePath $LogFile -Append -Encoding UTF8

# Branch target
$Branch = "main"

<#
=================================================================================================
DISABLED -- fabricated multi-file / multi-user commit generation. Retained verbatim, as an inert
block comment, purely so the exact prior behaviour remains auditable. DO NOT UN-COMMENT THIS.
=================================================================================================

$UsersFile = Join-Path $RepoDir "users.json"
$UnixSec = [DateTimeOffset]::Now.ToUnixTimeSeconds()

# Load users
if (-not (Test-Path $UsersFile)) {
    "[$Timestamp] ERROR: users.json not found." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

$Users = Get-Content $UsersFile | ConvertFrom-Json
$UserCount = $Users.Count

if ($UserCount -eq 0) {
    "[$Timestamp] ERROR: No users configured." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    exit 1
}

# Array of clean human commit templates and file targets
$HumanTemplates = @(
    @{
        Msg = "feat(ledger): add transaction verification helper"
        Folder = "credence/ledger"
        File = "verification.py"
        Code = @"
# Ledger transaction verification helper
def verify_transaction_payload(payload: dict) -> bool:
    """Verify transaction payload structure and required fields."""
    required = ["transaction_id", "amount", "currency", "timestamp"]
    return all(field in payload for field in required)
"@
    },
    @{
        Msg = "refactor(vault): optimize waterfall allocation calculation"
        Folder = "credence/vault"
        File = "calculator.py"
        Code = @"
# Vault waterfall calculation utility
def calculate_tier_splits(amount: float, tiers: list) -> list:
    """Calculate tier distribution for waterfall allocation."""
    result = []
    remaining = amount
    for tier in tiers:
        allocated = min(remaining, tier.get('cap', remaining))
        result.append({'tier': tier.get('name'), 'allocated': allocated})
        remaining -= allocated
        if remaining <= 0:
            break
    return result
"@
    },
    @{
        Msg = "docs(api): update OpenAPI passport schema description"
        Folder = "docs/api"
        File = "passport_schema.md"
        Code = @"
# Passport API Specification

## Endpoints
- `POST /v1/passport/verify`: Verify digital identity passport.
- `GET /v1/passport/keys`: Retrieve public signing keys.

## Security
All requests require Bearer token authentication in the HTTP header.
"@
    },
    @{
        Msg = "fix(policy): resolve boundary check in credit evaluation"
        Folder = "credence/policy"
        File = "bounds.py"
        Code = @"
# Policy boundary check utility
def validate_credit_score(score: int) -> bool:
    """Ensure credit score falls within valid bounds [300, 850]."""
    return 300 <= score <= 850
"@
    },
    @{
        Msg = "test(unit): add unit test suite for money formatting"
        Folder = "tests/unit"
        File = "test_formatting.py"
        Code = @"
# Unit tests for currency formatting
def test_currency_symbol_mapping():
    symbols = {"USD": "`$", "EUR": "€", "GBP": "£", "INR": "₹"}
    assert symbols["USD"] == "`$"
    assert symbols["INR"] == "₹"
"@
    },
    @{
        Msg = "style(core): format audit chain type annotations"
        Folder = "credence/audit"
        File = "types.py"
        Code = @"
from typing import Dict, Any, List, Optional

AuditRecord = Dict[str, Any]
AuditTrail = List[AuditRecord]
"@
    },
    @{
        Msg = "chore(config): adjust default timeout and retry values"
        Folder = "credence"
        File = "defaults.py"
        Code = @"
# Core configuration defaults
DEFAULT_TIMEOUT_SECONDS = 30
MAX_RETRY_ATTEMPTS = 3
BACKOFF_FACTOR = 1.5
"@
    },
    @{
        Msg = "feat(passport): add digital signature verification module"
        Folder = "credence/passport"
        File = "signature.py"
        Code = @"
# Digital signature utilities
import hashlib

def generate_checksum(data: bytes) -> str:
    """Generate SHA-256 checksum for payload validation."""
    return hashlib.sha256(data).hexdigest()
"@
    },
    @{
        Msg = "refactor(db): simplify mock database connection pool"
        Folder = "credence"
        File = "pool.py"
        Code = @"
# Database connection pool manager
class ConnectionPool:
    def __init__(self, max_connections: int = 10):
        self.max_connections = max_connections
        self.active = 0

    def acquire(self):
        if self.active < self.max_connections:
            self.active += 1
            return True
        return False
"@
    },
    @{
        Msg = "docs(architecture): add system data flow diagram overview"
        Folder = "docs/architecture"
        File = "data_flow.md"
        Code = @"
# Data Flow Overview

```
[Client App] --> (API Gateway) --> [Credence Service] --> [Ledger / Vault DB]
                                           |
                                  (Policy Engine)
```

1. Client submits request payload.
2. Passport service authenticates bearer token.
3. Policy engine checks authorization rules.
4. Ledger commits immutable transaction record.
"@
    }
)

$FilesCount = 10
$SelectedIndices = (0..($HumanTemplates.Count - 1) | Get-Random -Count $FilesCount)

for ($i = 0; $i -lt $FilesCount; $i++) {
    $TmplIdx = $SelectedIndices[$i]
    $Tmpl = $HumanTemplates[$TmplIdx]

    $UserIdx = $i % $UserCount
    $CurrentUser = $Users[$UserIdx]
    $Username = $CurrentUser.username
    $Email = $CurrentUser.email

    # Set git author env strictly for this process
    $env:GIT_AUTHOR_NAME = $Username
    $env:GIT_COMMITTER_NAME = $Username
    $env:GIT_AUTHOR_EMAIL = $Email
    $env:GIT_COMMITTER_EMAIL = $Email

    # Ensure target directory exists
    $TargetDir = Join-Path $RepoDir $Tmpl.Folder
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }

    $TargetFile = Join-Path $TargetDir $Tmpl.File

    # Code / content update
    $Header = "# Module update: $UnixSec-$i`n"
    $FileContent = $Header + $Tmpl.Code

    $FileContent | Out-File -FilePath $TargetFile -Encoding UTF8

    # Stage ONLY this specific file (never git add . or stage user work)
    git add $TargetFile
    $CommitMsg = $Tmpl.Msg

    # Commit ONLY this specific file
    git commit $TargetFile -m $CommitMsg | Out-File -FilePath $LogFile -Append -Encoding UTF8

    "[$Timestamp] Committed '$CommitMsg' ($TargetFile) as $Username" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

# Push all created commits to main
$env:GIT_TERMINAL_PROMPT = "0"
$PushSuccess = $false

foreach ($u in $Users) {
    if ($u.token) {
        $AuthenticatedRemote = "https://$($u.username):$($u.token)@github.com/Hardik182005/Fintech-Innova-Hack.git"
        $PushResult = git push $AuthenticatedRemote $Branch 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PushSuccess = $true
            "[$Timestamp] Successfully pushed commits to '$Branch' via $($u.username) token." | Out-File -FilePath $LogFile -Append -Encoding UTF8
            break
        }
    }
}

if (-not $PushSuccess) {
    "[$Timestamp] Pushing via default origin remote..." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    $PushResult = git push origin $Branch 2>&1
    "[$Timestamp] Push result: $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

#>

# =================================================================================================
# ACTIVE BEHAVIOUR -- commit + push only real, already-existing working-tree changes.
# No files are invented, no commit messages are fabricated, no other person's identity or token
# is used. If there is nothing real to commit, the script logs that and exits cleanly.
# =================================================================================================

$PendingChanges = git status --porcelain

if (-not $PendingChanges) {
    "[$Timestamp] No real working-tree changes to commit. Nothing to do." | Out-File -FilePath $LogFile -Append -Encoding UTF8
} else {
    # Stage everything currently sitting in the working tree (respects .gitignore, so
    # users.json/.env/etc. are never picked up).
    git add -A | Out-Null

    $CommitMsg = "chore: automated snapshot $Timestamp"
    $CommitOutput = git commit -m $CommitMsg 2>&1 | Out-String
    $CommitOutput | Out-File -FilePath $LogFile -Append -Encoding UTF8

    if ($LASTEXITCODE -eq 0) {
        $ActualIdentity = git config user.name
        "[$Timestamp] Committed real working-tree changes as $ActualIdentity." | Out-File -FilePath $LogFile -Append -Encoding UTF8

        # Push via the repo's own already-configured origin remote/credential manager.
        # No tokens are embedded and no other account's identity is borrowed.
        $env:GIT_TERMINAL_PROMPT = "0"
        $PushResult = git push origin $Branch 2>&1
        "[$Timestamp] Push result: $PushResult" | Out-File -FilePath $LogFile -Append -Encoding UTF8
    } else {
        "[$Timestamp] Nothing was actually staged (or commit failed); skipping push." | Out-File -FilePath $LogFile -Append -Encoding UTF8
    }
}
