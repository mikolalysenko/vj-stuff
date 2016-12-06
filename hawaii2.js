const glslify = require('glslify')
const ch = require('convex-hull')
const vec3 = require('gl-vec3')
const mat4 = require('gl-mat4')
const sc = require('simplicial-complex')

function makePolytope (vpoints) {
  var hull = ch(vpoints)

  const positions = []
  let maxLength = 0.0
  hull.forEach(function (f) {
    f.forEach(function (v, i) {
      const a = vpoints[v]
      const b = vpoints[f[(i + 1) % 3]]
      maxLength = Math.max(maxLength, vec3.distance(a, b))
      positions.push(vpoints[v])
    })
  })

  const normals = []
  hull.forEach(function (f) {
    const p0 = vpoints[f[0]]
    const p1 = vpoints[f[1]]
    const p2 = vpoints[f[2]]
    const d01 = vec3.subtract([], p0, p1)
    const d02 = vec3.subtract([], p0, p2)
    const n = vec3.cross([], d01, d02)
    vec3.normalize(n, n)
    normals.push(n, n, n)
  })

  const edges = sc.unique(sc.skeleton(hull, 1))

  return {
    positions,
    normals,
    epositions: edges.map(([i, j]) =>
      [vpoints[i], vpoints[j]])
  }
}

