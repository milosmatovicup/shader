import {PostProcessingPass} from './post-processing-pass.js';
import {CompositeShader} from '../shader/composite.js';
import * as wgh from 'webgpu-utils';

export class CompositePass extends PostProcessingPass {

    constructor(renderer, paint, reactionDiffusion) {
        super(renderer);

        this.paint = paint;
        this.reactionDiffusion = reactionDiffusion;

        // create bind group layouts
        const defs = wgh.makeShaderDataDefinitions(CompositeShader);
        const pipelineLayoutPartial = {
            fragment: {
                entryPoint:'frag_main'
            },
        }
        const descriptors = wgh.makeBindGroupLayoutDescriptors(defs, pipelineLayoutPartial);
        const bindGroupLayout = renderer.device.createBindGroupLayout(descriptors[0]);

        this.sampler = renderer.device.createSampler({
            minFilter: 'linear',
            magFilter: 'linear'
        });

        this.renderPassDescriptorTemplate = { label: 'composite pass' };

        this.bindGroupLayouts = [bindGroupLayout];
    }

    async init() {
        this.createBindGroups();

        await super.init(
            'composite pipeline',
            CompositeShader,
            'frag_main',
            this.bindGroupLayouts,
            this.renderer.presentationFormat
        );
    }

    get renderPassDescriptor() {
        return {
            ...this.renderPassDescriptorTemplate,
            colorAttachments: [ this.renderer.colorAttachment ],
        }
    }

    setSize(width, height) {
        super.setSize(width, height);

        this.createBindGroups();
    }

    render(renderPassEncoder) {

        // set bind groups
        renderPassEncoder.setBindGroup(0, this.bindGroup);

        super.render(renderPassEncoder);
    }

    createBindGroups() {
        this.bindGroup = this.renderer.device.createBindGroup({
            layout: this.bindGroupLayouts[0],
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.reactionDiffusion.resultStorageTexture.createView() },
                { binding: 2, resource: this.paint.resultStorageTexture.createView() },
            ]
        });
    }
}
