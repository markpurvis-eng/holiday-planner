<#
.SYNOPSIS
  Moves (or copies) Claude-generated Holiday Planner files from a flat
  folder — e.g. Downloads — into their correct locations. Handles both
  individually-downloaded files AND a "Download all" zip. Covers files
  under src/, repo-root-level files (package.json, supabase/schema.sql,
  AGENTS.md, etc), AND files that live outside the repo entirely (the
  roadmap doc, in Mark's OneDrive-synced Projects folder).

.USAGE
  From PowerShell, in any folder:
    .\deploy-claude-files.ps1

  If Windows blocks the script from running (execution policy), run it as:
    powershell -ExecutionPolicy Bypass -File .\deploy-claude-files.ps1

  Optional parameters:
    -SourceFolder <path>   Where the downloaded file(s) are.
                           Default: your Downloads folder.
    -RepoRoot <path>       The repo root to copy into (both the root-level
                           map and the src/ map are resolved from this).
                           Default: C:\Users\markp\src\holiday-planner
    -OneDriveRoot <path>   Destination for files that live outside the repo
                           entirely (currently just the roadmap doc).
                           Default: C:\Users\markp\OneDrive\Sync\Projects
    -KeepSource            Copy instead of move (leaves originals in place,
                           including any zip -- it won't be deleted).

.NOTES
  The maps below need a new entry whenever Claude hands you a file it
  hasn't handed you before. Claude will reissue this script with the map(s)
  updated whenever that happens — if a file isn't matching, you're
  probably running an older copy of this script.
#>

param(
    [string]$SourceFolder = "$env:USERPROFILE\Downloads",
    [string]$RepoRoot = "C:\Users\markp\src\holiday-planner",
    [string]$OneDriveRoot = "C:\Users\markp\OneDrive\Sync\Projects",
    [switch]$KeepSource
)

# Filename -> path relative to src\
$SrcFileMap = @{
    'App.tsx'             = 'App.tsx'
    'format.ts'           = 'lib\format.ts'
    'types.ts'            = 'lib\types.ts'
    'api.ts'               = 'lib\api.ts'
    'weather.ts'          = 'lib\weather.ts'
    'settings.ts'         = 'lib\settings.ts'
    'version.ts'          = 'lib\version.ts'
    'shareItinerary.ts'   = 'lib\shareItinerary.ts'
    'itineraryTimeline.ts' = 'lib\itineraryTimeline.ts'
    'attachmentGroups.ts' = 'lib\attachmentGroups.ts'
    'fx.ts'               = 'lib\fx.ts'
    'costs.ts'            = 'lib\costs.ts'
    'TripDetail.tsx'      = 'pages\TripDetail.tsx'
    'AddLink.tsx'         = 'pages\AddLink.tsx'
    'Upload.tsx'          = 'pages\Upload.tsx'
    'Dashboard.tsx'       = 'pages\Dashboard.tsx'
    'Settings.tsx'        = 'pages\Settings.tsx'
    'AllCosts.tsx'        = 'pages\AllCosts.tsx'
    'TripCard.tsx'        = 'components\TripCard.tsx'
    'WeatherForecast.tsx' = 'components\WeatherForecast.tsx'
    'BottomNav.tsx'       = 'components\BottomNav.tsx'
    'PaymentBadge.tsx'    = 'components\PaymentBadge.tsx'
    'CostsTab.tsx'        = 'components\CostsTab.tsx'
    'deploy-claude-files.ps1' = 'deploy-claude-files.ps1'
}

# Filename -> path relative to the repo root (i.e. NOT under src\)
$RootFileMap = @{
    'package.json'      = 'package.json'
    'package-lock.json' = 'package-lock.json'
    'AGENTS.md'         = 'AGENTS.md'
    'README.md'         = 'README.md'
    'netlify.toml'      = 'netlify.toml'
    'schema.sql'        = 'supabase\schema.sql'
    'index.html'        = 'index.html'
    'vite.config.ts'    = 'vite.config.ts'
    'icon.svg'                = 'public\icon.svg'
    'icon-192.png'            = 'public\icon-192.png'
    'icon-512.png'            = 'public\icon-512.png'
    'icon-maskable-192.png'   = 'public\icon-maskable-192.png'
    'icon-maskable-512.png'   = 'public\icon-maskable-512.png'
}

$SrcRoot = Join-Path $RepoRoot 'src'

# Filename -> path relative to $OneDriveRoot. For files that aren't part
# of the repo at all -- currently just the roadmap doc, which lives in
# Mark's OneDrive-synced Projects folder, not the git repo.
$OneDriveFileMap = @{
    'Holiday_App_Issues_and_Roadmap.md' = 'Holiday_App_Issues_and_Roadmap.md'
}

if (-not (Test-Path $RepoRoot)) {
    Write-Error "Repo folder not found at '$RepoRoot'. Pass -RepoRoot to override."
    exit 1
}

if (-not (Test-Path $SourceFolder)) {
    Write-Error "Source folder not found at '$SourceFolder'. Pass -SourceFolder to override."
    exit 1
}

$verb = if ($KeepSource) { 'Copying' } else { 'Moving' }
$matched = 0

# Scratch folder for extracting any zip(s) -- cleaned up at the end
# regardless of -KeepSource, since it's just working space, not a real copy.
$tempExtract = Join-Path $env:TEMP "claude-deploy-$([guid]::NewGuid())"

# Build one list of candidate files: loose files in SourceFolder, plus the
# extracted contents of any zip(s) in SourceFolder (from "Download all").
$candidates = @()
$zipsToClean = @()
$looseFilesToClean = @()

Get-ChildItem -Path $SourceFolder -File | Where-Object { $_.Extension -ne '.zip' } | ForEach-Object {
    $candidates += $_
    $looseFilesToClean += $_
}

Get-ChildItem -Path $SourceFolder -File -Filter '*.zip' | ForEach-Object {
    $zip = $_
    $extractPath = Join-Path $tempExtract $zip.BaseName
    New-Item -ItemType Directory -Path $extractPath -Force | Out-Null
    Expand-Archive -Path $zip.FullName -DestinationPath $extractPath -Force
    Get-ChildItem -Path $extractPath -File -Recurse | ForEach-Object { $candidates += $_ }
    $zipsToClean += $zip
}

foreach ($file in $candidates) {
    # Strip a Windows/Chrome duplicate-download suffix like " (1)" before
    # the extension, so a re-download ("TripDetail (1).tsx") still matches
    # a map entry for "TripDetail.tsx".
    $normalizedName = $file.Name -replace '\s\(\d+\)(\.\w+)$', '$1'

    # Root-level files (package.json, schema.sql, AGENTS.md, ...) are
    # checked first, since a couple of names (README.md) could plausibly
    # collide with a src\ file in the future -- root wins if both matched.
    if ($RootFileMap[$normalizedName]) {
        $relativePath = $RootFileMap[$normalizedName]
        $base = $RepoRoot
    } elseif ($SrcFileMap[$normalizedName]) {
        $relativePath = $SrcFileMap[$normalizedName]
        $base = $SrcRoot
    } elseif ($OneDriveFileMap[$normalizedName]) {
        $relativePath = $OneDriveFileMap[$normalizedName]
        $base = $OneDriveRoot
    } else {
        continue  # not one of ours -- leave it alone
    }

    $destination = Join-Path $base $relativePath
    $destinationDir = Split-Path $destination -Parent
    if (-not (Test-Path $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Write-Host "$verb $($file.Name) -> $destination"
    Copy-Item -Path $file.FullName -Destination $destination -Force
    $matched++
}

# Clean up: remove the temp extraction folder always (just working space),
# and the original loose file(s)/zip unless -KeepSource was requested.
if (Test-Path $tempExtract) {
    Remove-Item -Path $tempExtract -Recurse -Force
}
if (-not $KeepSource) {
    foreach ($file in $looseFilesToClean) {
        $normalizedName = $file.Name -replace '\s\(\d+\)(\.\w+)$', '$1'
        if ($RootFileMap[$normalizedName] -or $SrcFileMap[$normalizedName] -or $OneDriveFileMap[$normalizedName]) {
            Remove-Item -Path $file.FullName -Force
        }
    }
    foreach ($zip in $zipsToClean) {
        Remove-Item -Path $zip.FullName -Force
    }
}

Write-Host ""
Write-Host "Done. $matched file(s) placed."
if ($matched -eq 0) {
    Write-Host "No matching files found in $SourceFolder -- check the file maps, or that Download all was used correctly."
}
