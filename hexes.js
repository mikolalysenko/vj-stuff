const glslify = require('glslify')
const vectorizeText = require('vectorize-text')
const delaunay = require('delaunay-triangulate')

const magicSymbols = []

const baseAlchemy = '🜁'
for (let i = 0; i < 100; ++i) {
  const first = baseAlchemy.charCodeAt(0)
  const second = baseAlchemy.charCodeAt(1)
  magicSymbols.push(
    String.fromCharCode(first) +
    String.fromCharCode(second + i)
  )
}

const magicPoints = []
const magicCells = []
const magicOffsets = []
const magicCounts = []

magicSymbols.forEach((symbol) => {
  const {positions, cells} = vectorizeText(symbol, {
    triangles: true,
    width: 1,
    textBaseline: 'hanging'
  })
  const offset = magicPoints.length
  magicOffsets.push(magicCells.length * 3)
  magicCounts.push(cells.length * 3)
  positions.forEach((p) => {
    magicPoints.push(p)
  })
  cells.forEach(([i, j, k]) => {
    magicCells.push([
      i + offset,
      j + offset,
      k + offset
    ])
  })
})

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

  const magicPosition = regl.buffer(magicPoints)
  const magicElements = regl.elements(magicCells)

  const drawHex = regl({
    vert: `
    precision highp float;
    attribute vec2 position;
    uniform mat4 projection, view;
    uniform vec3 worldPosition;
    uniform float scale;

    void main () {
      vec4 cpos = view * vec4(worldPosition, 1);
      cpos /= cpos.w;
      cpos.xy += scale * (position - 0.5);
      gl_Position = projection * cpos;
    }
    `,

    frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1, 1, 1, 1);
    }
    `,

    elements: magicElements,

    attributes: {
      position: magicPosition
    },

    uniforms: {
      worldPosition: regl.prop('position'),
      scale: regl.prop('scale')
    },

    count: (_, {id}) => magicCounts[id],
    offset: (_, {id}) => magicOffsets[id]
  })

  const drawEdges = regl({
    frag: `
    precision mediump float;
    uniform vec3 colors[5];
    void main () {
      gl_FragColor = vec4(colors[2], 1);
    }`,

    vert: `
    precision mediump float;
    attribute vec2 position;
    uniform mat4 projection, view;
    void main () {
      gl_Position = projection * view * vec4(position, 0, 1);
    }
    `,

    attributes: {
      position: regl.prop('points')
    },

    elements: regl.prop('edges'),

    lineWidth: Math.min(regl.limits.lineWidthDims[1], 2)
  })

  let shift = 0
  function scene ({tick, tempo}) {
    const points = [
      [0, 0]
    ]

    shift = regl.now()

    for (let i = 0; i < 5; ++i) {
      const theta = 2.0 * Math.PI * (i / 5.0 + 0.125 * shift)
      points.push([
        4.0 * Math.sin(theta), 4.0 * Math.cos(theta)
      ])
    }

    for (let i = 0; i < 9; ++i) {
      const theta = 2.0 * Math.PI * (i / 9.0 - 0.25 * shift)
      points.push([
        2.0 * Math.sin(theta), 2.0 * Math.cos(theta)
      ])
    }

    drawHex(points.map((p, id) => {
      return {
        id: (id + Math.floor(0.25 * id + shift)) % magicSymbols.length,
        position: [p[0], p[1], 0],
        scale: 0.5
      }
    }))

    const cells = delaunay(points)
    const edges = []
    cells.forEach(([i, j, k]) => {
      edges.push(
        [i, j],
        [j, k],
        [k, i])
    })

    drawEdges({
      points,
      edges
    })
  }

  function forward (context) {
    setupCamera(
      [0, -4, -2],
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
