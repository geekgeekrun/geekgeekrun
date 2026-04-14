param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('auto-chat', 'rechat', 'resume-sync')]
  [string]$Flow,
  [string]$ConfigPatchJson,
  [string]$ConfigPatchFile,
  [string]$UserDataDir,
  [ValidateSet('full', 'cookies-only', 'none', '')]
  [string]$SessionInjectionMode
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$ElectronExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$UiEntry = Join-Path $ProjectRoot 'packages\ui'
$PatchScript = Join-Path $ProjectRoot 'skill\geekgeekrun-flow-runner\scripts\apply-boss-config-patch.mjs'

$Mode = switch ($Flow) {
  'auto-chat' { 'geekAutoStartWithBoss' }
  'rechat' { 'readNoReplyAutoReminder' }
  'resume-sync' { 'bossResumeSync' }
}

if (-not (Test-Path $ElectronExe)) {
  throw "electron executable not found: $ElectronExe"
}

if ($ConfigPatchJson) {
  & node $PatchScript --json $ConfigPatchJson
}
elseif ($ConfigPatchFile) {
  & node $PatchScript --file $ConfigPatchFile
}

$startProcessEnv = @{
  GEEKGEEKRUN_ENABLE_LOG_TO_FILE = '1'
}
if ($UserDataDir) {
  $startProcessEnv['GGR_PUPPETEER_USER_DATA_DIR'] = $UserDataDir
}
if (-not $SessionInjectionMode -and $Flow -eq 'auto-chat' -and $UserDataDir) {
  $SessionInjectionMode = 'none'
}
if ($SessionInjectionMode) {
  $startProcessEnv['GGR_SESSION_INJECTION_MODE'] = $SessionInjectionMode
}
$oldEnableLogToFile = $env:GEEKGEEKRUN_ENABLE_LOG_TO_FILE
$oldUserDataDir = $env:GGR_PUPPETEER_USER_DATA_DIR
$oldSessionInjectionMode = $env:GGR_SESSION_INJECTION_MODE
foreach ($item in $startProcessEnv.GetEnumerator()) {
  [System.Environment]::SetEnvironmentVariable($item.Key, $item.Value, 'Process')
}
try {
  $process = Start-Process -FilePath $ElectronExe -ArgumentList @($UiEntry, "--mode=$Mode") -WorkingDirectory $UiEntry -PassThru
}
finally {
  [System.Environment]::SetEnvironmentVariable('GEEKGEEKRUN_ENABLE_LOG_TO_FILE', $oldEnableLogToFile, 'Process')
  [System.Environment]::SetEnvironmentVariable('GGR_PUPPETEER_USER_DATA_DIR', $oldUserDataDir, 'Process')
  [System.Environment]::SetEnvironmentVariable('GGR_SESSION_INJECTION_MODE', $oldSessionInjectionMode, 'Process')
}

[pscustomobject]@{
  success              = $true
  flow                 = $Flow
  mode                 = $Mode
  pid                  = $process.Id
  projectRoot          = $ProjectRoot
  userDataDir          = $UserDataDir
  sessionInjectionMode = $SessionInjectionMode
  electron             = $ElectronExe
  uiEntry              = $UiEntry
} | ConvertTo-Json -Compress
