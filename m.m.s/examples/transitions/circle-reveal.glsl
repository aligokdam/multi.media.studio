// name: Circle Reveal
// A soft circle grows from the centre and reveals the next clip.
uniform float softness; // = 0.08

vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float r = progress * length(vec2(ratio, 1.0)) * 0.5 * (1.0 + softness);
  float m = 1.0 - smoothstep(r - softness, r, length(p));
  return mix(getFromColor(uv), getToColor(uv), m);
}
