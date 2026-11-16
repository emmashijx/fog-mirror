param(
    [int]$Port = 8766,
    [ValidateSet("auto", "cuda", "mps", "cpu")][string]$Device = "cuda"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtime = Join-Path $workspace ".local\fah-venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $runtime)) {
    throw "Run tools\fah\setup.ps1 first"
}
& $runtime (Join-Path $PSScriptRoot "server.py") --port $Port --device $Device
