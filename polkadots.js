const glslify = require('glslify')
const ndarray = require('ndarray')

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
  const drawBackground = regl({
    vert: `
    precision mediump float;
    attribute vec2 position;
    uniform vec2 offset;
    uniform float scale;
    ${commonShader}
    void main () {
      float ampl = texture2D(freq, vec2(0.05)).r;
      gl_Position = vec4(
        min(ampl + 0.7, 1.) * position + offset, 0.99, 1);
    }
    `,

    frag: `
    precision mediump float;
    ${commonShader}
    uniform vec2 resolution;

    vec2 tri (float theta) {
      return vec2(cos(theta), sin(theta));
    }

    float circleMask (vec2 p) {
      vec2 pf = fract(p);
      return step(length(pf - 0.5), 0.25);
    }

    vec2 rotate (vec2 uv, float angle) {
      vec2 d = tri(angle);
      return vec2(
        d.x * uv.x + d.y * uv.y,
        -d.y * uv.x + d.x * uv.y);
    }

    float circleMask2 (vec2 p) {
      vec2 pf = fract(p);
      vec2 pi = floor(p);
      float skip = step(0.5, fract((1.9 * pi.x + 1.1 * pi.y) / 2.0));
      return step(length(pf - 0.5), 0.25) * skip;
    }

    void main () {
      vec2 uv = gl_FragCoord.xy / resolution;
      float angle = 0.25 * texture2D(freq, vec2(0.05)).r;

      vec3 subColor = mix(
        colors[2],
        colors[4],
        circleMask(8. * rotate(uv + 1. - 0.5 * vec2(0.25 * beats[0], time), 0.5)));

      vec3 bgColor = mix(
        colors[0],
        subColor,
        circleMask(3.0 *
          rotate(uv + 0.02 * vec2(time, 0), angle)));

      vec3 floater = mix(
        bgColor,
        colors[3],
        circleMask2(2.0 * uv + vec2(time)));

      gl_FragColor = vec4(
        floater, 1);
    }
    `,

    attributes: {
      position: (() => {
        const p = [
        ]
        for (let i = 0; i <= 100; ++i) {
          const theta = i / 100.0 * 2.0 * Math.PI
          p.push(Math.cos(theta), Math.sin(theta))
        }
        return p
      })()
    },

    uniforms: {
      offset: regl.prop('offset'),
      scale: regl.prop('scale'),
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight]
    },

    depth: {
      enable: false
    },

    count: 101,

    primitive: 'triangle fan'
  })

  function scene () {
  }

  function forward (context) {
    setupCamera(
      [0, 0, -10],
      [0, 0, 0],
      () => {
        regl.clear({depth: 0, color: [0, 0, 0, 1]})
        drawBackground({
          offset: [0, 0],
          scale: 1
        })
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
