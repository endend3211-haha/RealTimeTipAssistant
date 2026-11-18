class SnesAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 262144;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.read = 0;
    this.write = 0;
    this.port.onmessage = (event) => {
      const l = event.data?.left instanceof ArrayBuffer ? new Float32Array(event.data.left) : null;
      const r = event.data?.right instanceof ArrayBuffer ? new Float32Array(event.data.right) : null;
      if (!l || !r) return;
      for (let i = 0; i < Math.min(l.length, r.length); i++) {
        this.left[this.write] = l[i];
        this.right[this.write] = r[i];
        this.write = (this.write + 1) % this.capacity;
        if (this.write === this.read) this.read = (this.read + 1) % this.capacity;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const l = output[0];
    const r = output[1] || output[0];
    for (let i = 0; i < l.length; i++) {
      if (this.read !== this.write) {
        l[i] = this.left[this.read];
        r[i] = this.right[this.read];
        this.read = (this.read + 1) % this.capacity;
      } else {
        l[i] = 0;
        r[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor('snes-audio', SnesAudioProcessor);
