// view elements
import {App} from './app/app.js';
import {Pane} from 'tweakpane';

const noWebGPUMessage = document.querySelector('#no-webgpu');
const infoMessage = document.querySelector('#info-message');

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const hasDebugParam = urlParams.get('debug');
const isDev = import.meta.env.MODE === 'development';

let pane;

async function init() {
    // check compatibility
    const hasWebGPU = !!navigator.gpu;
    if (!hasWebGPU) {
        noWebGPUMessage.style.display = '';
        return;
    }

    await App.init();

    infoMessage.style.display = 'inline';
    document.body.addEventListener('pointerdown', () => infoMessage.style.opacity = 0, { once: true });

    // init tweakpane
    if (hasDebugParam || isDev) {
        pane = new Pane({ title: 'Settings', expanded: isDev });

        pane.addBinding(App.gpuComputeTimeAverage, 'value', { readonly: true, label: 'GPU compute time [µs]' });
    }
}

init();
