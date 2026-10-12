#!/usr/bin/env python3
"""Builds standalone/multi-media-studio.html: the whole app in one self-contained file
(code, styles, all languages, vendor libraries and workers inlined).
Requires bun (https://bun.sh). Usage: python3 scripts/build-single.py"""
import base64, json, os, re, shutil, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp()
shutil.copytree(ROOT, tmp, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "dist", "standalone"))

def patch(path, fn):
    p = os.path.join(tmp, path); s = open(p, encoding="utf-8").read(); open(p, "w", encoding="utf-8").write(fn(s))

# Workers become blob URLs built from inlined source text.
for path, name, var in [("src/export/mixer.js", "stretch", "STRETCH_SRC"), ("src/media/registry.js", "peaks", "PEAKS_SRC")]:
    def f(s, name=name, var=var):
        old = f'new Worker(new URL("../workers/{name}.worker.js", import.meta.url), {{ type: "module" }})'
        assert old in s, path
        s = s.replace(old, f'new Worker(URL.createObjectURL(new Blob([{var}], {{ type: "text/javascript" }})))')
        return f'import {var} from "../workers/{name}.worker.js" with {{ type: "text" }};\n' + s
    patch(path, f)
# Bundled fonts become data URLs.
def fonts(s):
    d = {f: "data:font/woff;base64," + base64.b64encode(open(os.path.join(ROOT, "assets/fonts", f), "rb").read()).decode()
         for f in sorted(os.listdir(os.path.join(ROOT, "assets/fonts"))) if f.endswith(".woff")}
    assert "const FONT_DATA = null;" in s
    return s.replace("const FONT_DATA = null;", "const FONT_DATA = " + json.dumps(d) + ";")
patch("src/render/fonts.js", fonts)
# No service worker in a single file.
patch("src/main.js", lambda s: s.replace('await navigator.serviceWorker.register("sw.js", { scope: "./" });', "/* single-file build */"))

out = os.path.join(tmp, "out.js")
subprocess.run(["bun", "build", "src/main.js", "--outfile", out, "--format=esm", "--minify", "--target=browser"], cwd=tmp, check=True)
app = open(out, encoding="utf-8").read().replace("</script", "<\\/script")
assert "import(\"" not in app and "import.meta" not in app

html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
css = "\n".join(open(os.path.join(ROOT, f"assets/css/{n}.css"), encoding="utf-8").read() for n in ["base", "landing", "studio", "photo-editor"])
boot = open(os.path.join(ROOT, "src/boot.js"), encoding="utf-8").read()
icon = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(ROOT, "assets/icons/icon.svg"), "rb").read()).decode()
csp = ("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:; style-src 'unsafe-inline'; "
       "img-src data: blob:; media-src data: blob:; connect-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'")
html = re.sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', f'<meta http-equiv="Content-Security-Policy" content="{csp}">', html)
reps = {
    '<script src="src/boot.js"></script>': "<script>\nwindow.MMS_SINGLE_FILE = true;\n" + boot + "\n</script>",
    '<link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">': f'<link rel="icon" href="{icon}" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="assets/icons/icon-180.png">\n': "",
    '<link rel="manifest" href="app.webmanifest">\n': "",
    '<link rel="stylesheet" href="assets/css/landing.css">\n': "",
    '<link rel="stylesheet" href="assets/css/studio.css">\n': "",
    '<link rel="stylesheet" href="assets/css/photo-editor.css">\n': "",
    '<link rel="modulepreload" href="src/main.js">\n': "",
    '<link rel="stylesheet" href="assets/css/base.css">': "<style>\n" + css + "\n</style>",
    '<script type="module" src="src/main.js"></script>': '<script type="module">\n' + app + "\n</script>",
}
for a, b in reps.items():
    assert a in html, a
    html = html.replace(a, b)
os.makedirs(os.path.join(ROOT, "standalone"), exist_ok=True)
dest = os.path.join(ROOT, "standalone", "multi-media-studio.html")
open(dest, "w", encoding="utf-8").write(html)
shutil.rmtree(tmp)
print(dest, len(html.encode()) // 1024, "KB")
