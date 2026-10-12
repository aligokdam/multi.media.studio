/* Export panel: options → progress → done. */
import { h, formatTime, formatBytes, downloadBlob, safeFilename } from "../core/util.js";
import { icon } from "../core/icons.js";
import { t, lang, num } from "../core/i18n.js";
import { prefs } from "../core/prefs.js";
import { RESOLUTIONS, resLabel, FRAME_RATES } from "../config.js";
import { frameSize, projectDuration } from "../studio/model.js";
import { exportVideo, exportSupported, probeCapabilities } from "./exporter.js";

const BITRATE_PER_PIXEL = { medium: 0.06, high: 0.1, "very-high": 0.16 };

/** Rough output size for the chosen settings (video at the target bitrate plus audio). */
export function estimateBytes(p, opts) {
  const dur = projectDuration(p);
  const { w, h: hh } = frameSize(p, opts.resolution);
  return (w * hh * opts.fps * BITRATE_PER_PIXEL[opts.quality] * dur) / 8 + (160000 / 8) * dur;
}

/** Phones: the Export button starts right away with the settings from the drop-down panel. */
export function exportNowView(store, registry, { onBusy } = {}) {
  const p = store.project;
  const opts = { format: prefs.get("exportFormat"), resolution: prefs.get("exportResolution"), fps: prefs.get("exportFps") || p.settings.fps, quality: prefs.get("exportQuality") };
  if (!exportSupported()) {
    return { title: () => t("export.title"), render(root) { root.append(h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("export.unsupported")))); } };
  }
  return progressView(store, registry, opts, onBusy);
}

export function exportView(store, registry, { onBusy } = {}) {
  return {
    title: () => t("export.title"),
    render(root, nav) {
      const p = store.project;
      const dur = projectDuration(p);
      const opts = { format: prefs.get("exportFormat"), resolution: prefs.get("exportResolution"), fps: prefs.get("exportFps") || p.settings.fps, quality: prefs.get("exportQuality") };
      if (!exportSupported()) {
        root.append(h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("export.unsupported"))));
        return;
      }
      if (dur <= 0) { root.append(h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("export.empty")))); return; }

      const body = h("div", { class: "export-body" });
      const summary = h("div", { class: "export-summary" });
      const note = h("p", { class: "section-foot" });
      const go = h("button", { class: "btn primary large block", type: "button" }, h("span", { html: icon("exportFile") }), t("export.start"));
      let caps = null;
      root.append(summary, body, note, h("div", { class: "export-cta" }, go));

      const seg = (key, label, options) => {
        const wrap = h("div", { class: "segmented block", role: "radiogroup", "aria-label": label });
        options.forEach(([v, l, disabled]) => wrap.append(h("button", { type: "button", role: "radio", "aria-checked": String(opts[key] === v), disabled: !!disabled,
          onclick: () => { opts[key] = v; prefs.set({ format: "exportFormat", resolution: "exportResolution", fps: "exportFps", quality: "exportQuality" }[key], v); draw(); } }, l)));
        return h("div", { class: "export-row" }, h("span", { class: "export-label" }, label), wrap);
      };

      function draw() {
        body.textContent = "";
        const resOk = (r) => !caps || caps.resolutions[r]?.[opts.format];
        if (!resOk(opts.resolution)) opts.resolution = RESOLUTIONS.filter(resOk).pop() || 720;
        body.append(
          seg("resolution", t("export.resolution"), RESOLUTIONS.map((r) => [r, resLabel(r), !resOk(r)])),
          seg("fps", t("export.fps"), FRAME_RATES.map((f) => [f, String(f)])),
          seg("format", t("export.format"), [["mp4", "MP4"], ["webm", "WebM"]]),
          seg("quality", t("export.quality"), [["medium", t("export.q.medium")], ["high", t("export.q.high")], ["very-high", t("export.q.max")]]));
        const { w, h: hh } = frameSize(p, opts.resolution);
        const bytes = estimateBytes(p, opts);
        summary.textContent = "";
        summary.append(
          h("div", {}, h("span", { class: "export-k" }, t("export.size")), h("strong", { class: "ltr tabular" }, `${w} × ${hh}`)),
          h("div", {}, h("span", { class: "export-k" }, t("export.duration")), h("strong", { class: "ltr tabular" }, formatTime(dur))),
          h("div", {}, h("span", { class: "export-k" }, t("export.estimate")), h("strong", { class: "ltr tabular" }, "≈ " + formatBytes(bytes, lang()))));
        const f = caps?.formats[opts.format];
        const notes = [];
        if (f && !f.video) notes.push(t("export.noCodec"));
        else if (f && opts.format === "mp4" && f.video !== "avc") notes.push(t("export.mp4Compat", { codec: f.video.toUpperCase() }));
        if (f && !f.audio) notes.push(t("export.noAudio"));
        if (opts.resolution >= 2160) notes.push(t("export.4kNote"));
        notes.push(t("export.localNote"));
        note.textContent = notes.join(" ");
        go.disabled = !!(f && !f.video);
      }

      draw();
      probeCapabilities(p).then((c) => { caps = c; draw(); }).catch(() => {});
      go.addEventListener("click", () => nav.push(progressView(store, registry, { ...opts }, onBusy)));
    },
  };
}

