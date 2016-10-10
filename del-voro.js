const mat4 = require('gl-mat4')
const delaunay = require('delaunay-triangulate')
const vd = require('./vorotris')
const sc = require('simplicial-complex')
const glslify = require('glslify')

const N = 128

module.exports = function (regl) {
  const points = []
  const weights = []
  for (let i = 0; i < N; ++i) {
    points.push([
      30.0 * (Math.random() - 0.5),
      30.0 * (Math.random() - 0.5),
      30.0 * (Math.random() - 0.5)
    ])
    weights.push(Math.random() * 2.0)
  }

  const triangles = delaunay(points)
  const edges = sc.unique(sc.skeleton(triangles, 1))
  const voronoi = vd(points)

  const drawBackground = regl({
    frag: `
    precision mediump float;
    uniform sampler2D prevPixels;
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    varying vec2 uv;

    void main () {
      float intensity = 0.1 * pow(beats[0], 0.25);
      vec4 prev = texture2D(prevPixels, uv);
      gl_FragColor = vec4(
        mix(colors[0], pow(prev.rgb, vec3(1.25)), 0.8), 1);
    }
    `,

    depth: {
      enable: false
    }
  })

  const pointDisplacement = glslify`
  #pragma glslify: noise = require('glsl-noise/simplex/4d')

  vec3 pointDisplacement (vec3 p) {
    return p + 2.0 * noise(vec4(p, (100.0 * beats[5] + 0.5) * time));
  }
  `

  const drawPoints = regl({
    vert: `
    precision mediump float;
    attribute vec3 position;
    attribute float weight;
    uniform float time;
    uniform float beats[16];
    uniform mat4 projection, view, model;
    varying float vweight;

    ${pointDisplacement}

    void main () {
      vweight = weight;
      gl_PointSize = 8.0;
      gl_Position = projection * view * model *
        vec4(pointDisplacement(position), 1);
    }
    `,

    frag: `
    precision mediump float;
    uniform vec3 colors[5];
    uniform float time;
    void main () {
      float d = length(gl_PointCoord.xy - 0.5);
      if (d > 0.5) {
        discard;
      }
      gl_FragColor = vec4(
        mix(
          colors[1],
          colors[2],
          0.5 * (1.0 + cos(0.25 * time))), 1);
    }
    `,

    attributes: {
      position: points,
      weight: weights
    },

    count: points.length,

    primitive: 'points'
  })

  const drawEdges = regl({
    frag: `
    precision mediump float;
    varying float vweight;
    uniform float time;
    uniform vec3 colors[5];
    void main () {
      float w = pow(cos(vweight + 2.0 * time), 4.0);
      if (w < 0.15) {
        discard;
      }
      gl_FragColor = vec4(
        mix(colors[3], colors[0],
          0.5 * (1.0 + sin(1.7 * vweight + 0.1 * time))), 1);
    }
    `,

    elements: edges,

    primitive: 'lines',

    blend: {
      enable: false
    },

    lineWidth: 1,

    depth: {
      enable: true
    }
  })

  let voroCount = 0
  const voroGeom = (function () {
    const geom = {
      position: [],
      center: [],
      normal: [],
      id: []
    }

    voronoi.forEach(function (cell, j) {
      const id = j
      cell.normals.forEach(function (normal, i) {
        geom.normal.push(normal, normal, normal)
        geom.position.push(
          cell.positions[3 * i],
          cell.positions[3 * i + 1],
          cell.positions[3 * i + 2])
        geom.center.push(cell.center, cell.center, cell.center)
        geom.id.push(id, id, id)
        voroCount += 3
      })
    })

    return geom
  })()

  const noise = glslify`
  #pragma glslify: noise = require('glsl-noise/simplex/4d')
  `

  const drawVoronoi = regl({
    vert: glslify`
    precision mediump float;
    attribute vec3 position, normal, center;
    attribute float id;

    ${noise}

    uniform mat4 projection, view;
    uniform float time;
    uniform float pitches[4];
    uniform float beats[16];
    uniform sampler2D freq, pcm;
    varying vec3 vnormal;
    void main () {
      vnormal = normal;
      vec3 d = normalize(center);
      float sid = id / ${voronoi.length}.0;
      float scale = min(1.0,
        0.2 +
        pow(texture2D(freq, vec2(0.5 * (1.0 + cos(0.01 * time + sid)))).r,
        0.25)
        + beats[0] + 1.5 * beats[1] + 1.6 * beats[2] + 1.8 * beats[3] + 2.5 * beats[4]
      );
      float displacement = 30.0 /
        (1.0 + exp(-10.0 * (
          0.1 *
          pow(texture2D(pcm, vec2(sid)).r, 0.5) - 1.0 + cos(0.5 * time + 13.0 * sid))));
      vec3 p =
        mix(center, position, scale) + d * displacement;
      gl_Position = projection * view * vec4(p, 1);
    }
    `,

    frag: `
    precision mediump float;
    varying vec3 vnormal;
    uniform vec3 colors[5];

    float sigmoid (float x) {
      return 1.0 / (1.0 + exp(-16.0 * x));
    }

    void main () {
      gl_FragColor = vec4(
        mix(
          mix(colors[0], colors[1], sigmoid(vnormal.x)),
          mix(colors[2], colors[3], sigmoid(vnormal.y)),
          sigmoid(vnormal.z)),
        1);
    }
    `,

    attributes: voroGeom,
    count: voroCount,
    primitive: 'triangles'
  })

  function scene () {
    drawPoints()
    drawPoints(() => drawEdges())
    drawPoints(() => drawVoronoi())
  }

  const setupCamera = (function () {
    const projection = mat4.create()
    const invProjection = mat4.create()
    const view = mat4.create()
    const invView = mat4.create()

    const setup = regl({
      vert: `
      precision mediump float;
      attribute vec3 position;
      uniform mat4 projection, view, model;
      void main () {
        gl_Position = projection * view * model * vec4(position, 1);
      }
      `,

      frag: `
      precision mediump float;
      void main () {
        gl_FragColor = vec4(1, 1, 1, 1);
      }
      `,

      context: {
        projection: () => projection,
        invProjection: () => invProjection,
        view: () => view,
        invView: () => invView,
        model: mat4.identity(mat4.create()),
        eye: regl.prop('eye')
      },

      uniforms: {
        projection: regl.context('projection'),
        invProjection: regl.context('invProjection'),
        view: regl.context('view'),
        invView: regl.context('invView'),
        model: regl.context('model'),
        eye: regl.context('eye')
      }
    })

    const up = [0, 1, 0]

    return function (eye, center, body) {
      regl.draw(({viewportWidth, viewportHeight, tick}) => {
        mat4.perspective(projection,
          Math.PI / 4.0,
          viewportWidth / viewportHeight,
          1.0,
          65536.0)
        mat4.lookAt(
          view,
          eye,
          center,
          up)
        mat4.invert(invProjection, projection)
        mat4.invert(invView, view)
        setup({
          eye
        }, body)
      })
    }
  })()

  let angle = 0.0
  let direction = 0.1

  function forward (context) {
    const tick = 0.25 * context.tick
    const beats = context.beats
    drawBackground()
    regl.clear({depth: 1})
    angle = angle + direction
    if (beats[2] > 0.05) {
      direction *= -1
    }
    const radius = 45.0 + 40.0 * Math.log(Math.sin(0.05 * tick) + 2.0)
    setupCamera(
      [radius * Math.cos(0.01 * angle), 80.0 * Math.sin(0.01 * angle), radius * Math.sin(0.01 * angle * Math.cos(0.01 * tick))],
      [0, 0, 0], () => {
        scene(context)
      })
  }

  const drawPost = regl({
    frag: glslify`
    precision mediump float;
    uniform sampler2D pixels[2];
    uniform float beats[16];
    uniform float pitches[4];
    uniform vec2 resolution;
    uniform vec4 colors[5];
    uniform sampler2D freq;
    uniform float time;
    varying vec2 uv;

    #pragma glslify: blur = require('glsl-fast-gaussian-blur')

    void main () {
      float cep = texture2D(freq, uv).r;
      vec2 aspect = vec2(1.0, resolution.x / resolution.y);

      vec2 offset = (uv - 0.5) / aspect;
      float r = length(offset) * (0.5 + 2.0 * beats[1]);
      float theta = atan(offset.x, offset.y) +
        16.0 * beats[0] * r * pow(cos(0.1 * time), 5.0);

      vec2 nuv = 0.5 + aspect * r * vec2(cos(theta), sin(theta));

      vec4 color = texture2D(pixels[0], nuv + 0.01 * vec2(cep, 0));
      gl_FragColor = vec4(pow(color.rgb, vec3(1.0 / 2.2)), color.a);
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
