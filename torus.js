const glslify = require('glslify')

const NU = 256
const NV = 256

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    #define PI 3.14159265
    #define TAU (2.*PI)

    #pragma glslify: snoise = require("glsl-noise/simplex/4d")

    vec3 envMap (vec3 dir) {
      return colors[0];
    }
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const drawTorus = regl({
    frag: `
    precision highp float;
    varying vec3 position, normal;
    varying vec2 uv;

    ${commonShader}

    void main () {
      gl_FragColor = vec4(normal, 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec2 paramUV;
    varying vec3 position, normal;
    varying vec2 uv;

    #define EPSILON 0.001

    ${commonShader}

    vec3 curvePosition (float t) {
      float theta = TAU * t;
      return vec3(
        cos((6. + cos(time)) * theta),
        sin(5. * theta),
        sin(3. * theta));
    }

    vec3 curveUp (float t) {
      return vec3(0., 0., 1.);
    }

    vec2 curveSection (float t, float s) {
      float theta = TAU * s;
      return (0.125 +
        0.125 * snoise(vec4(10. * cos(TAU*t), 10.*s, time, 0.))) *
      vec2(cos(theta), sin(theta));
    }

    vec3 surfacePosition (vec2 uv) {
      vec3 c0 = curvePosition(uv.x);
      vec3 c1 = curvePosition(uv.x + EPSILON);

      vec3 front = normalize(c1 - c0);
      vec3 up = normalize(curveUp(uv.x));
      vec3 right = normalize(cross(up, front));

      vec2 section = curveSection(uv.x, uv.y);
      return c0 + section.x * right + section.y * up;
    }

    void main () {
      uv = paramUV;
      position = surfacePosition(uv);

      vec3 dpdu = surfacePosition(vec2(uv.x + EPSILON, uv.y)) - position;
      vec3 dpdv = surfacePosition(vec2(uv.x, uv.y + EPSILON)) - position;
      normal = normalize(cross(dpdu, dpdv));

      gl_Position = projection * view * vec4(position, 1);
    }
    `,

    attributes: {
      paramUV: (() => {
        const points = []
        for (let i = 0; i < NU; ++i) {
          for (let j = 0; j < NV; ++j) {
            const u0 = i / NU
            const u1 = (i + 1) / NU
            const v0 = j / NV
            const v1 = (j + 1) / NV
            points.push(
              u0, v0,
              u0, v1,
              u1, v0,
              u1, v0,
              u0, v1,
              u1, v1)
          }
        }
        return points
      })()
    },

    uniforms: {
      time: ({tick}) => 0.01 * tick
    },

    count: 256 * 256 * 6,
    elements: null,
    primitive: 'triangles',

    depth: {
      enable: true,
      mask: true
    },

    cull: {
      enable: true
    }
  })

  function scene () {
    drawTorus()
  }

  function forward (context) {
    setupCamera(
      [0, 0, -10],
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
