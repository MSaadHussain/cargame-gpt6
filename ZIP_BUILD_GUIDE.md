# OVERSTEER — Deployment ZIP guide for the next AI

Use this guide when changing this project and creating a ZIP for the owner to upload to Hostinger. This is a Vite browser game with a Node.js multiplayer server, not a static-only website.

## 1. What the previous ZIP contained

The last archive, `oversteer-air-combat-v2.zip`, was created from these exact project-root paths:

```text
dist/
src/
public/
tests/
scripts/
server.js
package.json
package-lock.json
index.html
vite.config.js
README.md
```

Include this `ZIP_BUILD_GUIDE.md` in future archives too, so the packaging instructions travel with the source. It was created after `oversteer-air-combat-v2.zip`, so it is NOT inside that existing archive.

| Path | Why it belongs in the ZIP |
| --- | --- |
| `dist/` | Fresh production build: browser HTML, bundled JavaScript, CSS and copied public assets. The server serves this folder. |
| `src/` | Editable game source AND shared modules imported directly by `server.js`. It is required at runtime, not just for rebuilding. |
| `public/` | Original static assets needed for future builds. |
| `tests/` | Regression tests for the next developer/AI. |
| `scripts/` | Project tooling and benchmarks. |
| `server.js` | HTTP server and `/ws` multiplayer WebSocket endpoint. |
| `package.json` | Dependencies, ES-module configuration and npm commands. |
| `package-lock.json` | Reproducible dependency installation with `npm ci`. |
| Root `index.html` | Vite source entry; different from built `dist/index.html`. |
| `vite.config.js` | Build configuration and bundle splitting. |
| `README.md` | Features, controls, limitations and deployment notes. |
| `ZIP_BUILD_GUIDE.md` | These packaging instructions for future handoffs. |

Do NOT include `node_modules/`, `.git/`, editor/AI session folders, `artifacts/`, old ZIPs, logs, temporary outputs, credentials or `.env` files. Use the explicit allowlist below, not a wildcard over the entire project. Review allowed folders for accidentally added secrets or junk before packaging. If future code needs another runtime asset/configuration file, deliberately add it to the allowlist and document why.

## 2. Required ZIP layout

Files must be directly at the archive root, without an extra project-name wrapper:

```text
oversteer-<release>.zip
├── server.js
├── package.json
├── package-lock.json
├── index.html
├── vite.config.js
├── README.md
├── ZIP_BUILD_GUIDE.md
├── dist/
│   ├── index.html
│   └── assets/...
├── src/...
├── public/...
├── tests/...
└── scripts/...
```

Do not upload only `dist/`: multiplayer needs the server and its shared source modules. Do not ship only updated source with old `dist/`: browsers would still receive the previous game.

## 3. Build and package on Windows PowerShell

Run from the project root. The original workspace was `E:\Dev\cargame-gpt6`; use the actual location after sharing the project. Read any applicable `AGENTS.md` first and preserve unrelated user changes.

Use Node.js 22.12+ within the 22.x line for the existing deployment setup. On Windows use `npm.cmd` to avoid PowerShell script-execution-policy problems.

Paste this block into PowerShell from the project root:

```powershell
$ErrorActionPreference = 'Stop'
$projectRoot = (Get-Location).Path
if (-not (Test-Path -LiteralPath 'server.js') -or -not (Test-Path -LiteralPath 'package-lock.json')) {
    throw 'Run this from the OVERSTEER project root.'
}

# Fresh checkout / changed dependencies: install build AND test dependencies.
# npm ci replaces node_modules, so skip this step if intentionally preserving
# a locally modified dependency tree; resolve that situation before release.
npm.cmd ci --include=dev
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Do not package as a verified release.' }

npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }

$zipInputs = @(
    'dist', 'src', 'public', 'tests', 'scripts',
    'server.js', 'package.json', 'package-lock.json',
    'index.html', 'vite.config.js', 'README.md', 'ZIP_BUILD_GUIDE.md'
)
foreach ($entry in $zipInputs) {
    if (-not (Test-Path -LiteralPath $entry)) { throw "Missing input: $entry" }
}
if (-not (Test-Path -LiteralPath 'dist/index.html')) { throw 'Built HTML missing.' }

# Unique name; never overwrite or delete previous release archives.
$releaseName = 'oversteer-deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
$zipPath = Join-Path $projectRoot $releaseName
if (Test-Path -LiteralPath $zipPath) { throw "Archive already exists: $zipPath" }

Compress-Archive -LiteralPath $zipInputs -DestinationPath $zipPath
Get-Item -LiteralPath $zipPath | Select-Object FullName, Length
```

`npm test` runs `node --test tests/*.test.js`. The owner previously asked not to use Playwright; do not run browser automation without a new request. Passing Node tests does not establish browser FPS, visual correctness or audible sound quality.

