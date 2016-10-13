const glslify = require('glslify')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    vec3 envMap (vec3 dir) {
      return vec3(0, 0, 0);
    }

    #pragma glslify: curlNoise = require(glsl-curl-noise)
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const N = 512
  const T = 3

  //
  //  dx / dt = x(t) - x(t - 1)
  //

  const stateFBO = Array(T).fill().map(() =>
    regl.framebuffer({
      depthStencil: false,
      color: regl.texture({
        radius: N,
        type: 'float',
        min: 'linear',
        mag: 'linear',
        wrap: 'repeat'
      })
    }))

  function nextFBO ({tick}) {
    return stateFBO[tick % T]
  }

  function prevFBO (n) {
    return ({tick}) => stateFBO[(tick + T - n) % T]
  }

  const bigTriangle = {
    vert: `
    precision mediump float;
    attribute vec2 position;
    varying vec2 uv;
    void main () {
      uv = 0.5 * (position + 1.0);
      gl_Position = vec4(position, 0, 1);
    }
    `,

    attributes: {
      position: [
        [-4, 0],
        [4, 4],
        [4, -4]
      ]
    },

    count: 3
  }

  const update = regl(Object.assign({
    framebuffer: nextFBO,

    uniforms: {
      'state[0]': prevFBO(1),
      'state[1]': prevFBO(2),
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight],
      impulse: regl.prop('impulse'),
      weight: regl.prop('weight')
    },

    frag: `
    precision highp float;
    uniform sampler2D state[2];
    varying vec2 uv;

    ${commonShader}

    #define EPSILON 0.001

    vec3 force (vec3 p) {
      /*
      return 0.0 +
        0.0025 * beats[0] * curlNoise(p) +
        0.0005 * (1.0 - beats[0]) * (normalize(p) - p);
      */
      return vec3(0, 0, 0);
    }

    void main () {
      vec3 s0 = texture2D(state[0], uv).xyz;
      vec3 s1 = texture2D(state[1], uv).xyz;

      vec3 nextPos = s0 +
        (1.0 - step(0.8, beats[9])) * (s0 - s1) + force(s0);

      gl_FragColor = vec4(
        nextPos,
        1);
    }
    `
  }, bigTriangle))

  const drawImage = regl(Object.assign({
    frag: `
    precision mediump float;
    uniform sampler2D state[3];
    varying vec2 uv;
    void main () {
      float s0 = texture2D(state[0], uv).r;
      float s1 = texture2D(state[1], uv).r;
      float s2 = texture2D(state[2], uv).r;

      float lo = min(min(s0, s1), s2);
      float hi = max(max(s0, s1), s2);

      gl_FragColor = vec4(s0, s1, s2, 1);
    }
    `,

    uniforms: {
      'state[0]': prevFBO(0),
      'state[1]': prevFBO(1),
      'state[2]': prevFBO(2)
    },

    depth: {
      enable: false
    }
  }, bigTriangle))

  const drawPoints = regl({
    vert: `
    precision mediump float;
    attribute vec2 pointId;
    uniform sampler2D state;
    uniform mat4 projection, view;
    varying vec2 uv;

    void main () {
      vec4 position = texture2D(state, pointId);
      uv = pointId;
      gl_PointSize = 1.0;
      gl_Position = projection * view * vec4(position.xyz, 1);
    }
    `,

    frag: `
    precision mediump float;
    varying vec2 uv;
    ${commonShader}
    void main () {
      float sg = 1.0 / (1.0 + exp(-20.0 * (uv.g - 0.5)));
      float sr = 1.0 / (1.0 + exp(-20.0 * (uv.r - 0.5)));
      gl_FragColor = vec4(
        mix(
          mix(colors[4], colors[2], sg),
          mix(colors[1], colors[3], sg), sr), 1);
    }
    `,

    attributes: {
      pointId: (() => {
        const result = []
        for (let i = 0; i < N; ++i) {
          for (let j = 0; j < N; ++j) {
            result.push([
              (i + 0.5) / N,
              (j + 0.5) / N
            ])
          }
        }
        return result
      })()
    },

    uniforms: {
      state: nextFBO
    },

    count: N * N,

    primitive: 'points'
  })

  init()

  function scene () {
    drawPoints()
    update()
  }

  function forward (context) {
    const {
      tempo
    } = context

    const radius = 5.0
    const theta = Math.PI * Math.cos(0.0125 * 2.0 * Math.PI * tempo * regl.now())

    setupCamera(
      [
        radius * Math.cos(theta),
        0,
        radius * Math.sin(theta)
      ],
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

  function init () {
    const initFBO = regl(Object.assign({
      frag: glslify`
      precision mediump float;
      varying vec2 uv;

      #pragma glslify: pnoise = require(glsl-noise/periodic/2d)

      void main () {
        float theta = ${4.0 * Math.PI} * uv.x;
        float phi = ${Math.PI} * (uv.y - 0.5);

        float r = 1.0;

        gl_FragColor = vec4(
          r * cos(theta) * cos(phi),
          r * sin(theta) * cos(phi),
          r * sin(phi),
          1);
      }
      `,

      framebuffer: regl.prop('framebuffer')
    }, bigTriangle))

    for (let i = 0; i < T; ++i) {
      initFBO({
        framebuffer: stateFBO[i]
      })
    }
  }
}
