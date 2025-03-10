// language=C
import {WGSLDitheringFunction} from './chunks.js';

export const CompositeShader = `

@group(0) @binding(0) var colorTexSampler: sampler;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var paintTex: texture_2d<f32>;

// Based on: https://www.shadertoy.com/view/ldBfRV
fn distort(r: vec2<f32>, alpha: f32) -> vec2<f32> {
    return r + r * -alpha * (1. - dot(r, r) * 1.25);
}

fn pal(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    return a + b * cos(6.28318 * (c * t + d));
}

${WGSLDitheringFunction}

@fragment
fn frag_main(@location(0) uv : vec2f) -> @location(0) vec4f {
    let colorTexSize : vec2f = vec2f(textureDimensions(colorTex));
    let colorTexelSize = 1. / colorTexSize;
    
    // bulge distortion
    var st: vec2f = uv * 2. - 1.;
    st *= 0.5;
    st = distort(st, -1.);
    st = st * .5 + .5;

    var color : vec4f = textureSample(colorTex, colorTexSampler, st);
    var paint : vec4f = textureSample(paintTex, colorTexSampler, st);
    let vel: vec2f = paint.xy;
    let velLen: f32 = dot(vel, vel);
    
    // b/w contour
    let contourHardness = min(.4, velLen * 20.);
    var contour: vec3f = 1. - vec3f(smoothstep(0. + contourHardness * .3, .9 - contourHardness, color.g));
    
    // emboss effect
    let embossScale = 2.;
    let tlColor: vec4f = textureSample(colorTex, colorTexSampler, st + vec2(-colorTexelSize.x,  colorTexelSize.y) * embossScale);
    let brColor: vec4f = textureSample(colorTex, colorTexSampler, st + vec2(colorTexelSize.x,  -colorTexelSize.y) * embossScale);
    let c: f32 = smoothstep(0.0, 0.4, color.g);
    let tl: f32 = smoothstep(0.0, 0.4, tlColor.g);
    let br: f32 = smoothstep(0.0, 0.4, brColor.g);
    var emboss: vec3f = vec3f(2.0 * br - c - tl);
    let luminance: f32 = clamp(0.299 * emboss.r + 0.587 * emboss.g + 0.114 * emboss.b, 0.0, 1.0);
    emboss = (emboss * .04) + 1.;
    var ext: vec3f = 1. - vec3f(br + c + tl) / 3.;
    
    // main color
    let t: f32 = ext.r * .01 + contour.r * 1.5 + 0.3 + min(1., velLen * 1.);
    var base: vec3f = pal(t, vec3(0.5,0.5,0.8),vec3(0.5,0.5,0.65),vec3(1.0,1.0,1.0),vec3(0.,0.33,0.67));
    base = mix(base, vec3f(1.), smoothstep(0.7, 1., contour.r));
    // desaturate
    base = mix(base, vec3(dot(vec3(.3, .59, .11), base)), .4); 
    let contrast = 1.3;
    let brightness = .1;
    base = (base - 0.5) * contrast + 0.5 + brightness;
    let alpha: f32 = smoothstep(0.4, .9, contour.r);
    base = mix(base, vec3f(0.96, 0.96, 0.97), alpha);
    
    // vignette overlay
    let vignette: f32 = dot(uv * 2. - 1., uv * 2. - 1.);
    base += vignette * .1;

    return vec4(dithering(uv, base * emboss), 1.);
    //return vec4(ext, 1.);
}

`;
