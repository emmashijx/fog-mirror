param(
    [string]$Python = "python",
    [ValidateSet("official", "maccap")][string]$ConfigSource = "official"
)

$ErrorActionPreference = "Stop"
$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$environment = Join-Path $workspace ".local\fah-venv"
$runtime = Join-Path $environment "Scripts\python.exe"
$upstream = Join-Path $workspace ".local\FAH"
$revision = "2b13dd9c7fc04ad173a76ab89beac9266d2d59ac"

if (-not (Test-Path -LiteralPath $runtime)) {
    & $Python -c "import sys; assert sys.version_info >= (3, 10), 'Use Python 3.10 or newer'"
    if ($LASTEXITCODE -ne 0) { throw "Provide a supported interpreter with -Python <python.exe>" }
    & $Python -m venv $environment
    if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated environment" }
}
if (-not (Test-Path -LiteralPath (Join-Path $upstream ".git"))) {
    git clone https://github.com/noahcao/FAH.git $upstream
    if ($LASTEXITCODE -ne 0) { throw "Could not clone FAH" }
    git -C $upstream checkout --detach $revision
    if ($LASTEXITCODE -ne 0) { throw "Could not select the pinned FAH revision" }
}
$actualRevision = git -C $upstream rev-parse HEAD
if ($actualRevision -ne $revision) {
    throw "Expected FAH revision $revision; found $actualRevision. Existing checkout retained."
}
& $runtime -m pip install torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE -ne 0) { throw "CUDA PyTorch installation failed" }
& $runtime -m pip install -r (Join-Path $PSScriptRoot "requirements.txt") -e $upstream
if ($LASTEXITCODE -ne 0) { throw "FAH dependency installation failed" }
& $runtime (Join-Path $PSScriptRoot "prepare.py") --config-source $ConfigSource
if ($LASTEXITCODE -ne 0) {
    throw "Dependencies are not ready. Check the missing files and Hugging Face access instructions."
}
