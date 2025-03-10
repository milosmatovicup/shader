
// shader constants
import {WGSLNoiseFunctions, WGSLSegmentSDF} from './chunks.js';

const workgroupSize = [8, 8];
// each thread handles a tile of pixels
const tileSize = [2, 2];
// the required number of workgroup dispatches is given by
// dividing the total area by the dispatch size
const dispatchSize = [
    tileSize[0] * workgroupSize[0],
    tileSize[1] * workgroupSize[1]
];

export const PaintDispatchSize = dispatchSize;

// language=C
export const PaintShader = `

struct RenderInfo {
    viewportSize: vec2f,
    deltaTimeMS: f32,
    timeMS: f32
};

struct PointerInfo {
    position: vec2f,
    previousPosition: vec2f,
    velocity: vec2f,
    previousVelocity: vec2f,
};

const dispatchSize = vec2u(${dispatchSize[0]},${dispatchSize[1]});
const tileSize = vec2u(${tileSize[0]},${tileSize[1]});

@group(0) @binding(0) var<uniform> renderInfo: RenderInfo;
@group(0) @binding(1) var<uniform> pointerInfo: PointerInfo;
@group(1) @binding(0) var inputTex: texture_2d<f32>;
@group(1) @binding(1) var outputTex: texture_storage_2d<rgba16float, write>;

${WGSLSegmentSDF}

${WGSLNoiseFunctions}

@compute @workgroup_size(${workgroupSize[0]}, ${workgroupSize[1]}, 1)
fn compute_main(
  @builtin(workgroup_id) workGroupID : vec3<u32>,
  @builtin(local_invocation_id) localInvocationID : vec3<u32>,
  @builtin(global_invocation_id) globalInvocationID : vec3<u32>
) {
  // the local pixel offset of this threads tile
  let tileOffset: vec2u = localInvocationID.xy * tileSize;

  // the global pixel offset of the workgroup
  let dispatchOffset: vec2u = workGroupID.xy * dispatchSize;
  
  let dims: vec2u = vec2<u32>(textureDimensions(inputTex, 0));
  let deviceSizeFactor = 3. - clamp((f32(max(dims.x, dims.y)) / 800.), 0., 3.);
  
  let aspectFactor: vec2f = vec2f(dims) / f32(max(dims.x, dims.y));

  // run through the whole tile
  for (var c=0u; c<tileSize.x; c++) {
    for (var r=0u; r<tileSize.y; r++) {
      let local: vec2u = vec2u(c, r) + tileOffset;
      let sample: vec2u = dispatchOffset + local;
      let inputValue = textureLoad(inputTex, sample, 0);
      
      // get the uv coords from the sample position to calculate the signed distance field value
      var uv: vec2f = vec2f(sample) / vec2f(dims);
      
      // aspect correction
      let st = ((uv * 2. - 1.) * aspectFactor) * .5 + .5;
      let pointerPos = ((pointerInfo.position * 2. - 1.) * aspectFactor) * .5 + .5;
      let prevPointerPos = ((pointerInfo.previousPosition * 2. - 1.) * aspectFactor) * .5 + .5;
      
      // get the distance to the segment to draw
      let sdf = sdSegment(st, pointerPos, prevPointerPos);
      let dist = max(0., sdf.x);
      
      // calculate the radius for the new and previous point
      let radiusScale = 1.5;
      let offset = pointerInfo.velocity * renderInfo.deltaTimeMS;
      let strength = length(offset);
      let newRadius = strength * radiusScale;
      let prevOffset = pointerInfo.previousVelocity * renderInfo.deltaTimeMS;
      let prevRadius = length(prevOffset) * radiusScale;
      
      // interpolate between previous and new radius over the segment length
      var radius = newRadius * (1. - sdf.y) + prevRadius * sdf.y;
      radius = clamp(radius, 0.0, .1);
      
      // generate velocity noise
      let normPointerVel = normalize(pointerInfo.velocity);
      let pointerBase = mat2x2f(normPointerVel, vec2f(normPointerVel.y, -normPointerVel.x));
      let noiseDir = pointerBase * (st - pointerInfo.position);
      var noiseVel: vec2f = vec2f(
        noise_vec2f(noiseDir * vec2f(35., 15.) + renderInfo.timeMS * 0.01) * 4. - 2.,
        noise_vec2f(noiseDir * vec2f(10., 30.) + renderInfo.timeMS * 0.001) * 2. - 1.
      );
      
      // get a smooth paint from the distance to the segment
      let smoothness = .05 * deviceSizeFactor;
      var paint = 1. - smoothstep(radius, radius + smoothness, dist + smoothness * .4 + noiseVel.y * .01);
      
      // the strength according to the velocity
      paint = min(1., paint * strength * 200.);
      
      // the velocity has more influence than the actual paint
      let velocityMaskRadius = radius * 4.;
      let velocityMaskSmoothness = .05;
      let velocityMask = 1. - smoothstep(velocityMaskRadius, velocityMaskRadius + velocityMaskSmoothness, dist + velocityMaskSmoothness * .2 + noiseVel.x * .01);
      // amplify the pointer velocity
      var vel: vec2f = pointerInfo.velocity * 1000. * (renderInfo.deltaTimeMS / 16.);
      // mask the velocity
      vel *= velocityMask;
      // combine the new velocity with a bit of the current samples velocity
      vel = (inputValue.xy + vel) / 2.;
      
      // calculate the general flow field velocity for this sample (center force)
      var flowVel = (st * 2. - 1.);
      flowVel = normalize(flowVel) * min(0.25, max(0., (length(flowVel))));
      // add a little bit of force from the current pointer position
      var pointerOffsetVel = pointerInfo.position - uv;
      pointerOffsetVel = normalize(pointerOffsetVel) * (1. - smoothstep(0., 1., length(pointerOffsetVel)));
      flowVel -= pointerOffsetVel * 0.1;
      
      // find the input value which was moved to this samples location
      let velOffsetStrength = .015;
      let velOffset: vec2u = vec2u((uv - (vel * 2. + flowVel + noiseVel * .1) * velOffsetStrength) * vec2f(dims));
      let offsetInputValue = textureLoad(inputTex, velOffset, 0);
      
      // combine with the previous paint
      paint += offsetInputValue.b;
      paint = clamp(paint, 0., 1.);
      // dissipate the paint over time
      paint *= 0.925;

      // move velocity
      vel = (offsetInputValue.xy * 1.5 + vel) / 2.;
      // dissipate the velocity over time
      vel *= 0.96;
      
      var result: vec4f = vec4(vec4(vel, paint, paint));
      //var result: vec4f = vec4(vec4(step(vec2f(0.5), st), paint, paint));

      textureStore(outputTex, sample, result);
    }
  }
}

`;
