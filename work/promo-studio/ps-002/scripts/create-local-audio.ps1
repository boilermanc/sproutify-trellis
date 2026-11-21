param(
  [string]$Text = 'Rekkrd Listening Room.',
  [string]$VoiceFile = 'sample-vo.wav'
)

$ErrorActionPreference = 'Stop'

$proofRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$assetDir = Join-Path $proofRoot 'assets'
$voicePath = Join-Path $assetDir $VoiceFile
$musicPath = Join-Path $assetDir 'synthetic-music-bed.wav'

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# Use the machine's configured default voice. Installed voice display names are
# not portable and Windows can advertise a voice that fails explicit selection.
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToWaveFile($voicePath)
$synth.Speak($Text)
$synth.Dispose()

& ffmpeg -y -v error `
  -f lavfi -i 'sine=frequency=110:duration=10:sample_rate=48000' `
  -f lavfi -i 'sine=frequency=164.81:duration=10:sample_rate=48000' `
  -filter_complex '[0:a]volume=0.055[a0];[1:a]volume=0.025[a1];[a0][a1]amix=inputs=2:duration=longest,afade=t=in:st=0:d=0.7,afade=t=out:st=8:d=2,pan=stereo|c0=c0|c1=c0[out]' `
  -map '[out]' -c:a pcm_s16le $musicPath

if ($LASTEXITCODE -ne 0) {
  throw "ffmpeg failed while creating the foundation music bed."
}

Write-Output "Created foundation-only audio assets in $assetDir"
