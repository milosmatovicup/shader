import {PostProcessingVertexShader} from '../shader/chunks.js';

export class PostProcessingPass {

    bindGroups = [];

    constructor(renderer) {
        this.renderer = renderer;

        // create buffers
        const vertexData = new Float32Array([
            -1,  3,
            -1, -1,
            3, -1
        ]);
        this.vertexBuffer = renderer.device.createBuffer({
            label: 'post processing pass vertex buffer',
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        })
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
        this.vertexBuffer.unmap();

        const uvData = new Float32Array([
            0, 2,
            0, 0,
            2, 0
        ]);
        this.uvBuffer = renderer.device.createBuffer({
            label: 'post processing pass uv buffer',
            size: uvData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        })
        new Float32Array(this.uvBuffer.getMappedRange()).set(uvData);
        this.uvBuffer.unmap();

        // create empty texture to be used by passes for missing textures
        this.emptyTexture = renderer.device.createTexture({
            label: 'empty texture',
            size: [1, 1],
            dimension: '2d',
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        renderer.device.queue.writeTexture({ texture: this.emptyTexture }, new Uint8Array(4), { bytesPerRow: 4 }, { width: 1, height: 1 });
    }

    async init(pipelineLabel, fragmentShader, fragmentShaderEntryPoint, bindGroupLayouts, targetFormat) {
        // create render pipeline
        this.renderPipeline = await this.renderer.device.createRenderPipeline({
            label: pipelineLabel,
            layout: this.renderer.device.createPipelineLayout({
                label: `${pipelineLabel} layout`,
                bindGroupLayouts: [...bindGroupLayouts],
            }),
            primitive: {
                topology: 'triangle-list'
            },
            vertex: {
                entryPoint: 'vertex_main',
                buffers: [
                    {
                        arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [
                            {
                                shaderLocation: 0,
                                format: 'float32x2',
                                offset: 0,
                            },
                        ],
                    },
                    {
                        arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                        attributes: [
                            {
                                shaderLocation: 1,
                                format: 'float32x2',
                                offset: 0,
                            },
                        ],
                    },
                ],
                module: this.renderer.device.createShaderModule({
                    code: PostProcessingVertexShader,
                }),
            },
            fragment: {
                entryPoint: fragmentShaderEntryPoint,
                module: this.renderer.device.createShaderModule({
                    code: fragmentShader,
                }),
                targets: [{ format: targetFormat }],
            },
        });
    }

    setSize(width, height) {}

    render(renderPassEncoder) {
        renderPassEncoder.setPipeline(this.renderPipeline);
        for (let i = 0; i < this.bindGroups.length; i++) {
            renderPassEncoder.setBindGroup(i, this.bindGroups[i]);
        }
        renderPassEncoder.setVertexBuffer(0, this.vertexBuffer);
        renderPassEncoder.setVertexBuffer(1, this.uvBuffer);

        renderPassEncoder.draw(3);
    }
}
