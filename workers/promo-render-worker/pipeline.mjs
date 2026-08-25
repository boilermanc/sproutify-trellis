const finite = value => typeof value === 'number' && Number.isFinite(value);
const pathValue = (value, label) => {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new Error(`${label} path is invalid.`);
  return value;
};
const secondsValue = value => {
  if (!finite(value) || value < 1 || value > 600) throw new Error('Target duration must be between 1 and 600 seconds.');
  return String(value);
};
const measuredValue = (measurement, key) => {
  const value = Number(measurement?.[key]);
  if (!Number.isFinite(value)) throw new Error(`Loudness measurement ${key} is invalid.`);
  return String(value);
};

export const PROMO_RENDER_PIPELINE_VERSION = 'vertical-h264-v1';

export function buildLoudnessAnalysisArgs(inputPath, nullDevice) {
  return Object.freeze([
    '-hide_banner', '-nostats', '-i', pathValue(inputPath, 'Input'),
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json',
    '-f', 'null', pathValue(nullDevice, 'Null device'),
  ]);
}

export function buildFinalizeArgs({ inputPath, outputPath, targetSeconds, measurement }) {
  const loudnessFilter = [
    'loudnorm=I=-14:TP=-1.5:LRA=7',
    `measured_I=${measuredValue(measurement, 'input_i')}`,
    `measured_TP=${measuredValue(measurement, 'input_tp')}`,
    `measured_LRA=${measuredValue(measurement, 'input_lra')}`,
    `measured_thresh=${measuredValue(measurement, 'input_thresh')}`,
    `offset=${measuredValue(measurement, 'target_offset')}`,
    'linear=false',
  ].join(':');
  return Object.freeze([
    '-y', '-v', 'error', '-i', pathValue(inputPath, 'Input'),
    '-t', secondsValue(targetSeconds), '-af', loudnessFilter,
    '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', '30',
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
    pathValue(outputPath, 'Output'),
  ]);
}

export function buildCorrectionArgs({ inputPath, outputPath, targetSeconds, measuredIntegratedLufs }) {
  const integrated = Number(measuredIntegratedLufs);
  const correctionDb = -14 - integrated;
  if (!Number.isFinite(correctionDb) || Math.abs(correctionDb) > 3) {
    throw new Error('Normalized loudness correction exceeds the 3 dB safety bound.');
  }
  return Object.freeze([
    '-y', '-v', 'error', '-i', pathValue(inputPath, 'Input'),
    '-t', secondsValue(targetSeconds), '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy',
    '-af', `volume=${correctionDb.toFixed(3)}dB,alimiter=limit=0.79:level=false`,
    '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-movflags', '+faststart',
    pathValue(outputPath, 'Output'),
  ]);
}

export function buildProbeArgs(inputPath) {
  return Object.freeze(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', pathValue(inputPath, 'Input')]);
}