function progressView(store, registry, opts, onBusy) {
  return {
    title: () => t("export.exporting"),
    render(root, nav) {
      const ctrl = new AbortController();
      const bar = h("span");
      const pctEl = h("strong", { class: "export-pct tabular" }, "0 %");
      const phase = h("p", { class: "row-sub" }, t("export.phase.prepare"));
      const cancel = h("button", { class: "btn block", type: "button", onclick: () => ctrl.abort() }, t("common.cancel"));
      root.append(h("div", { class: "export-progress", role: "status", "aria-live": "polite" },
        h("div", { class: "export-ring", html: icon("exportFile") }), pctEl, phase, h("div", { class: "progress" }, bar)),
        h("p", { class: "section-foot center" }, t("export.keepOpen")), cancel);
      const name = safeFilename(store.project.name, "video");
      onBusy?.(true);
      (async () => {
        let writable = null;
        // Write straight to disk where the browser allows it (no copy in memory).
        if ("showSaveFilePicker" in window) {
          try {
            const handle = await window.showSaveFilePicker({ suggestedName: `${name}.${opts.format}`, types: [{ description: opts.format.toUpperCase(), accept: { [opts.format === "mp4" ? "video/mp4" : "video/webm"]: ["." + opts.format] } }] });
            writable = await handle.createWritable();
          } catch (e) {
            if (e?.name === "AbortError") { onBusy?.(false); nav.pop(); return; }
          }
        }
        const t0 = performance.now();
        try {
          const res = await exportVideo(store.project, registry, { ...opts, writable }, {
            signal: ctrl.signal,
            onProgress: ({ phase: ph, progress, eta }) => {
              const total = ph === "audio" ? progress * 0.08 : ph === "video" ? 0.08 + progress * 0.9 : 0.99;
              bar.style.width = total * 100 + "%";
              pctEl.textContent = num(Math.floor(total * 100)) + " %";
              phase.textContent = t("export.phase." + ph) + (eta != null && ph === "video" ? " · " + t("export.eta", { time: formatTime(eta) }) : "");
            },
          });
          onBusy?.(false);
          nav.push(doneView(res, name, (performance.now() - t0) / 1000));
        } catch (e) {
          onBusy?.(false);
          try { await writable?.abort?.(); } catch { /* ignore */ }
          if (e?.name === "AbortError") { nav.pop(); return; }
          console.error(e);
          root.textContent = "";
          root.append(h("div", { class: "notice" }, h("span", { html: icon("info") }), h("p", {}, t("export.failed"), " ", h("span", { class: "row-sub" }, String(e?.message || e)))),
            h("button", { class: "btn block", type: "button", onclick: () => nav.pop() }, t("common.back")));
        }
      })();
      return () => { if (!ctrl.signal.aborted) ctrl.abort(); };
    },
  };
}

function doneView(res, name, seconds) {
  return {
    title: () => t("export.done"),
    render(root) {
      const file = `${name}.${res.extension}`;
      root.append(h("div", { class: "export-progress done" },
        h("div", { class: "export-ring ok", html: icon("check") }),
        h("strong", {}, t("export.ready")),
        h("p", { class: "row-sub ltr" }, `${file}${res.blob ? " · " + formatBytes(res.blob.size, lang()) : ""}`),
        h("p", { class: "row-sub" }, t("export.took", { time: formatTime(seconds) }) + " · " + res.codec.toUpperCase() + (res.audioCodec ? " / " + res.audioCodec.toUpperCase() : ""))));
      if (res.blob) {
        let url = null;
        const video = h("video", { class: "export-video", controls: true, playsinline: true });
        url = URL.createObjectURL(res.blob);
        video.src = url;
        root.append(video, h("button", { class: "btn primary large block", type: "button", onclick: () => downloadBlob(res.blob, file) }, h("span", { html: icon("download") }), t("export.download")));
        return () => URL.revokeObjectURL(url);
      }
      root.append(h("p", { class: "section-foot center" }, t("export.savedToDisk")));
    },
  };
}
