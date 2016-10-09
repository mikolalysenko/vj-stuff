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
      gl_FragColor = vec4(colors[0], 1);
    }
    `,

    depth: {
      enable: false
    }
  })

  function scene () {
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
          0.125,
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
      [0, 0, 10],
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

    void main () {
      vec4 color = texture2D(pixels[0], uv);
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
