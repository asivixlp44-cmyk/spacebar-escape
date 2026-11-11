// The sound bank, synthesised off the page's thread: the synth (asmr.js) is plain arithmetic into Float32Arrays, so a worker can make
// it on another core while the page builds the world. The samples are handed back, not copied.
import { synthAll } from './asmr.js';
self.onmessage = (e) => {
    const { bank, fx } = synthAll(!!(e.data && e.data.low));
    const moved = new Set();
    for (const k in bank) for (const a of bank[k]) moved.add(a.buffer);
    for (const k in fx) for (const a of fx[k]) moved.add(a.buffer);
    self.postMessage({ bank, fx }, [...moved]);
};
