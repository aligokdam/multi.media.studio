# Custom transitions

Import a transition from **Transitions → Import**. Two file types work:

- `.glsl` in the [GL Transitions](https://gl-transitions.com) format, the open
  collection of transition shaders. Most of its transitions can be imported as they are.
- `.mmstr`, a JSON file: `{ "name": "My Transition", "glsl": "vec4 transition(vec2 uv) { ... }" }`

The shader defines `vec4 transition(vec2 uv)` and can use:

| Name | Meaning |
| --- | --- |
| `getFromColor(uv)` | The outgoing clip |
| `getToColor(uv)` | The incoming clip |
| `progress` | 0 to 1 across the transition |
| `ratio` | Width divided by height |

`uniform float strength; // = 0.5` style defaults become constants. A comment
`// name: My Transition` sets the display name. Files up to 32 KB are accepted.
The shader is compiled once when imported and stored only in your browser.
