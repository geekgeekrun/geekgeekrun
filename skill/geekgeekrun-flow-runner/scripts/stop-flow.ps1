param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auto-chat', 'rechat', 'resume-sync')]
  [string]$Flow
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$DaemonClient = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\daemon-client.mjs'
$SummaryScript = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\get-run-stop-summary.mjs'
$StorageRoot = Join-Path $env:USERPROFILE '.geekgeekrun\storage'
$AutoChatRuntimeStatusPath = Join-Path $StorageRoot 'auto-chat-runtime-status.json'
$StopRequestedAt = (Get-Date).ToUniversalTime().ToString('o')
$StopWaitAttempts = 12
$StopWaitSeconds = 1
$SummaryRetryAttempts = 6
$SummaryRetrySeconds = 2

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

function Get-DaemonWorkerStatus {
  try {
    $statusJson = & node $DaemonClient --timeout-ms 15000 get-status 2>$null
    if (-not $statusJson) {
      return $null
    }
    $status = $statusJson | ConvertFrom-Json
    if (-not $status.workers) {
      return $null
    }
    return @($status.workers | Where-Object { $_.workerId -eq $WorkerId }) | Select-Object -First 1
  } catch {
    return $null
  }
}

function Get-TargetProcesses {
  @(
    Get-CimInstance Win32_Process |
      Where-Object {
        $commandLine = $_.CommandLine
        $_.Name -eq 'electron.exe' -and
        $commandLine -and
        $commandLine -like "*$ProjectRoot*" -and
        @(@("--mode=$UserMode", "--mode=$WorkerId") | Where-Object { $commandLine -like "*$_*" }).Count -gt 0
      }
  )
}

function Get-RunRecordIdFromWorker {
  param(
    [object]$Worker
  )

  if (-not $Worker -or -not $Worker.args) {
    return $null
  }
  $runRecordArg = @($Worker.args | Where-Object { $_ -like '--run-record-id=*' }) | Select-Object -First 1
  if (-not $runRecordArg) {
    return $null
  }
  return [int]($runRecordArg -replace '^--run-record-id=', '')
}

function Get-RunRecordIdFromProcesses {
  param(
    [object[]]$Processes
  )

  foreach ($process in @($Processes)) {
    $commandLine = [string]$process.CommandLine
    if (-not $commandLine) {
      continue
    }
    $match = [regex]::Match($commandLine, '--run-record-id=(\d+)')
    if ($match.Success) {
      return [int]$match.Groups[1].Value
    }
  }
  return $null
}

function Get-RunRecordIdFromRuntimeStatus {
  if ($Flow -ne 'auto-chat' -or -not (Test-Path $AutoChatRuntimeStatusPath)) {
    return $null
  }
  try {
    $runtimeStatus = Get-Content -Path $AutoChatRuntimeStatusPath -Raw | ConvertFrom-Json
    if ($runtimeStatus.runRecordId) {
      return [int]$runtimeStatus.runRecordId
    }
  } catch {
  }
  return $null
}

function Get-FallbackStartedAt {
  param(
    [object[]]$Processes
  )

  $creationTimes = @(
    @($Processes) |
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
  if (@($creationTimes).Count -eq 0) {
    return $null
  }
  return ($creationTimes | Sort-Object | Select-Object -First 1).ToUniversalTime().ToString('o')
}

$initialWorker = Get-DaemonWorkerStatus
$matchedProcesses = @(Get-TargetProcesses)

[Nullable[int]]$RunRecordId = Get-RunRecordIdFromWorker -Worker $initialWorker
if (-not $RunRecordId) {
  $RunRecordId = Get-RunRecordIdFromProcesses -Processes $matchedProcesses
}
if (-not $RunRecordId) {
  $RunRecordId = Get-RunRecordIdFromRuntimeStatus
}

$FallbackStartedAt = $null
if (-not $RunRecordId -and @($matchedProcesses).Count -gt 0) {
  $FallbackStartedAt = Get-FallbackStartedAt -Processes $matchedProcesses
}

$StoppedViaDaemon = $false
for ($attempt = 0; $attempt -lt 3; $attempt++) {
  try {
    & node $DaemonClient --timeout-ms 30000 stop-worker $WorkerId 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $StoppedViaDaemon = $true
      break
    }
  } catch {
  }
  Start-Sleep -Seconds 1
}

for ($attempt = 0; $attempt -lt $StopWaitAttempts; $attempt++) {
  if ($null -eq (Get-DaemonWorkerStatus)) {
    break
  }
  Start-Sleep -Seconds $StopWaitSeconds
}

$matchedProcesses = @(Get-TargetProcesses)
$killed = @()
foreach ($process in $matchedProcesses) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    $killed += $process.ProcessId
  } catch {
  }
}

$finalWorker = Get-DaemonWorkerStatus
if ($null -eq $finalWorker) {
  $StoppedViaDaemon = $true
}

[string]$RunSummaryJson = $null
for ($attempt = 0; $attempt -lt $SummaryRetryAttempts; $attempt++) {
  $summaryArgs = @($SummaryScript, '--flow', $Flow)
  if ($RunRecordId) {
    $summaryArgs += @('--run-record-id', [string]$RunRecordId)
  } elseif ($FallbackStartedAt) {
    $summaryArgs += @('--started-at', $FallbackStartedAt, '--stopped-at', $StopRequestedAt)
  } else {
    break
  }

  try {
    $stdout = (& node @summaryArgs 2>$null | Out-String).Trim()
    if ($stdout) {
      $RunSummaryJson = $stdout
    }
  } catch {
    $RunSummaryJson = $null
  }

  if ($RunSummaryJson) {
    break
  }
  if ($attempt -lt ($SummaryRetryAttempts - 1)) {
    Start-Sleep -Seconds $SummaryRetrySeconds
  }
}

$result = [ordered]@{
  success = $true
  flow = $Flow
  projectRoot = $ProjectRoot
  workerId = $WorkerId
  runRecordId = $RunRecordId
  fallbackStartedAt = $FallbackStartedAt
  stopRequestedAt = $StopRequestedAt
  stoppedViaDaemon = $StoppedViaDaemon
  killedElectronPids = $killed
  runSummary = '__RUN_SUMMARY_PLACEHOLDER__'
} | ConvertTo-Json -Depth 8

if ($RunSummaryJson) {
  $result = $result.Replace('"__RUN_SUMMARY_PLACEHOLDER__"', $RunSummaryJson)
} else {
  $result = $result.Replace('"__RUN_SUMMARY_PLACEHOLDER__"', 'null')
}

$result
