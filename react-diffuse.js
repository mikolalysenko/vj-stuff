const icosphere = require('icosphere')(5)
const mat4 = require('gl-mat4')
const glslify = require('glslify')

module.exports = function (regl) {
  const drawBackground = regl({
    frag: `
    precision mediump float;
    uniform sampler2D prevPixels;
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    varying vec2 uv;

    void main () {
      gl_FragColor = vec4(
        mix(
          mix(colors[0], colors[2], pow(beats[3], 2.0)),
          pow(texture2D(prevPixels, uv).rgb, vec3(2.0)),
          0.1), 1);
    }
    `,

    depth: {
      enable: false
    }
  })

  const drawSphere = regl({
    frag: `
    precision mediump float;
    uniform vec3 colors[5];
    varying vec3 normal;
    void main () {
      gl_FragColor = vec4(mix(colors[2], colors[1],
        0.25 * (2.0 + normal.x + normal.y)), 1);
    }
    `,

    vert: `
    precision mediump float;
    attribute vec3 position;
    uniform mat4 projection, view, model;
    uniform float time;
    uniform float beats[16];
    uniform float phase;
    varying vec3 normal;
    void main () {
      normal = normalize(position);
      vec3 displacement = vec3(
        cos(13.0 + time + position.x * 2.0 * position.y + position.x),
        sin(position.y * 5.0 + time * position.z),
        sin(2.0 * position.z + 13.0 * position.y * beats[1] + position.y + 5.0)
      ) * (1.0 + 10.0 * beats[0] + 5.0 * beats[2]);
      gl_Position = projection * view * model * vec4(position + displacement, 1);
    }
    `,

    attributes: {
      position: icosphere.positions
    },

    elements: icosphere.cells
  })

  function scene () {
    drawSphere()
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
          viewportWidth / viewportHeight,
          Math.PI / 4.0,
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

  function forward (context) {
    drawBackground()
    regl.clear({depth: 1})
    setupCamera(
      [0, 0, 12],
      [0, 0, 0], () => {
        scene(context)
      })
  }


  const bigTriangleTemplate = {
    vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (1.0 + position);
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

  const stateFBO = (Array(3)).fill().map(() =>
    regl.framebuffer({
      color: regl.texture({
        shape: [512, 512, 4],
        wrap: 'repeat',
        type: 'uint8',
        mag: 'linear',
        min: 'linear'
      }),
      depthStencil: false
    }))

  const update = regl(Object.assign({
    frag: `
    precision highp float;
    uniform sampler2D state[2];
    uniform float time;
    uniform vec2 resolution, mouse;
    uniform vec4 diffusionRate;
    uniform float feedRate, killRate, dt;
    varying vec2 uv;

    vec2 warp (vec2 st0) {
      vec2 st = st0 - 0.5;
      float r = length(st);
      float theta = atan(st.y, st.x) / ${2.0 * Math.PI};
      theta = ${2.0 * Math.PI} * fract(12.0 * theta) / 12.0;
      return 0.5 + r * vec2(cos(theta), sin(theta));
    }

    vec4 fetch (sampler2D image, vec2 coord) {
      return texture2D(image, warp(coord / resolution));
    }

    vec4 lap (sampler2D image, vec2 coord) {
      return
        fetch(image, coord + vec2(1, 0)) +
        fetch(image, coord + vec2(-1, 0)) +
        fetch(image, coord + vec2(0, 1)) +
        fetch(image, coord + vec2(0, -1)) -
        4.0 * fetch(image, coord);
    }

    void main () {
      vec2 id = uv * resolution;
      vec4 cur = fetch(state[1], id);

      float mouseDistance = length(warp(uv) - warp(mouse));

      float uvv = cur.r * cur.g * cur.g;
      gl_FragColor =
        (1.0 + dt) * cur + dt * (
          -fetch(state[0], id) +
          diffusionRate * lap(state[1], id) +
          vec4(
            -uvv + feedRate * (1.0 - cur.r) + 0.1 * exp(-32.0 * mouseDistance),
            uvv - (feedRate + killRate) * cur.g + 0.05 * exp(-32.0 * mouseDistance),
            0,
            0));
    }
    `,

    uniforms: {
      'state[0]': ({tick}) => stateFBO[tick % 3],
      'state[1]': ({tick}) => stateFBO[(tick + 1) % 3],
      'resolution': ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight],
      'dt': regl.prop('dt'),
      'diffusionRate': regl.prop('diffuse'),
      'killRate': regl.prop('killRate'),
      'feedRate': regl.prop('feedRate'),
      'mouse': ({tick, beats}) => {
        const time = 0.01 * tick
        const radius = 0.25 * beats[0] + 0.25
        return [
          radius * Math.cos(3.0 * time),
          radius * Math.sin(2.1 * time)
        ]
      }
    },

    framebuffer: ({tick}) => stateFBO[(tick + 2) % 3]
  }, bigTriangleTemplate))

  const drawPost = regl({
    frag: glslify`
    precision mediump float;
    uniform sampler2D pixels[2];
    uniform sampler2D reaction;
    uniform float beats[16];
    uniform float pitches[4];
    uniform vec2 resolution;
    uniform vec3 colors[5];
    uniform sampler2D freq;
    varying vec2 uv;

    #pragma glslify: blur = require('glsl-fast-gaussian-blur')

    void main () {
      vec2 aspect = vec2(1.0, resolution.x / resolution.y);

      vec2 offset = (uv - 0.5) / aspect;
      float r = length(offset);
      float theta = atan(offset.x, offset.y);

      float theta2 = theta + r * texture2D(freq, vec2(r)).r;

      vec2 nuv = 0.5 + aspect * r * vec2(cos(theta2), sin(theta2)) * (1.0 + 2.0 * beats[1]);

      vec3 color =
        mix(
          mix(
            colors[3],
            texture2D(pixels[0], nuv).rgb,
            texture2D(reaction, 0.5 +
              aspect * (r + 4.0 * beats[2]) * vec2(
                cos(theta), sin(theta))).r),
          colors[4],
          texture2D(reaction, 0.5 +
              aspect * (r + 8.0 * beats[5]) * vec2(
                cos(theta + 10.0 * beats[1]), sin(theta + 5.0 * beats[3]))
              ).g);
      gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
    }
    `,

    uniforms: {
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight],
      reaction: ({tick}) => stateFBO[tick % 3]
    }
  })

  function postprocess (context) {
    drawPost()
    update({
      diffuse: [0.2097, 0.105, 0, 0],
      feedRate: 0.034,
      killRate: 0.056,
      dt: 0.5
    })
  }

  return {
    forward,
    postprocess
  }
}
