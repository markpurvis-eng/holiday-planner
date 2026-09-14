<#
.SYNOPSIS
  Moves (or copies) Claude-generated Holiday Planner files from a flat
  folder — e.g. Downloads, where they land after downloading each one —
  into their correct locations under src/.

.USAGE
  From PowerShell, in any folder:
    .\deploy-claude-files.ps1

  If Windows blocks the script from running (execution policy), run it as:
    powershell -ExecutionPolicy Bypass -File .\deploy-claude-files.ps1

  Optional parameters:
    -SourceFolder <path>   Where the flat downloaded files are.
                           Default: your Downloads folder.
    -SrcRoot <path>        The src/ folder to copy into.
                           Default: C:\Users\markp\src\holiday-planner\src
    -KeepSource            Copy instead of move (leaves originals in place).

.NOTES
  The map below needs a new entry whenever Claude hands you a file it
  hasn't handed you before. Claude will reissue this script with the map
  updated whenever that happens — if a file isn't matching, you're
  probably running an older copy of this script.
#>

param(
    [string]$SourceFolder = "$env:USERPROFILE\Downloads",
    [string]$SrcRoot = "C:\Users\markp\src\holiday-planner\src",
    [switch]$KeepSource
)

# Filename -> path relative to src\
$FileMap = @{
    'format.ts'         = 'lib\format.ts'
    'types.ts'          = 'lib\types.ts'
    'weather.ts'        = 'lib\weather.ts'
    'version.ts'        = 'lib\version.ts'
    'TripDetail.tsx'    = 'pages\TripDetail.tsx'
    'AddLink.tsx'       = 'pages\AddLink.tsx'
    'Upload.tsx'        = 'pages\Upload.tsx'
    'Dashboard.tsx'     = 'pages\Dashboard.tsx'
    'Settings.tsx'      = 'pages\Settings.tsx'
    'TripCard.tsx'      = 'components\TripCard.tsx'
    'WeatherForecast.tsx' = 'components\WeatherForecast.tsx'
    'BottomNav.tsx'     = 'components\BottomNav.tsx'
    'PaymentBadge.tsx'  = 'components\PaymentBadge.tsx'
}

if (-not (Test-Path $SrcRoot)) {
    Write-Error "src folder not found at '$SrcRoot'. Pass -SrcRoot to override."
    exit 1
}

if (-not (Test-Path $SourceFolder)) {
    Write-Error "Source folder not found at '$SourceFolder'. Pass -SourceFolder to override."
    exit 1
}

$verb = if ($KeepSource) { 'Copying' } else { 'Moving' }
$matched = 0

Get-ChildItem -Path $SourceFolder -File | ForEach-Object {
    $file = $_
    # Strip a Windows/Chrome duplicate-download suffix like " (1)" before
    # the extension, so a re-download ("TripDetail (1).tsx") still matches
    # the map entry for "TripDetail.tsx".
    $normalizedName = $file.Name -replace '\s\(\d+\)(\.\w+)$', '$1'

    $relativePath = $FileMap[$normalizedName]
    if (-not $relativePath) {
        return  # not one of ours -- leave it alone
    }

    $destination = Join-Path $SrcRoot $relativePath
    $destinationDir = Split-Path $destination -Parent
    if (-not (Test-Path $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Write-Host "$verb $($file.Name) -> $relativePath"
    if ($KeepSource) {
        Copy-Item -Path $file.FullName -Destination $destination -Force
    } else {
        Move-Item -Path $file.FullName -Destination $destination -Force
    }
    $matched++
}

Write-Host ""
Write-Host "Done. $matched file(s) placed under $SrcRoot."
if ($matched -eq 0) {
    Write-Host "No matching files found in $SourceFolder -- check the file map or -SourceFolder path."
}
