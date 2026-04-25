# Whisper-cpp Setup (Windows)

## Overview

`pipeline/transcribe.mjs` shells out to `npx hyperframes transcribe`, which in turn
requires `whisper-cli` to be on the PATH. This document records how to install the
prebuilt Windows binary so the pipeline works end-to-end.

## Install steps

### 1. Download the prebuilt binary

Source: https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.4  
Asset: `whisper-bin-x64.zip` (~4 MB)

```powershell
Invoke-WebRequest `
  -Uri "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip" `
  -OutFile "C:\tools\whisper-bin-x64.zip" `
  -UseBasicParsing
```

### 2. Extract and flatten

The zip extracts into a `Release\` subdirectory. Copy everything up to the top-level
install directory so `C:\tools\whisper\whisper-cli.exe` is the direct path.

```powershell
New-Item -ItemType Directory -Force -Path "C:\tools\whisper"
Expand-Archive -Path "C:\tools\whisper-bin-x64.zip" -DestinationPath "C:\tools\whisper" -Force
Copy-Item "C:\tools\whisper\Release\*" "C:\tools\whisper\" -Force
```

### 3. Add to user PATH (persistent)

Run once per machine — idempotent guard included:

```powershell
$toAdd = "C:\tools\whisper"
$cur = [Environment]::GetEnvironmentVariable("PATH", "User")
if (-not ($cur -split ";" | Where-Object { $_ -eq $toAdd })) {
    [Environment]::SetEnvironmentVariable("PATH", "$cur;$toAdd", "User")
}
```

New terminal windows will pick up the change automatically.

### 4. Verify

```bash
whisper-cli --help | head -5
# Expected: usage line showing "whisper-cli.exe [options] file0 file1 ..."
```

## Version pinned

| Field   | Value  |
|---------|--------|
| Release | v1.8.4 |
| Asset   | whisper-bin-x64.zip |
| Binary  | `C:\tools\whisper\whisper-cli.exe` |

To upgrade, repeat steps 1–2 with a newer release tag and re-copy into the same
`C:\tools\whisper\` directory.

## Model download

The first time `npx hyperframes transcribe` runs, it will automatically download the
required model file (e.g. `ggml-small.en.bin`) into its local cache. This is a one-time
~240 MB download and requires an internet connection on first use.

## Pipeline integration

`pipeline/transcribe.mjs` defensively prepends `C:\tools\whisper` to the child
process PATH at spawn time, so the binary is found even in fresh shell sessions that
haven't yet inherited the updated user PATH (e.g. CI, new terminals, worktrees):

```js
const whisperBinDir = 'C:\\tools\\whisper';
const childEnv = { ...process.env };
const pathSep = process.platform === 'win32' ? ';' : ':';
if (!childEnv.PATH?.includes(whisperBinDir)) {
  childEnv.PATH = `${whisperBinDir}${pathSep}${childEnv.PATH ?? ''}`;
}
```
