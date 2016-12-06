const glslify = require('glslify')
const icosphere = require('icosphere')(4)
const mat4 = require('gl-mat4')

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

  const LIGHT_SIZE = 512

  const lightDepth = regl.renderbuffer({
    format: 'depth',
    radius: LIGHT_SIZE
  })

  const LightProps = {
    projection: regl.this('_projectionMatrix'),
    view: regl.this('_viewMatrix'),
    lightMat: regl.this('matrix')
  }

  function Light () {
    this.fbo = regl.framebuffer({
      color: regl.texture({
        radius: LIGHT_SIZE,
        type: 'float'
      }),
      depth: lightDepth
    })
    this.position = [0, 0, 0]
    this.target = [0, -1, 0]
    this.up = [0, 0, 1]
    this.angle = Math.PI / 4.0
    this.near = 0.01
    this.far = 1000.0
    this._viewMatrix = new Float32Array(16)
    this._projectionMatrix = new Float32Array(16)
    this.matrix = new Float32Array(16)
  }

  Light.prototype = {
    _setup: regl({
      vert: `
      precision highp float;
      attribute vec3 position;
      uniform mat4 lightMat;
      void main () {
        gl_Position = lightMat * vec4(position, 1);
      }`,

      frag: `
      precision highp float;
      void main () {
        gl_FragColor = vec4(gl_FragCoord.z);
      }
      `,

      context: LightProps,

      uniforms: LightProps,

      framebuffer: regl.this('fbo')
    }),

    setup (block) {
      mat4.lookAt(
        this._viewMatrix,
        this.position,
        this.target,
        this.up)
      mat4.perspective(
        this._projectionMatrix,
        this.angle,
        1,
        this.near,
        this.far)
      mat4.multiply(
        this.matrix,
        this._projectionMatrix,
        this._viewMatrix)
      this._setup((context) => {
        regl.clear({
          depth: 1,
          color: [0, 0, 0, 0]
        })
        block(context)
      })
    }
  }

  const sphereData = {
    attributes: {
      position: regl.buffer(icosphere.positions)
    },

    elements: regl.elements(icosphere.cells)
  }

  const shadowSphere = regl(sphereData)

  const drawSphere = regl(Object.assign({
    vert: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 projection, view;
    void main () {
      gl_Position = projection * view * vec4(position, 1.);
    }
    `,

    frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(1, 1, 1, 1);
    }
    `,

    uniforms: {
    }
  }, sphereData))

  const planeData = {
    vert: `
    precision highp float;
    attribute vec2 position;
    uniform mat4 projection, view;
    void main () {
      gl_Position = projection * view * vec4(position.x, -10, position.y, 1);
    }
    `,

    attributes: {
      position: regl.buffer([
        [-10000, -10000],
        [-10000, 10000],
        [10000, -10000],
        [-10000, 10000],
        [10000, -10000],
        [10000, 10000]
      ])
    },

    count: 6
  }

  const shadowPlane = regl(planeData)

  const drawPlane = regl(Object.assign({
    frag: `
    precision highp float;
    void main () {
      gl_FragColor = vec4(0, 0.5, 0.8, 1);
    }
    `
  }, planeData))

  const light = new Light()
  light.position = [0, 10, 0]

  function scene () {
    drawPlane()
    drawSphere()
    light.setup(() => {
      shadowPlane()
      shadowSphere()
    })
  }

  function forward (context) {
    setupCamera(
      [0, 0, -10],
      [0, 0, 0],
      () => {
        regl.clear({
          color: [0, 0, 0, 1],
          depth: 1
        })
        // drawBackground()
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
