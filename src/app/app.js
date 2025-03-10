import {WebGPURenderer} from './renderer/webgpu-renderer.js';
import {CompositePass} from './post-processing/composite-pass.js';
import {ReactionDiffusion} from './compute/reaction-diffusion.js';
import {Paint} from './compute/paint.js';
import {isMobileDevice} from './utils/is-mobile.js';
import {TimingHelper} from './utils/timing-helper.js';
import {RollingAverage} from './utils/rolling-average.js';

let devicePixelRatio, renderer, paint, reactionDiffusion, compositePass, timingHelper;

const gpuComputeTimeAverage = new RollingAverage(100);

const REACTION_DIFFUSION_RESOLUTION_FACTOR = isMobileDevice ? .2 : 0.25;

const PAINT_RESOLUTION_FACTOR = 0.75;

const timing = {
  // the target duration of one frame in milliseconds
  TARGET_FRAME_DURATION_MS: 16,

  // total time in milliseconds
  timeMS: 0,

  // duration between the previous and the current animation frame in milliseconds
  deltaTimeMS: 0,

  // total frame count according to the target frame duration
  frames: 0,

  // relative frames according to the target frame duration (1 = 60 fps)
  // gets smaller with higher frame rates --> use to adapt animation timing
  deltaFrames: 0,
};

const pointerInfo = {
  isDown: false,

  // normalized pointer position (0..1, flip-y)
  position: [0, 0],

  // normalized pointer position from the previous frame
  previousPosition: [0, 0],
};

async function init() {
  const adapter = await navigator.gpu?.requestAdapter();

  if (!adapter) return;

  const canvas = document.querySelector('canvas');
  devicePixelRatio = Math.min(2, window.devicePixelRatio);

  renderer = new WebGPURenderer(canvas, devicePixelRatio);
  await renderer.init(adapter);

  timingHelper = new TimingHelper(renderer.device);

  paint = new Paint(renderer);

  reactionDiffusion = new ReactionDiffusion(renderer, paint);

  compositePass = new CompositePass(renderer, paint, reactionDiffusion);
  await compositePass.init();

  initPointerInteraction(canvas);
  initResizeObserver(canvas);

  run(0);
}

function initPointerInteraction(canvas) {
  canvas.addEventListener('pointerdown', e => onPointerDown(e));
  canvas.addEventListener('pointerup', e => onPointerUp(e));
  canvas.addEventListener('pointerleave', e => onPointerUp(e));
  canvas.addEventListener('pointermove', e => onPointerMove(e));
}

function getNormalizedPointerPosition(e) {
  const size = [window.innerWidth, window.innerHeight];
  return [
    e.clientX / size[0],
    1 - (e.clientY / size[1])
  ];
}

function onPointerDown(e) {
  pointerInfo.isDown = true;

  pointerInfo.position = getNormalizedPointerPosition(e);
  pointerInfo.previousPosition = [...pointerInfo.position];
}

function onPointerMove(e) {
  if (!pointerInfo.isDown) return;

  pointerInfo.position = getNormalizedPointerPosition(e);
}

function onPointerUp(e) {
  pointerInfo.isDown = false;
}

function initResizeObserver(canvas) {
  // handle resizing of the canvas
  const observer = new ResizeObserver(entries => {
    const entry = entries[0];
    const contentBox = entry.contentBoxSize;
    const dpContentBox = entry.devicePixelContentBoxSize;
    const width = dpContentBox?.[0].inlineSize || contentBox[0].inlineSize * devicePixelRatio;
    const height = dpContentBox?.[0].blockSize || contentBox[0].blockSize * devicePixelRatio;
    resize(width, height);
  });
  observer.observe(canvas);
}

function run(t = 0) {
  updateTiming(t);

  const commandEncoder = renderer.device.createCommandEncoder();

  animate(commandEncoder);
  render(commandEncoder);

  renderer.device.queue.submit([commandEncoder.finish()]);

  timingHelper.getResult().then(gpuTime => gpuComputeTimeAverage.addSample(gpuTime / 1000));

  requestAnimationFrame(t => run(t));
}

function resize(width, height) {
  if (width <= 1 || height <=1 ) return;

  renderer.setSize(width, height);
  const viewportSize = renderer.getSize();

  paint.init(
      Math.round(viewportSize[0] * PAINT_RESOLUTION_FACTOR),
      Math.round(viewportSize[1] * PAINT_RESOLUTION_FACTOR)
  );

  reactionDiffusion.init(
      Math.round(viewportSize[0] * REACTION_DIFFUSION_RESOLUTION_FACTOR),
      Math.round(viewportSize[1] * REACTION_DIFFUSION_RESOLUTION_FACTOR)
  );

  compositePass.setSize(viewportSize[0], viewportSize[1]);
}

function animate(commandEncoder) {
  const computePassEncoder = timingHelper.beginComputePass(commandEncoder);

  paint.compute(computePassEncoder, timing, pointerInfo);
  reactionDiffusion.compute(computePassEncoder);
  computePassEncoder.end();

  pointerInfo.previousPosition = [...pointerInfo.position];
}

function render(commandEncoder) {
  const compositePassEncoder = commandEncoder.beginRenderPass({...compositePass.renderPassDescriptor});
  compositePass.render(compositePassEncoder);
  compositePassEncoder.end();
}

function updateTiming(t) {
  timing.deltaTimeMS = Math.max(1, Math.min(timing.TARGET_FRAME_DURATION_MS * 2, t - timing.timeMS));
  timing.timeMS = t;
  timing.deltaFrames = timing.deltaTimeMS / timing.TARGET_FRAME_DURATION_MS;
  timing.frames += timing.deltaFrames;
}

export const App = {
  init,
  gpuComputeTimeAverage
};
