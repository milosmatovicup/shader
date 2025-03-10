export class WebGPURenderer {

    constructor(canvas, devicePixelRatio) {
        this.canvas = canvas;
        this.devicePixelRatio = devicePixelRatio;
    }

    async init(adapter) {
        this.canTimestamp = adapter.features.has('timestamp-query');
        this.device = await adapter?.requestDevice({
            requiredFeatures: [
                ...(this.canTimestamp ? ['timestamp-query'] : []),
            ],
        });

        this.context = this.canvas.getContext('webgpu');
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied',
        });

        this.colorAttachmentTemplate = {
            view: null,
            clearValue: { r: 1, g: 1, b: 1, a: 1},
            loadOp: 'clear',
            storeOp: 'store'
        };
    }

    get colorAttachment() {
        return {
            ...this.colorAttachmentTemplate,
            view: this.context.getCurrentTexture().createView()
        };
    }

    setSize(width, height) {
        if (!this.device) return;

        let w = width;
        let h = height;
        if (w > 2000) {
            w = 2000;
            h = (height / width) * w;
        }
        if (h > 2000) {
            h = 2000;
            w = (width / height) * h;
        }
        this.canvas.width = Math.max(1, Math.min(w, this.device.limits.maxTextureDimension2D));
        this.canvas.height = Math.max(1, Math.min(h, this.device.limits.maxTextureDimension2D));
    }

    getSize() {
        return [this.canvas.width, this.canvas.height];
    }
}
