// Where the triangles go: every mesh drawn in a few views, its triangles (instances and batch members counted), the biggest first.
// Run: node tests/tris.mjs (Q=low|medium|high)
import { startServer, startVite, stopAll, launch, open, sleep, TEST_PORT } from './lib.mjs';
await startServer(TEST_PORT, { QA: '1', NO_BOTS: '1' });
await startVite();
const b = await launch();
const page = await open(b, 'http://localhost:5621/', { w: 1280, h: 720, q: process.env.Q || 'medium', uid: 'tris' + Date.now() });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await sleep(800);
await ev(() => window.__qa.close());
const report = async (name) => {
    await sleep(900);
    const r = await ev(() => {
        const q = window.__qa, out = [];
        const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
        q.scene.traverseVisible((o) => {
            if (!(o.isMesh || o.isPoints)) return;
            let n = 0;
            if (o.isBatchedMesh) { n = o.userData.triShown || 0; }
            else if (o.isInstancedMesh) n = tri(o.geometry) * o.count;
            else if (o.geometry) n = tri(o.geometry);
            const nm = (o.material && (o.material.customProgramCacheKey ? o.material.customProgramCacheKey() : o.material.type)) + (o.isBatchedMesh ? ' [batch]' : o.isInstancedMesh ? ' [inst x' + o.count + ']' : '');
            out.push([nm, Math.round(n)]);
        });
        const agg = {};
        for (const [k, n] of out) agg[k] = (agg[k] || 0) + n;
        return { info: q.diag(), top: Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 14) };
    });
    console.log('==', name, JSON.stringify(r.info));
    for (const [k, n] of r.top) console.log('   ', String(n).padStart(8), k);
};
await report('spawn');
await ev(() => { const q = window.__qa; q.teleport(0, 0, 60, Math.PI); q.look(0, 0.12, 22); });
await report('gate');
await ev(() => { const q = window.__qa; q.give({ lv: 20 }); q.teleport(0, 0, q.checkpoint(3).z - 10, Math.PI); q.look(0, 0.2, 20); });
await report('stage4');
console.log('errors', page.errors);
await b.close(); stopAll();
process.exit(0);
