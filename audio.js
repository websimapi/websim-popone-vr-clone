export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.buffers = {};
    }

    async load(name, url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
    }

    play(name, volume = 1.0, loop = false) {
        if (!this.buffers[name]) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.buffers[name];
        source.loop = loop;
        
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(0);
        return source; // Return for stopping if needed
    }

    resume() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
    }
}