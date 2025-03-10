import * as wgh from 'webgpu-utils';
import {ReactionDiffusionShader, ReactionDiffusionShaderDispatchSize} from '../shader/reaction-diffusion.js';
import {Float16Array} from '@petamoriken/float16';
import {isMobileDevice} from '../utils/is-mobile.js';

export class ReactionDiffusion {

    ITERATIONS = isMobileDevice ? 15 : 20;

    constructor(renderer, paint) {
        this.renderer = renderer;
        this.paint = paint;

        // create pipeline and bind group layouts
        const module = this.renderer.device.createShaderModule({ code: ReactionDiffusionShader });
        const defs = wgh.makeShaderDataDefinitions(ReactionDiffusionShader);
        this.pipelineDescriptor = {
            compute: {
                module,
                entryPoint: 'compute_main',
            }
        };
        const descriptors = wgh.makeBindGroupLayoutDescriptors(defs, this.pipelineDescriptor);
        descriptors[0].entries.push({
            binding: 2,
            storageTexture: { access: 'write-only', format: 'rgba16float' },
            visibility: GPUShaderStage.COMPUTE
        });
        this.bindGroupLayout = this.renderer.device.createBindGroupLayout(descriptors[0]);

        const pipelineLayout = this.renderer.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout]
        });
        this.computePipeline = this.renderer.device.createComputePipeline({
            label: 'reaction diffusion compute pipeline',
            layout: pipelineLayout,
            ...this.pipelineDescriptor
        });

        this.emptyTexture = this.renderer.device.createTexture({
            label: 'empty texture',
            size: [1, 1],
            dimension: '2d',
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.init(100, 100);
    }

    init(width, height) {
        this.createTextures(width, height);
        this.createBindGroups();
    }

    get resultStorageTexture() {
        return this.swapTextures[0];
    }

    createTextures(width, height) {
        if (this.swapTextures) {
            this.swapTextures.forEach(texture => texture.destroy());
        }

        this.swapTextures = new Array(2).fill(null).map((v, ndx) => {
            const texture = this.renderer.device.createTexture({
                size: { width, height },
                format: 'rgba16float',
                usage:
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.STORAGE_BINDING |
                    GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.RENDER_ATTACHMENT,
            });

            const w = width;
            const h = height;
            let data;
            //if (ndx === 0) {
                const rgba = new Array(w * h * 4).fill(0);
                const s = 20;
                const bx = [w / 2 - s, w / 2 + s];
                const by = [h / 2 - s, h / 2 + s];
                for(let x=0; x<w; x++) {
                    for(let y=0; y<h; y++) {
                        const v = x > bx[0] && x < bx[1] && y > by[0] && y < by[1];
                        rgba[(x + y * w) * 4 + 0] = 1;
                        rgba[(x + y * w) * 4 + 1] = 0;
                        rgba[(x + y * w) * 4 + 2] = 0;
                        rgba[(x + y * w) * 4 + 3] = 1;
                    }
                }
                data = new Float16Array(rgba);
            //} else {
            //   data = new Float16Array(new Array(w * h * 4).fill(0));
            //}

            this.renderer.device.queue.writeTexture({ texture }, data.buffer, { bytesPerRow: width * 8 }, { width, height });

            return texture;
        });

        this.dispatches = [
            Math.ceil(width / ReactionDiffusionShaderDispatchSize[0]),
            Math.ceil(height / ReactionDiffusionShaderDispatchSize[1])
        ];
    }

    createBindGroups() {
        this.swapBindGroups = [
            this.renderer.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: this.paint.resultStorageTexture.createView() },
                    { binding: 1, resource: this.swapTextures[0].createView() },
                    { binding: 2, resource: this.swapTextures[1].createView() },
                ]
            }),
            this.renderer.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: this.paint.resultStorageTexture.createView() },
                    { binding: 1, resource: this.swapTextures[1].createView() },
                    { binding: 2, resource: this.swapTextures[0].createView() },
                ]
            })
        ];
    }

    compute(computePassEncoder) {

        computePassEncoder.setPipeline(this.computePipeline);

        for(let i = 0; i < this.ITERATIONS; i++) {
            computePassEncoder.setBindGroup(0, this.swapBindGroups[0]);
            computePassEncoder.dispatchWorkgroups(this.dispatches[0], this.dispatches[1]);

            computePassEncoder.setBindGroup(0, this.swapBindGroups[1]);
            computePassEncoder.dispatchWorkgroups(this.dispatches[0], this.dispatches[1]);
        }
    }
}
