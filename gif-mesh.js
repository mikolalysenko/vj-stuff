const glslify = require('glslify')
const resl = require('resl')
const gifMesh = require('./lib/gif-mesh')

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

  let _scene = null
  resl({
    manifest: {
      skull: {
        type: 'binary',
        src: 'gifs/skull.gif',
        parser: parseGIF
      },
      pumpkin: {
        type: 'binary',
        src: 'gifs/pumpkin_3D.gif',
        parser: parseGIF
      },
      bat: {
        type: 'binary',
        src: 'gifs/bat.gif',
        parser: parseGIF
      }
    },

    onDone: function (assets) {
      _scene = setupScene(assets)
    }
  })

  function forward (context) {
    setupCamera(
      [0, 0, -10],
      [0, 0, 0],
      () => {
        regl.clear({depth: 1})
        drawBackground()
        if (_scene) {
          _scene(context)
        }
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

  function GIF ({position, color, id, frames}) {
    this.position = regl.buffer(position)
    this.color = regl.buffer(color)
    this.id = regl.buffer(id)
    this.frames = frames
  }

  GIF.prototype.render = regl({
    frag: `
    precision highp float;
    varying vec3 vcolor;
    void main () {
      gl_FragColor = vec4(vcolor, 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec2 position;
    attribute vec3 color;
    attribute float id;
    varying vec3 vcolor;
    ${commonShader}

    uniform vec3 offset;
    uniform float scale, angle;
    void main () {
      vcolor = color;

      float c = cos(angle);
      float s = sin(angle);

      gl_Position =
        projection * (
          scale * vec4(
            c * position.x + s * position.y,
            -s * position.x + c * position.y,
            0,
            0) + view * vec4(offset, 1));
    }
    `,

    attributes: {
      position: regl.this('position'),
      id: regl.this('id'),
      color: function () {
        return {
          buffer: this.color,
          normalized: true
        }
      }
    },

    uniforms: {
      offset: regl.prop('position'),
      scale: regl.prop('scale'),
      angle: regl.prop('angle')
    },

    offset: function (_, {frame}) {
      return this.frames[Math.floor(frame) % (this.frames.length - 1)]
    },

    count: function (_, {frame}) {
      const f = Math.floor(frame) % (this.frames.length - 1)
      return this.frames[f + 1] - this.frames[f]
    },

    primitive: 'lines'
  })

  function parseGIF (gifData) {
    return new GIF(gifMesh(gifData))
  }

  return {
    forward,
    postprocess
  }

  function setupScene ({skull, pumpkin, bat}) {
    return function ({tick}) {
      bat.render({
        frame: 0.1 * tick,
        position: [0, 0, 0],
        scale: 0.01,
        angle: 0
      })
    }
  }
}
