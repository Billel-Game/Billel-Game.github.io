param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,

    [string]$OutputPath = (Join-Path $PSScriptRoot "..\data\cards.json")
)

$resolvedCsvPath = (Resolve-Path $CsvPath).Path
$lines = [System.IO.File]::ReadAllLines($resolvedCsvPath)
$headerIndex = -1
for ($index = 0; $index -lt $lines.Length; $index += 1) {
    if ($lines[$index] -like "List Type,*") {
        $headerIndex = $index
        break
    }
}

if ($headerIndex -lt 0) {
    throw "Could not find the Manabox collection header."
}

$csvText = ($lines[$headerIndex..($lines.Length - 1)] -join "`n")
$rows = $csvText | ConvertFrom-Csv
$cardsByKey = [ordered]@{}

foreach ($row in $rows) {
    if (-not $row."Card Name") { continue }

    $collection = ($row.Collection -as [string]).Trim()
    if (-not $collection) { $collection = "Magic" }
    $collection = $collection.ToLowerInvariant()
    $game = "mtg"
    if ($collection -eq "pok" -or $collection.Contains("pokemon")) { $game = "pok" }
    elseif ($collection -eq "ygo" -or $collection.Contains("yu-gi-oh") -or $collection.Contains("yugioh")) { $game = "ygo" }
    elseif ($collection -eq "op" -or $collection.Contains("one piece")) { $game = "op" }

    $setCode = ($row."Set Code" -as [string]).Trim()
    $number = ($row."Card Number" -as [string]).Trim()
    if (-not $number) { $number = "\u2014" }

    $folder = ($row."List Name" -as [string]).Trim()
    if (-not $folder) { $folder = ($row."Parent List Name" -as [string]).Trim() }
    if (-not $folder) { $folder = "Unsorted" }

    $printing = ($row.Printing -as [string]).Trim()
    if (-not $printing) { $printing = "Normal" }
    $condition = ($row.Condition -as [string]).Trim()
    if (-not $condition) { $condition = "Unknown" }
    $language = ($row.Language -as [string]).Trim()
    if (-not $language) { $language = "Unknown" }

    $key = "$folder|$game|$setCode|$number|$printing|$condition|$language"
    $quantity = [int]($row.Quantity)
    if ($quantity -lt 1) { $quantity = 1 }

    if ($cardsByKey.Contains($key)) {
        $cardsByKey[$key].quantity += $quantity
        $prices = @($cardsByKey[$key]._prices) + @([double]($row."Current Price (tcgplayer_marketsellprice)"))
        $cardsByKey[$key]._prices = @($prices | Where-Object { $_ -gt 0 })
        $cardsByKey[$key].price = (($cardsByKey[$key]._prices | Measure-Object -Average).Average)
        $cardsByKey[$key].bought = $cardsByKey[$key].price
        continue
    }

    $price = [double]($row."Current Price (tcgplayer_marketsellprice)")
    $idPart = "$setCode-$number-$printing-$condition".ToLowerInvariant() -replace "\s+", "-"

    $card = [ordered]@{
        id = $idPart
        name = ($row."Card Name" -as [string]).Trim()
        game = $game
        folder = $folder
        quantity = $quantity
        price = $price
        bought = $price
        set = ($row."Set Name" -as [string]).Trim()
        setCode = $setCode
        number = $number
        condition = $condition
        rarity = ($row.Rarity -as [string]).Trim()
        printing = $printing
        language = $language
        imageUrl = if ($game -eq "mtg" -and $setCode) {
            $cardName = [uri]::EscapeDataString(($row."Card Name" -as [string]).Trim())
            $setName = [uri]::EscapeDataString($setCode.ToLowerInvariant())
            "https://api.scryfall.com/cards/named?exact=$cardName&set=$setName&format=image&version=normal"
        } else { $null }
        priceSource = if ($price -gt 0) { "CSV export" } else { "Awaiting price check" }
    }

    $prices = @([double]($row."Current Price (tcgplayer_marketsellprice)") | Where-Object { $_ -gt 0 })
    $card._prices = $prices
    $card.price = if ($prices.Count) { ($prices | Measure-Object -Average).Average } else { 0 }
    $card.bought = $card.price
    $cardsByKey[$key] = [pscustomobject]$card
}

$outputFile = [System.IO.Path]::GetFullPath($OutputPath)
$exportCards = foreach ($card in $cardsByKey.Values) {
    [ordered]@{
    id = $card.id
    name = $card.name
    game = $card.game
    folder = $card.folder
    quantity = $card.quantity
    price = [Math]::Round([double]$card.price, 4)
    bought = [Math]::Round([double]$card.bought, 4)
    set = $card.set
    setCode = $card.setCode
    number = $card.number
    condition = $card.condition
    rarity = $card.rarity
    printing = $card.printing
    language = $card.language
    imageUrl = $card.imageUrl
    priceSource = $card.priceSource
    }
}
$exportCards | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $outputFile
Write-Output "Converted $($cardsByKey.Count) cards to $outputFile"
