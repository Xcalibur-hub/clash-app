#Requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$OutFile)
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$cloud = Split-Path -Parent $PSScriptRoot
. (Join-Path $cloud 'tools/lib/clash-native.ps1')
$entries = @((Get-Content (Join-Path $cloud 'manifest.json') -Raw | ConvertFrom-Json).entries)
$cases = New-Object System.Collections.Generic.List[object]
function Check([string]$Name, [bool]$Pass) {
  $cases.Add([ordered]@{name=$Name;pass=$Pass})
  if (-not $Pass) { throw ('FAIL: ' + $Name) }
}
Check 'authoritative119' ($entries.Count -eq 119)
$rows = @($entries | ForEach-Object { $_.version + '|sha256:' + $_.normalizedSha256 })
$parsed = ConvertFrom-ClashLedgerOutput -Text ($rows -join "`n") -Entries $entries
Check 'all119parse' ($parsed.ok -and $parsed.rows -eq 119)
$v = Get-LedgerVerdict -Entries $entries -Ledger $parsed.ledger
Check 'all119consistent' ($v.verdict -ceq 'CONSISTENT' -and $v.total -eq 119)
$empty = ConvertFrom-ClashLedgerOutput -Text '' -Entries $entries -TableAbsent $true
$v = Get-LedgerVerdict -Entries $entries -Ledger $empty.ledger -TableAbsent $true
Check 'absentEmpty' ($empty.ok -and $v.verdict -ceq 'EMPTY')
$prefix = ConvertFrom-ClashLedgerOutput -Text ($rows[0..117] -join "`n") -Entries $entries
$v = Get-LedgerVerdict -Entries $entries -Ledger $prefix.ledger
Check '118freshOnlyPrefix' ($prefix.ok -and $v.verdict -ceq 'PARTIAL_PREFIX' -and $v.missing.Count -eq 1)
$gapRows = @($rows[0..49]) + @($rows[51..118])
$gap = ConvertFrom-ClashLedgerOutput -Text ($gapRows -join "`n") -Entries $entries
$v = Get-LedgerVerdict -Entries $entries -Ledger $gap.ledger
Check 'middleMissingIsProblem' ($v.verdict -ceq 'PROBLEM' -and $v.gaps.Count -gt 0)
$wrong = $parsed.ledger.Clone()
$wrong[$entries[118].version] = 'sha256:' + ('0' * 64)
$v = Get-LedgerVerdict -Entries $entries -Ledger $wrong
Check 'identityMismatch' ($v.verdict -ceq 'PROBLEM' -and $v.mismatch.Count -eq 1)
$duplicate = ConvertFrom-ClashLedgerOutput -Text (($rows + $rows[118]) -join "`n") -Entries $entries
Check 'duplicateLedgerRejected' (-not $duplicate.ok -and $duplicate.duplicates.Count -eq 1)
$unknown = ConvertFrom-ClashLedgerOutput -Text '20990101000000|sha256:0000000000000000000000000000000000000000000000000000000000000000' -Entries $entries
Check 'unknownLedgerRejected' (-not $unknown.ok -and $unknown.unknownVersions.Count -eq 1)
$malformed = ConvertFrom-ClashLedgerOutput -Text ($entries[0].version + '|bad-token') -Entries $entries
Check 'malformedLedgerRejected' (-not $malformed.ok)
$absent = ConvertFrom-ClashLedgerOutput -Text $rows[0] -Entries $entries -TableAbsent $true
Check 'absentWithRowsRejected' (-not $absent.ok)
$result = [ordered]@{runtime=$PSVersionTable.PSVersion.ToString();edition=$PSVersionTable.PSEdition;passed=$cases.Count;failed=0;cases=$cases.ToArray()}
Write-Evidence -Path $OutFile -Text ($result | ConvertTo-Json -Depth 6)
Write-Host ('LEDGER-STATE: ' + $cases.Count + ' passed, 0 failed')
