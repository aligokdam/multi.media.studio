# Custom video effects (`.mmsfx`)

A custom effect is a small JSON file with one GLSL function. Import it from
**Effects → Import**. It is compiled once on import and stored in your
browser; nothing is uploaded.

```json
{
  "format": "mms-effect",
  "version": 1,
  "id": "duotone",
  "name": { "en": "Duotone", "tr": "Çift Ton" },
  "defaultAmount": 0.8,
  "glsl": "vec4 FX(vec2 uv, vec4 c, float a) { ... }"
}
```

The function receives premultiplied color `c` at texture coordinate `uv` and the
strength `a` (0–1) and returns premultiplied color. These helpers are available:

| Name | Meaning |
|---|---|
| `src(vec2 uv)` | Color-adjusted, premultiplied sample of the clip |
| `unpremul(vec4 c)` | Straight RGB from premultiplied color |
| `luma(vec3 rgb)` | Rec. 709 luminance |
| `rand(vec2 p)` | Hash-based pseudo-random number 0–1 |
| `uTexel` | 1 / layer size in pixels |
| `uRes` | Layer size in pixels |
| `uTime` | Timeline time in seconds |

Rules: the source must define `vec4 FX(...)`, must not declare uniforms or
`main()`, and is limited to 20 KB. See `duotone.mmsfx` for a complete example.
