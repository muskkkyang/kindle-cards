param([Parameter(Mandatory=$true)][string]$ImagePath)
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
  $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $null = [Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
  $AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  function Await-Result($Operation, $ResultType) {
    $Task = $AsTask.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
    $Task.GetAwaiter().GetResult()
  }
  $Engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if (-not $Engine) { throw 'Windows OCR language pack unavailable. Install a language in Windows Settings > Time & language.' }
  $File = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync([IO.Path]::GetFullPath($ImagePath))) ([Windows.Storage.StorageFile])
  $Stream = Await-Result ($File.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  try {
    $Decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($Stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $Bitmap = Await-Result ($Decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    try {
      if ($Bitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $Bitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'Image exceeds the Windows OCR size limit.' }
      $Result = Await-Result ($Engine.RecognizeAsync($Bitmap)) ([Windows.Media.Ocr.OcrResult])
      $Lines = @($Result.Lines | ForEach-Object { $_.Text })
      [Console]::Out.WriteLine((@{ok=$true;text=($Lines -join "`n");language=$Engine.RecognizerLanguage.LanguageTag} | ConvertTo-Json -Compress))
    } finally { if ($Bitmap) { $Bitmap.Dispose() } }
  } finally { if ($Stream) { $Stream.Dispose() } }
} catch {
  [Console]::Out.WriteLine((@{ok=$false;message=$_.Exception.Message} | ConvertTo-Json -Compress))
}
