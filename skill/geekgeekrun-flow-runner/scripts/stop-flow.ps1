param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auto-chat', 'rechat', 'resume-sync')]
  [string]$Flow
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$DaemonClient = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\daemon-client.mjs'
$SummaryScript = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\get-run-stop-summary.py'
$StopRequestedAt = (Get-Date).ToUniversalTime().ToString('o')

$WorkerId = switch ($Flow) {
  'auto-chat' { 'geekAutoStartWithBossMain' }
  'rechat' { 'readNoReplyAutoReminderMain' }
  'resume-sync' { 'bossResumeSyncMain' }
}

$UserMode = switch ($Flow) {
  'auto-chat' { 'geekAutoStartWithBoss' }
  'rechat' { 'readNoReplyAutoReminder' }
  'resume-sync' { 'bossResumeSync' }
}

$RunRecordId = $null
try {
  $statusJson = & node $DaemonClient get-status 2>$null
  if ($LASTEXITCODE -eq 0 -and $statusJson) {
    $status = $statusJson | ConvertFrom-Json
    $targetWorker = @($status.workers | Where-Object { $_.workerId -eq $WorkerId }) | Select-Object -First 1
    if ($targetWorker -and $targetWorker.args) {
      $runRecordArg = @($targetWorker.args | Where-Object { $_ -like '--run-record-id=*' }) | Select-Object -First 1
      if ($runRecordArg) {
        $RunRecordId = [int]($runRecordArg -replace '^--run-record-id=', '')
      }
    }
  }
} catch {
  $RunRecordId = $null
}

$MatchedProcesses = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $commandLine = $_.CommandLine
      $_.Name -eq 'electron.exe' -and
      $commandLine -and
      $commandLine -like "*$ProjectRoot*" -and
      @(@("--mode=$UserMode", "--mode=$WorkerId") | Where-Object { $commandLine -like "*$_*" }).Count -gt 0
    }
)

$FallbackStartedAt = $null
if (-not $RunRecordId -and @($MatchedProcesses).Count -gt 0) {
  $creationTimes = @(
    $MatchedProcesses |
      ForEach-Object {
        try {
          if ($_.CreationDate) {
            [System.Management.ManagementDateTimeConverter]::ToDateTime($_.CreationDate)
          }
        } catch {
        }
      } |
      Where-Object { $_ -is [datetime] }
  )
  if (@($creationTimes).Count -gt 0) {
    $FallbackStartedAt = (
      ($creationTimes | Sort-Object | Select-Object -First 1).ToUniversalTime().ToString('o')
    )
  }
}

$StoppedViaDaemon = $false
try {
  & node $DaemonClient stop-worker $WorkerId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "daemon stop-worker failed for $WorkerId"
  }
  $StoppedViaDaemon = $true
} catch {
  $StoppedViaDaemon = $false
}

Start-Sleep -Seconds 2

$killed = @()
$MatchedProcesses |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      $killed += $_.ProcessId
    } catch {
    }
  }

[object]$RunSummary = $null
try {
  $summaryArgs = @($SummaryScript, '--flow', $Flow)
  if ($RunRecordId) {
    $summaryArgs += @('--run-record-id', [string]$RunRecordId)
  } elseif ($FallbackStartedAt) {
    $summaryArgs += @('--started-at', $FallbackStartedAt, '--stopped-at', $StopRequestedAt)
  }
  $summaryOutput = (& python $summaryArgs 2>&1) | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) {
      $_.ToString()
    } else {
      [string]$_
    }
  }
  $summaryJson = ($summaryOutput -join [System.Environment]::NewLine).Trim()
  if ($LASTEXITCODE -eq 0 -and $summaryJson) {
    $RunSummary = $summaryJson | ConvertFrom-Json -Depth 8
  }
} catch {
  $RunSummary = $null
}

[pscustomobject]@{
  success = $true
  flow = $Flow
  projectRoot = $ProjectRoot
  workerId = $WorkerId
  runRecordId = $RunRecordId
  fallbackStartedAt = $FallbackStartedAt
  stopRequestedAt = $StopRequestedAt
  stoppedViaDaemon = $StoppedViaDaemon
  killedElectronPids = $killed
  runSummary = $RunSummary
} | ConvertTo-Json -Depth 8
