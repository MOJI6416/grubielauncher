const LIMITER_THRESHOLD_DB = -1;
const LIMITER_RATIO = 20;
const LIMITER_ATTACK_S = 0.002;
const LIMITER_RELEASE_S = 0.1;
const SOFT_CLIP_KNEE = 0.9;
const SOFT_CLIP_POINTS = 4096;

export function softClipCurve(
  knee: number = SOFT_CLIP_KNEE,
  points: number = SOFT_CLIP_POINTS,
): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const span = 1 - knee;

  for (let index = 0; index < points; index++) {
    const x = (index / (points - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    const shaped =
      magnitude <= knee
        ? magnitude
        : knee + span * Math.tanh((magnitude - knee) / span);
    curve[index] = Math.sign(x) * shaped;
  }

  return curve;
}

let sharedCurve: Float32Array<ArrayBuffer> | null = null;

export interface BoostChain {
  gain: GainNode;
  nodes: AudioNode[];
}

export function createBoostChain(
  context: BaseAudioContext,
  boost: number,
): BoostChain {
  const gain = context.createGain();
  gain.gain.value = boost;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = LIMITER_THRESHOLD_DB;
  compressor.knee.value = 0;
  compressor.ratio.value = LIMITER_RATIO;
  compressor.attack.value = LIMITER_ATTACK_S;
  compressor.release.value = LIMITER_RELEASE_S;

  sharedCurve ??= softClipCurve();
  const clipper = context.createWaveShaper();
  clipper.curve = sharedCurve;

  return { gain, nodes: [gain, compressor, clipper] };
}
