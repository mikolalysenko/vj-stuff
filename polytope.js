const glslify = require('glslify')
const convexHull = require('convex-hull')
const chart = require('conway-hart')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    vec3 envMap (vec3 dir) {
      return colors[0];
    }
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const drawPolytope = regl({
    vert: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 projection, view;
    void main () {
      gl_Position = projection * view * vec4(position, 1);
    }`,

    frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1, 1, 1, 1);
    }
    `,

    attributes: {
      position: regl.prop('positions')
    },

    elements: regl.prop('cells')
  })

  const points = []
  const prevPoints = []
  const forces = []
  for (let i = 0; i < 50; ++i) {
    const p = [
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ]
    const l = Math.sqrt(
      Math.pow(p[0], 2) +
      Math.pow(p[1], 2) +
      Math.pow(p[2], 2))
    p[0] /= l
    p[1] /= l
    p[2] /= l
    points.push(p)
    prevPoints.push(p.slice())
    forces.push([0, 0, 0])
  }

  function scene (context) {
    for (let i = 0; i < points.length; ++i) {
      const p = points[i]
      const fp = forces[i]
      for (let j = 0; j < i; ++j) {
        const q = points[j]
        const fq = forces[j]

        const d0 = p[0] - q[0]
        const d1 = p[1] - q[1]
        const d2 = p[2] - q[2]

        const l = 8.0 * Math.sqrt(
          Math.pow(d0, 2) +
          Math.pow(d1, 2) +
          Math.pow(d2, 2))

        fp[0] += d0 / l
        fp[1] += d1 / l
        fp[2] += d2 / l

        fq[0] -= d0 / l
        fq[1] -= d1 / l
        fq[2] -= d2 / l
      }

      for (let d = 0; d < 3; ++d) {
        fp[d] -=
          (0.8 + 10.0 * context.beats[0]) * p[d] + 35.0 * context.beats[1] * (0.5 - Math.random())
      }
    }

    for (let i = 0; i < points.length; ++i) {
      const cur = points[i]
      const prev = prevPoints[i]
      const f = forces[i]

      for (let j = 0; j < 3; ++j) {
        const x0 = cur[j]
        const x1 = prev[j]
        const v = x0 - x1

        prev[j] = x0
        cur[j] = x0 + v + 0.0001 * f[j]
      }

      f[0] = f[1] = f[2] = 0
    }

    const cells = convexHull(points)

    const edges = []
    for (let i = 0; i < cells.length; ++i) {
      const cell = cells[i]
      edges.push(
        [ cell[0], cell[1] ],
        [ cell[1], cell[2] ],
        [ cell[2], cell[0] ])
    }
    drawPolytope({
      positions: points,
      cells: edges
    })
  }

  function forward (context) {
    setupCamera(
      [0, 0, -10],
      [0, 0, 0],
      () => {
        regl.clear({depth: 1})
        drawBackground()
        scene(context)
      })
  }

  const drawPost = regl({
    frag: glslify`
    precision mediump float;
    varying vec2 uv;

    ${commonShader}

    uniform sampler2D pixels[2];

    void main () {
      vec2 p = uv - 0.5;
      float theta = atan(p.y, p.x);
      float radius = length(p);
      vec4 color = texture2D(pixels[0],
        0.5 + radius * vec2(cos(theta), sin(theta)));
      gl_FragColor = vec4(pow(color.rgb, vec3(1.0 / gamma)), 1);
    }
    `,

    uniforms: {
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight]
    }
  })

  function postprocess (context) {
    drawPost()
  }

  return {
    forward,
    postprocess
  }
}
