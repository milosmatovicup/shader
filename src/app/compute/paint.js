import * as wgh from 'webgpu-utils';
import {PaintDispatchSize, PaintShader} from '../shader/paint.js';

export class Paint {

    pointerInfo = {
        // normalized pointer position (0..1, flip-y)
        position: [0, 0],

        // velocity of the normalized pointer position
        velocity: [0, 0],

        // normalized pointer position from the previous frame
        previousPosition: [0, 0],

        // previous velocity of the normalized pointer position
        previousVelocity: [0, 0],
    };

    constructor(renderer) {
        this.renderer = renderer;

        // create pipeline and bind group layouts
        const module = this.renderer.device.createShaderModule({ code: PaintShader });
        const defs = wgh.makeShaderDataDefinitions(PaintShader);
        this.pipelineDescriptor = {
            compute: {
                module,
                entryPoint: 'compute_main',
            }
        };
        const descriptors = wgh.makeBindGroupLayoutDescriptors(defs, this.pipelineDescriptor);
        descriptors[1].entries.push({
            binding: 1,
            storageTexture: { access: 'write-only', format: 'rgba16float' },
            visibility: GPUShaderStage.COMPUTE
        });
        this.texturesBindGroupLayout = this.renderer.device.createBindGroupLayout(descriptors[1]);

        // create uniform buffers, layouts and bind groups
        const renderInfoUniformView = wgh.makeStructuredView(defs.uniforms.renderInfo);
        this.renderInfoUniform = {
            view: renderInfoUniformView,
            buffer: renderer.device.createBuffer({
                size: renderInfoUniformView.arrayBuffer.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
        };
        const pointerInfoUniformView = wgh.makeStructuredView(defs.uniforms.pointerInfo);
        this.pointerInfoUniform = {
            view: pointerInfoUniformView,
            buffer: renderer.device.createBuffer({
                size: pointerInfoUniformView.arrayBuffer.byteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
        };
        const uniformsBindGroupLayout = this.renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: this.renderInfoUniform.buffer
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: this.pointerInfoUniform.buffer
                }
            ]
        });
        this.uniformsBindGroup = this.renderer.device.createBindGroup({
            layout: uniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.renderInfoUniform.buffer }},
                { binding: 1, resource: { buffer: this.pointerInfoUniform.buffer }},
            ],
        });

        const pipelineLayout = this.renderer.device.createPipelineLayout({
            bindGroupLayouts: [uniformsBindGroupLayout, this.texturesBindGroupLayout]
        });
        this.computePipeline = this.renderer.device.createComputePipeline({
            label: 'paint compute pipeline',
            layout: pipelineLayout,
            ...this.pipelineDescriptor
        });

        this.init(100, 100);
    }

    init(width, height) {
        // bind groups are swapped each frame
        this.currentSwapIndex = 0;

        // throttle the pointer velocity on smaller devices
        this.pointerVelocityAttenuation = Math.min(1, (Math.max(width, height) / 1400));

        this.createTextures(width, height);
        this.createTexturesBindGroups();
    }

    get resultStorageTexture() {
        return this.swapTextures[0];
    }

    createTextures(width, height) {
        if (this.swapTextures) {
            this.swapTextures.forEach(texture => texture.destroy());
        }

        this.swapTextures = new Array(2).fill(null).map((v, ndx) => {
            return this.renderer.device.createTexture({
                size: {width, height},
                format: 'rgba16float',
                usage:
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.STORAGE_BINDING |
                    GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.RENDER_ATTACHMENT,
            });
        });

        this.dispatches = [
            Math.ceil(width / PaintDispatchSize[0]),
            Math.ceil(height / PaintDispatchSize[1])
        ];
    }

    createTexturesBindGroups() {
        this.swapBindGroups = [
            this.renderer.device.createBindGroup({
                layout: this.texturesBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.swapTextures[0].createView() },
                    { binding: 1, resource: this.swapTextures[1].createView() },
                ]
            }),
            this.renderer.device.createBindGroup({
                layout: this.texturesBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.swapTextures[1].createView() },
                    { binding: 1, resource: this.swapTextures[0].createView() },
                ]
            })
        ];
    }

    compute(computePassEncoder, timing, pointerInfo) {
        // update the pointer infos
        this.pointerInfo.position = pointerInfo.position;
        this.pointerInfo.previousPosition = pointerInfo.previousPosition;
        const targetVelocity = [
            (pointerInfo.position[0] - pointerInfo.previousPosition[0]) / timing.deltaTimeMS,
            (pointerInfo.position[1] - pointerInfo.previousPosition[1]) / timing.deltaTimeMS
        ];
        targetVelocity[0] *= this.pointerVelocityAttenuation;
        targetVelocity[1] *= this.pointerVelocityAttenuation;
        // smooth out the velocity changes a bit
        const velDamping = pointerInfo.isDown ? 20 : 4;
        this.pointerInfo.velocity = [
            this.pointerInfo.velocity[0] + (targetVelocity[0] - this.pointerInfo.velocity[0]) / velDamping,
            this.pointerInfo.velocity[1] + (targetVelocity[1] - this.pointerInfo.velocity[1]) / velDamping
        ];

        // update uniform buffers
        const viewportSize = this.renderer.getSize().map(value => value / this.renderer.devicePixelRatio);
        this.renderInfoUniform.view.set({
           viewportSize,
           deltaTimeMS: timing.deltaTimeMS,
           timeMS: timing.timeMS
        });
        this.pointerInfoUniform.view.set(this.pointerInfo);
        this.renderer.device.queue.writeBuffer(this.renderInfoUniform.buffer, 0, this.renderInfoUniform.view.arrayBuffer);
        this.renderer.device.queue.writeBuffer(this.pointerInfoUniform.buffer, 0, this.pointerInfoUniform.view.arrayBuffer);

        computePassEncoder.setPipeline(this.computePipeline);
        computePassEncoder.setBindGroup(0, this.uniformsBindGroup);
        computePassEncoder.setBindGroup(1, this.swapBindGroups[this.currentSwapIndex]);
        computePassEncoder.dispatchWorkgroups(this.dispatches[0], this.dispatches[1]);

        this.currentSwapIndex = (this.currentSwapIndex + 1) % 2;
        this.pointerInfo.previousVelocity = [...this.pointerInfo.velocity];
    }

}
