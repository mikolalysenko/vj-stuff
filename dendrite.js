const glslify = require('glslify')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    #pragma glslify: snoise = require(glsl-noise/simplex/4d.glsl)

    vec3 envMap (vec3 dir) {
      float t = 3.0 / length(dir.yz);
      vec3 hit = t * dir;
      float h = dir.x;
      float f = snoise(vec4(4.0 * h + time, hit.yz, time));

      return vec3(mix(
        colors[0],
        colors[1], pow(f, 3.0)));
    }
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const dendrites = initDendrites()
  const helix = initHelix()

  let tickOffset = 0

  function cameraX (tick) {
    return 0.05 * tick
  }

  function scene (context) {
    let deltaTick = 1
    for (let i = 0; i < context.beats.length; ++i) {
      deltaTick += 4 * context.beats[i]
    }
    helix.draw()
    dendrites.draw()
    for (let i = 0; i < deltaTick; ++i) {
      if (tickOffset % 3 === 0) {
        dendrites.grow(context)
      }
      tickOffset += 1
      if (Math.random() < 0.1) {
        dendrites.addNeuron(context)
      }
    }
    if (Math.random() < 0.02) {
      helix.addHelix(context.tick)
    }
  }

  helix.addHelix(0)

  function forward (context) {
    const tick = context.tick
    const x = cameraX(tick)
    const angle = 0.008 * tick
    setupCamera.up[1] = Math.cos(angle)
    setupCamera.up[2] = Math.sin(angle)
    setupCamera(
      [
        x,
        0,
        0
      ],
      [x + 100.0, 0, 0],
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

  function initDendrites () {
    const bufferPool = []
    function Dendrite (origin) {
      this.position = bufferPool.pop() ||
        regl.buffer({
          type: 'float',
          length: 4,
          size: 4
        })

      this.baseColor = Math.random() < 0.5 ? 0 : 1
      this.seeds = [[origin[0], origin[1], origin[2], 0]]
      this.phase = tickOffset
      this.points = []
      this.vertexCount = 0
      this.bounds = [origin.slice(), origin.slice()]
    }

    Dendrite.prototype = {
      splitCount: function (depth) {
        if (depth < 1) {
          return 1
        } else {
          return Math.random() < 0.08 ? 2 :
            (Math.random() < 0.0025 * depth ? 0 : 1)
        }
      },

      nextPoint: function (point) {
        point[0] += 0.1 * Math.random()
        point[1] += 0.07 * (Math.random() - 0.5)
        point[2] += 0.07 * (Math.random() - 0.5)
      },

      grow: function () {
        const seeds = this.seeds
        if (seeds.length === 0) {
          return
        }
        const nextSeeds = []
        for (let i = 0; i < seeds.length; ++i) {
          const origin = seeds[i]
          const next = origin.slice()
          this.nextPoint(next)
          this.points.push(origin, next)
          this.vertexCount += 2
          next[3] += 1

          for (let j = 0; j < 3; ++j) {
            this.bounds[0][j] = Math.min(this.bounds[0][j], next[j])
            this.bounds[1][j] = Math.max(this.bounds[1][j], next[j])
          }

          const splits = this.splitCount(next[3])
          for (let j = 0; j < splits; ++j) {
            nextSeeds.push(next)
          }
        }
        this.seeds = nextSeeds
        this.position(this.points)
      },

      free: function () {
        bufferPool.push(this.position)
      }
    }

    const neurons = [ ]

    for (let i = 0; i < 10; ++i) {
      const N = new Dendrite([
        2.0 * Math.random(),
        (Math.random() - 0.5),
        (Math.random() - 0.5)
      ])
      N.phase = 0
      neurons.push(N)
    }

    const drawDendrite = regl({
      vert: `
      precision highp float;
      attribute vec4 position;
      varying float weight, fogWeight;
      ${commonShader}
      void main () {
        weight = position.w;
        vec3 p = position.xyz;
        p += 0.1 * beats[8] * vec3(
          snoise(vec4(p, 0. + time)),
          snoise(vec4(p, 1. + 3.0 * time)),
          snoise(vec4(p, 2. + time))) +
          0.25 * normalize(vec3(0, p.yz)) * texture2D(freq, vec2(fract(p.x))).r;

        float theta = atan(p.z, p.y) + 0.5 * (beats[3] - beats[6]) * (p.x - eye.x);
        float r = length(p.yz);
        p.yz = r * vec2(cos(theta), sin(theta));

        vec4 clipPos = projection * view * vec4(p, 1);
        fogWeight = clipPos.z / clipPos.w;
        gl_Position = clipPos;
      }`,

      frag: `
      precision highp float;
      uniform float phase, tick;
      varying float weight, fogWeight;
      ${commonShader}
      uniform float baseColor;
      void main () {
        float h = pow(0.5 * (1.0 + cos(-0.25 * weight + 4.0 * time)), 8.0);
        gl_FragColor = vec4(mix(
          (1.0 - fogWeight) * mix(colors[2], colors[3], baseColor), colors[4],
          h
        ), 1);
      }
      `,

      attributes: {
        position: regl.prop('position')
      },

      uniforms: {
        phase: regl.prop('phase'),
        tick: () => tickOffset,
        baseColor: regl.prop('baseColor')
      },

      primitive: 'lines',

      blend: {
        enable: true,
        equation: 'add',
        func: {
          src: 'one',
          dst: 'one'
        }
      },

      depth: {
        enable: false
      },

      lineWidth: 1,

      count: regl.prop('vertexCount')
    })

    return {
      draw: function () {
        drawDendrite(neurons)
      },

      grow: function ({tick}) {
        const x = cameraX(tick)
        for (let i = neurons.length - 1; i >= 0; --i) {
          const neuron = neurons[i]
          neuron.grow()
          if (neuron.bounds[1][0] < x - 2) {
            neuron.free()
            neurons[i] = neurons[neurons.length - 1]
            neurons.length -= 1
          }
        }
      },

      addNeuron: function ({tick}) {
        const x = cameraX(tick)
        const N = new Dendrite([
          x + 2.0 + 8.0 * Math.random(),
          (Math.random() - 0.5),
          (Math.random() - 0.5)
        ])
        N.phase = tickOffset
        neurons.push(N)
      }
    }
  }

  function initHelix () {
    const draw = regl({
      frag: `
      precision mediump float;
      ${commonShader}
      varying float weight;
      void main () {
        if (length(gl_PointCoord.xy - 0.5) > 0.5) {
          discard;
        }
        gl_FragColor = vec4(
          mix(colors[3], colors[4], weight), 1);
      }
      `,

      vert: `
      precision mediump float;
      attribute float displacement;
      uniform vec3 offset;
      uniform float scale, radius, phase, twist;
      ${commonShader}
      varying float weight;

      void main () {
        float theta =
          phase + twist * displacement * ${16.0 * Math.PI};
        vec3 p = vec3(
          displacement * scale,
          radius * cos(theta),
          radius * sin(theta)
        ) + offset;
        gl_PointSize = 16.0 * (1.2 + cos(8.0 * displacement + 2.0 * time));
        weight = displacement;
        gl_Position = projection * view * vec4(p, 1);
      }
      `,

      uniforms: {
        offset: regl.prop('offset'),
        scale: regl.prop('scale'),
        radius: regl.prop('radius'),
        phase: regl.prop('phase'),
        twist: regl.prop('twist')
      },

      attributes: {
        displacement: (function () {
          const points = []
          for (let i = 0; i < 128; ++i) {
            points.push(i / 128)
          }
          return points
        })()
      },

      count: 128,

      primitive: 'points'
    })

    const helixBuffer = []

    return {
      draw: function (tick) {
        const x = cameraX(tick)
        draw(helixBuffer)
        for (let i = helixBuffer.length - 1; i >= 0; --i) {
          const h = helixBuffer[i]
          if (h.offset[0] + h.scale * 128 < x - 2) {
            helixBuffer[i] = helixBuffer[helixBuffer.length - 1]
            helixBuffer.pop()
          }
        }
      },

      addHelix: function (tick) {
        const x = cameraX(tick) + 10.0
        const phase = 2.0 * Math.PI * Math.random()
        const radius = 0.5 * Math.random()
        const scale = 10.0 * Math.random() + 2.0
        const twist = 8.0 * Math.pow(Math.random(), 3.0)
        helixBuffer.push({
          offset: [
            x,
            0,
            0
          ],
          phase,
          radius,
          scale,
          twist
        }, {
          offset: [
            x,
            0,
            0
          ],
          phase: phase + Math.PI,
          radius,
          scale,
          twist
        })
      }
    }
  }
}