module.exports = function (regl, midi) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    #pragma glslify: hsl2rgb = require(glsl-hsl2rgb)
    vec3 envMap (vec3 dir) {
      return 0.8 * texture2D(prevPixels, 0.5 * (dir.xy + 1.)).rgb;
    }
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  function Polytope (points) {
    const {
      positions,
      epositions,
      normals
    } = makePolytope(points)
    this.positions = regl.buffer(positions)
    this.epositions = regl.buffer(epositions)
    this.normals = regl.buffer(normals)
    this.count = positions.length
    this.ecount = epositions.length
  }

  const MODEL = mat4.create()

  const drawPolytope = regl({
    frag: `
    precision highp float;
    varying vec3 vnormal, vcolor;

    ${commonShader}

    void main () {
      gl_FragColor = vec4(vcolor, 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec3 position, normal;
    uniform mat4 model;
    uniform float hue;
    varying vec3 vnormal, vcolor;

    ${commonShader}

    float jiggle (vec3 center) {
      return max(0.,
        0.8 + pow(texture2D(freq, 0.5 * (1. + cos(0.01 * time + center.xy)) ).x, 0.5) - 4. / (1. + exp(-0.5 * (-10. - center.y))));
    }

    void main () {
      vnormal = normal;
      vcolor = hsl2rgb(
        hue,
        0.5 * pow(cos(position.z + 2. * time), 2.) + 0.5 + texture2D(freq, vec2(0.1)).r,
        0.5 * abs(max(normal.x, normal.y)));
      float scale = jiggle((model * vec4(0, 0, 0, 1)).xyz);
      gl_Position = projection * view * model * vec4(scale * position, 1);
    }
    `,

    uniforms: {
      model: (context, {angle, axis, position}) =>
        mat4.rotate(MODEL,
          mat4.translate(MODEL,
            mat4.identity(MODEL),
            position),
            angle,
            axis),
      hue: regl.prop('hue')
    },

    attributes: {
      position: regl.prop('positions'),
      normal: regl.prop('normals')
    },

    count: regl.prop('count')
  })

  const drawPolytopeEdges = regl({
    frag: `
    precision highp float;
    varying vec3 vcolor;

    ${commonShader}

    void main () {
      gl_FragColor = vec4(vcolor, 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 model;
    uniform float hue, luminance;
    varying vec3 vcolor;

    ${commonShader}

    void main () {
      vcolor = hsl2rgb(hue, 0.9, luminance);
      gl_Position = projection * view * model *
        vec4(position, 1);
    }
    `,

    uniforms: {
      model: (context, {angle, axis, position}) =>
        mat4.rotate(MODEL,
          mat4.translate(MODEL,
            mat4.identity(MODEL),
            position),
            angle,
            axis),
      hue: regl.prop('hue'),
      luminance: regl.prop('luminance')
    },

    attributes: {
      position: regl.prop('epositions')
    },

    count: regl.prop('ecount'),

    primitive: 'lines'
  })

  function randPolytope () {
    const points = []
    const N = 10 + (Math.random() * 50) | 0
    for (let i = 0; i < N; ++i) {
      points.push([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5])
    }
    return new Polytope(points)
  }

  const polytopeData = (() => {
    const l = []
    for (let i = 0; i < 100; ++i) {
      l.push(randPolytope())
    }
    return l
  })()

  function genPolytope (hue) {
    return Object.assign({
      position: [
        0, 0, 0
      ],
      velocity: [
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ],
      axis: vec3.normalize([], [
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ]),
      angle: 10.0 * Math.random() * 2.0 * Math.PI,
      hue
    },
    polytopeData[(Math.random() *  polytopeData.length) | 0])
  }

  const polytopes = [] /*(() => {
    const l = []
    for (let i = 0; i < 100; ++i) {
      l.push(genPolytope())
    }
    return l
  })()*/

  const waves = []

  function genWave () {
    let center = [-10, -5, 0]
    let velocity = [0.1, 0.1, 0]
    if (Math.random() < 0.5) {
      center[0] = 10
      velocity[0] = -0.1
    }
    for (let i = 0; i < 100; ++i) {
      waves.push(Object.assign({
        position: [
          center[0] + 4.0 * (Math.random() - 0.5),
          center[1] + 2.0 * (Math.random() - 0.5),
          center[2] + 20.0 * (Math.random() - 0.5)
        ],
        velocity: [
          velocity[0] + 0.05 * (Math.random() - 0.5),
          velocity[1] + 0.05 * (Math.random() - 0.5),
          velocity[2] + 0.05 * (Math.random() - 0.5)
        ],
        hue: 0.5 + 0.05 * Math.random(),
        luminance: Math.min(1, 0.5 + Math.random()),
        angle: Math.random(),
        axis: vec3.normalize([],
          [0.1 * Math.random(), 0.1 * Math.random(), Math.random()])
      }, polytopeData[Math.floor(
        Math.random() *  polytopeData.length)]))
    }
  }

  function scene ({tick, pcmData, beats}) {
    drawPolytope(polytopes)
    drawPolytopeEdges(waves)
    polytopes.forEach((p, i) => {
      p.angle += 0.25
      for (let i = 0; i < 3; ++i) {
        p.position[i] += p.velocity[i] * 0.05
      }
      p.velocity[0] += (0.05 + beats[1]) * Math.cos(0.5 * (i + tick))
      p.velocity[1] += (0.05 + beats[2]) * Math.sin(0.1 * (i + tick))

      for (let i = 0; i < 3; ++i) {
        p.velocity[i] -= (0.1 * beats[3]) * (p.position[i])
      }
      if (beats[2] && Math.random() > 0.9) {
        // p.hue += (Math.random() - 0.5)
      }
    })
    waves.forEach((w) => {
      w.angle += 0.1
      for (let i = 0; i < 3; ++i) {
        w.position[i] += w.velocity[i]
      }
      w.velocity[1] -= 0.001
    })
  }

  midi.ontap = (id) => {
    for (let i = 0; i < 10; ++i) {
      polytopes.push(genPolytope(id / 8 + Math.random() * 0.125))
    }
  }

  function forward (context) {
    const t = 0.01 * context.tick
    setupCamera(
      [0, 0, -20],
      [0, 0, 0],
      () => {
        regl.clear({
          depth: 1
        })
        drawBackground()
        scene(context)
      })
    /*
    if (context.tick % 5 === 0) {
      polytopes.push(genPolytope())
    }
    */
    if (context.beats[0] && Math.random() < 0.25) {
      //genWave()
    }
    for (let i = polytopes.length - 1; i >= 0; --i) {
      if (Math.max(
        Math.abs(polytopes[i].position[0]),
        Math.abs(polytopes[i].position[1]))
         > 50) {
        polytopes[i] = polytopes[polytopes.length - 1]
        polytopes.pop()
      }
    }
    for (let i = waves.length - 1; i >= 0; --i) {
      if (waves[i].position[1] < -50) {
        waves[i] = waves[waves.length - 1]
        waves.pop()
      }
    }
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
      float radius = (1. - beats[0]) * length(p);
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