## 4. Verify archive contents

Run immediately after the block above, using the same `$zipPath` and `$projectRoot` variables. This checks required files, forbidden paths, root layout, and exact bytes of every allowlisted source/build file against the archive.

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entriesByName = @{}
    foreach ($item in $archive.Entries) {
        $normalized = $item.FullName.Replace('\', '/')
        $entriesByName[$normalized] = $item
        if ($normalized -match '(^|/)(node_modules|\.git|\.codex|\.claude|artifacts)(/|$)' -or
            $normalized -match '(^|/)\.env($|[./])' -or $normalized -match '\.zip$') {
            throw "Forbidden archive entry: $normalized"
        }
    }
    foreach ($required in @(
        'server.js', 'package.json', 'package-lock.json', 'dist/index.html',
        'src/vehicleModels.js', 'src/airCombatRules.js', 'src/airWeapons.js',
        'src/raceRules.js', 'src/sharedTrafficRules.js', 'ZIP_BUILD_GUIDE.md'
    )) {
        if (-not $entriesByName.ContainsKey($required)) { throw "Missing ZIP entry: $required" }
    }

    $verifiedFiles = 0
    foreach ($inputPath in $zipInputs) {
        $inputItem = Get-Item -LiteralPath $inputPath
        $files = if ($inputItem.PSIsContainer) {
            Get-ChildItem -LiteralPath $inputItem.FullName -File -Recurse -Force
        } else { $inputItem }
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($projectRoot.Length).TrimStart('\', '/').Replace('\', '/')
            if (-not $entriesByName.ContainsKey($relative)) { throw "Not packaged: $relative" }
            $stream = $entriesByName[$relative].Open()
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try {
                $zipHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
            } finally { $stream.Dispose(); $sha.Dispose() }
            $localHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
            if ($zipHash -ne $localHash) { throw "Archive differs from local file: $relative" }
            $verifiedFiles++
        }
    }
    Write-Output "ZIP verified: $verifiedFiles files match the current source/build."
} finally { $archive.Dispose() }
Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
```

If future assets include hidden files, note that `Compress-Archive` can omit hidden files. The comparison above should catch missing files; choose a packaging method that preserves required assets instead of ignoring the failure.

## 5. Local server smoke check

From the project root, run `npm.cmd start`. The default URL is `http://localhost:3000`; an existing `PORT` environment variable overrides it. Stop this foreground server with Ctrl+C after checking.

- Request `/` and confirm HTTP 200 with the built game HTML.
- Request the actual `/assets/...` URLs referenced by that HTML; each must return HTTP 200 and non-empty content. Hashed filenames change after builds, so do not hard-code old names.
- The automated suite includes real WebSocket room/combat tests. Report their actual result; do not claim multiplayer verification from an HTTP-only check.
- For a stronger release check, extract the ZIP into a new temporary folder, install dependencies there with `npm ci --omit=dev`, and run `node server.js` from that extracted root. This checks that the archive works without relying on workspace-only files. Do not overwrite a working checkout to do this.

## 6. Existing Hostinger upload configuration

The owner has been deploying to `cargame-mp.thetrafficedge.com` with these panel settings:

```text
Framework preset: Express
Node version:     22.x (22.12+)
Root directory:   ./
Package manager:  npm
Entry file:       server.js
```

The entry file is a Node HTTP server; the panel preset does not mean it imports the Express package. `server.js` uses the host-supplied `PORT`, binds `0.0.0.0`, serves `dist/`, and handles `/ws` on the same domain. Upload the entire ZIP through “Upload new files” and redeploy. A prebuilt `dist/` is included because the owner's Express upload screen did not expose a separate build command. Dependencies must still be installed by the Node deployment environment.

If using a host with explicit commands instead, build with `npm ci --include=dev` followed by `npm run build`, then start with `npm start`. Static-only hosting cannot run this multiplayer backend. If the panel changes, inspect its current options rather than inventing settings. All players should refresh after deployment so client and server versions match.

## 7. Handoff checklist for the next AI

- Finish requested changes and update README controls/features when necessary.
- Run tests and a fresh production build; stop and explain failures instead of hiding them.
- Use the allowlist, keep the correct ZIP root layout, and include this guide.
- Verify archive contents and perform the relevant smoke checks.
- Preserve previous ZIPs; provide the new archive path/link and its actual test/build status.
- State honestly whether browser visual/audio play-testing happened. Do not claim live deployment unless you actually deployed it with authorization.

Reference only: the previous release passed 73 automated tests, the Vite build, and HTTP checks for the root plus four built assets. Its archive had 61 entries and was 378,808 bytes. Future releases will have different counts, sizes and hashes; these are not required targets.
