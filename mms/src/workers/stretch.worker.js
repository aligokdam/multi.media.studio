/* Time-stretch (WSOLA): changes audio speed without changing pitch.
   in:  { id, channels: [Float32Array], speed }   out: { id, channels } */
self.onmessage = (e) => {
  const { id, channels, speed } = e.data;
  const out = channels.map((ch) => stretch(ch, speed));
  self.postMessage({ id, channels: out }, out.map((c) => c.buffer));
};

function stretch(input, speed) {
  const N = 2048, Hs = N / 4, tol = 384;
  const outLen = Math.max(1, Math.floor(input.length / speed));
  const out = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  let prevPos = 0;
  for (let s = 0; s < outLen; s += Hs) {
    const ideal = Math.round(s * speed);
    let best = ideal;
    if (s > 0) {
      // Find the offset whose start best continues the previous segment.
      const nat = prevPos + Hs;
      let bestC = -Infinity;
      for (let d = -tol; d <= tol; d += 8) {
        const p = ideal + d;
        if (p < 0 || p + N / 2 >= input.length) continue;
        let c = 0;
        for (let k = 0; k < N / 2; k += 8) c += input[p + k] * (input[nat + k] || 0);
        if (c > bestC) { bestC = c; best = p; }
      }
    }
    for (let k = 0; k < N; k++) {
      const v = input[best + k] || 0;
      out[s + k] += v * win[k];
      norm[s + k] += win[k];
    }
    prevPos = best;
  }
  const res = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return res;
}
