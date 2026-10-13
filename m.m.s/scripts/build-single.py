#!/usr/bin/env python3
"""Builds standalone/multi-media-studio.html: the whole app in one self-contained file
(code, styles, all languages, vendor libraries and workers inlined).
Requires bun (https://bun.sh). Usage: python3 m.m.s/scripts/build-single.py"""
import base64, json, os, re, shutil, subprocess, tempfile

EXTRA = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # the m.m.s/ folder (this script)
SITE = os.path.dirname(EXTRA)                                        # index.html lives here
ROOT = os.path.join(SITE, "mms")                                     # the app: src, components, assets

# Rebuild assets/fonts/fonts.pack from a folder of .woff files:
#   python3 m.m.s/scripts/build-single.py --pack-fonts path/to/woff-folder
import sys
if len(sys.argv) == 3 and sys.argv[1] == "--pack-fonts":
    files = sorted(f for f in os.listdir(sys.argv[2]) if f.endswith(".woff"))
    index, blob = {}, b""
    for f in files:
        data = open(os.path.join(sys.argv[2], f), "rb").read(); index[f] = [len(blob), len(data)]; blob += data
    head = json.dumps(index, separators=(",", ":")).encode()
    open(os.path.join(ROOT, "assets/fonts/fonts.pack"), "wb").write(len(head).to_bytes(4, "little") + head + blob)
    print(len(files), "fonts packed"); sys.exit(0)
# Copy both folders so the app's relative imports (../../../m.m.s/locales and libraries) resolve.
base_tmp = tempfile.mkdtemp()
tmp = os.path.join(base_tmp, "mms")
shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns(".git", "dist"))
shutil.copytree(EXTRA, os.path.join(base_tmp, "m.m.s"), ignore=shutil.ignore_patterns(".git", "standalone", "scripts", "examples"))

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
def read_pack():
    raw = open(os.path.join(ROOT, "assets/fonts/fonts.pack"), "rb").read()
    n = int.from_bytes(raw[:4], "little")
    index = json.loads(raw[4:4 + n]); base = 4 + n
    return {f: raw[base + o:base + o + ln] for f, (o, ln) in index.items()}
def fonts(s):
    d = {f: "data:font/woff;base64," + base64.b64encode(data).decode() for f, data in sorted(read_pack().items())}
    assert "const FONT_DATA = null;" in s
    s = re.sub(r'const FONT_PACK = new URL\([^)]*\);', "const FONT_PACK = null;", s)
    return s.replace("const FONT_DATA = null;", "const FONT_DATA = " + json.dumps(d) + ";")
patch("src/render/fonts.js", fonts)

out = os.path.join(tmp, "out.js")
subprocess.run(["bun", "build", "src/main.js", "--outfile", out, "--format=esm", "--minify", "--target=browser"], cwd=tmp, check=True)
app = open(out, encoding="utf-8").read().replace("</script", "<\\/script")
assert "import(\"" not in app and "import.meta" not in app

html = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
css = "\n".join(open(os.path.join(ROOT, f"assets/css/{n}.css"), encoding="utf-8").read() for n in ["base", "landing", "studio", "photo-editor"])
boot = open(os.path.join(ROOT, "src/boot.js"), encoding="utf-8").read()
icon = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(ROOT, "assets/icons/icon.svg"), "rb").read()).decode()
csp = ("default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:; style-src 'unsafe-inline'; "
       "img-src data: blob:; media-src data: blob:; connect-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'")
html = re.sub(r'<meta http-equiv="Content-Security-Policy" content="[^"]*">', f'<meta http-equiv="Content-Security-Policy" content="{csp}">', html)
reps = {
    '<script src="mms/src/boot.js"></script>': "<script>\nwindow.MMS_SINGLE_FILE = true;\n" + boot + "\n</script>",
    '<link rel="icon" href="mms/assets/icons/icon.svg" type="image/svg+xml">': f'<link rel="icon" href="{icon}" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="mms/assets/icons/icon-192.png">\n': "",
    '<link rel="manifest" href="mms/app.webmanifest">\n': "",
    '<link rel="stylesheet" href="mms/assets/css/landing.css">\n': "",
    '<link rel="stylesheet" href="mms/assets/css/studio.css">\n': "",
    '<link rel="stylesheet" href="mms/assets/css/photo-editor.css">\n': "",
    '<link rel="modulepreload" href="mms/src/main.js">\n': "",
    '<link rel="stylesheet" href="mms/assets/css/base.css">': "<style>\n" + css + "\n</style>",
    '<script type="module" src="mms/src/main.js"></script>': '<script type="module">\n' + app + "\n</script>",
}
for a, b in reps.items():
    assert a in html, a
    html = html.replace(a, b)
os.makedirs(os.path.join(EXTRA, "standalone"), exist_ok=True)
dest = os.path.join(EXTRA, "standalone", "multi-media-studio.html")
open(dest, "w", encoding="utf-8").write(html)
shutil.rmtree(base_tmp)
print(dest, len(html.encode()) // 1024, "KB")
