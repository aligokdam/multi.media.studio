/* Computes waveform peaks off the main thread.
   in:  { id, channels: [Float32Array...], sampleRate, perSecond }
   out: { id, peaks: Float32Array (max abs per bucket, 0..1), perSecond } */
self.onmessage = (e) => {
  const { id, channels, sampleRate, perSecond = 50 } = e.data;
  const len = channels[0]?.length || 0;
  const step = Math.max(1, Math.floor(sampleRate / perSecond));
  const n = Math.ceil(len / step);
  const peaks = new Float32Array(n);
  let max = 0;
  for (let b = 0; b < n; b++) {
    let m = 0;
    const end = Math.min(len, (b + 1) * step);
    for (const ch of channels) {
      for (let i = b * step; i < end; i += 4) { const v = ch[i] < 0 ? -ch[i] : ch[i]; if (v > m) m = v; }
    }
    peaks[b] = m;
    if (m > max) max = m;
  }
  // Light normalisation so quiet files still read as waveforms.
  const k = max > 0 ? Math.min(4, 0.95 / max) : 1;
  for (let i = 0; i < n; i++) peaks[i] = Math.min(1, peaks[i] * k);
  self.postMessage({ id, peaks, perSecond }, [peaks.buffer]);
};
