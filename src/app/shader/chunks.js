// language=C
export const PostProcessingVertexShader = `
struct Inputs {
    @location(0) position: vec2<f32>,
    @location(1) uv: vec2<f32>,
}

struct Output {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2f
}

@vertex
fn vertex_main(input: Inputs) -> Output {
    var output: Output;
    output.position = vec4(input.position, 0.0, 1.0);
    output.uv = input.uv;

    return output;
}
`;

// language=C
export const WGSLNoiseFunctions = `
fn rand_f32(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }

fn rand_vec2f(n: vec2f) -> f32 { 
    return fract(sin(dot(n, vec2f(12.9898, 4.1414))) * 43758.5453);
}

fn noise_f32(p: f32) -> f32 {
    let fl = floor(p);
    let fc = fract(p);
    return mix(rand_f32(fl), rand_f32(fl + 1.0), fc);
}

fn noise_vec2f(n: vec2f) -> f32 {
    let d: vec2f = vec2f(0.0, 1.0);
    let b: vec2f = floor(n);
    let f: vec2f = smoothstep(vec2f(0.0), vec2f(1.0), fract(n));
    return mix(mix(rand_vec2f(b), rand_vec2f(b + d.yx), f.x), mix(rand_vec2f(b + d.xy), rand_vec2f(b + d.yy), f.x), f.y);
}
`;

// language=C
export const WGSLSegmentSDF = `
fn sdSegment( p: vec2f, a: vec2f, b: vec2f ) -> vec2f {
    let pa = p-a;
    let ba = b-a;
    let h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return vec2f(length( pa - ba*h ), h);
}
`;

// language=C
export const WGSLBilinearSample = `
fn texture2D_bilinear(t: texture_2d<f32>, uv: vec2f, dims: vec2u) -> vec4f {
    let sample: vec2u = vec2u(uv);
    let tl: vec4f = textureLoad(t, clamp(sample, vec2u(1, 1), dims), 0);
    let tr: vec4f = textureLoad(t, clamp(sample + vec2u(1, 0), vec2u(1, 1), dims), 0);
    let bl: vec4f = textureLoad(t, clamp(sample + vec2u(0, 1), vec2u(1, 1), dims), 0);
    let br: vec4f = textureLoad(t, clamp(sample + vec2u(1, 1), vec2u(1, 1), dims), 0);
    let f: vec2f = fract(uv);
    let tA: vec4f = mix(tl, tr, f.x);
    let tB: vec4f = mix(bl, br, f.x);
    return mix(tA, tB, f.y);
}
`;


// language=C
export const WGSLMapFunction = `
fn map(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
  return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
}
`;


// Credit: https://github.com/mrdoob/three.js/blob/master/src/renderers/shaders/ShaderChunk/dithering_pars_fragment.glsl.js
// language=C
export const WGSLDitheringFunction = `
fn rand_vec2f(n: vec2f) -> f32 { 
    return fract(sin(dot(n, vec2f(12.9898, 4.1414))) * 43758.5453);
}

fn dithering(uv: vec2f, color: vec3<f32>) -> vec3<f32> {
    let grid_position: f32 = rand_vec2f(uv);
    var dither_shift_RGB: vec3<f32> = vec3<f32>(0.25 / 255., -0.25 / 255., 0.25 / 255.);
    dither_shift_RGB = mix(2. * dither_shift_RGB, -2. * dither_shift_RGB, grid_position);
    return color + dither_shift_RGB;
} 
`;
