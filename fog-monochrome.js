const glslify = require('glslify')
const sphere = require('icosphere')(4)
const mat4 = require('gl-mat4')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform float hue;
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    #pragma glslify: hsv2rgb = require(glsl-hsv2rgb)

    vec3 envMap (vec3 dir) {
      return hsv2rgb(vec3(hue,
        0.8 + beats[8], 1));
    }
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const modelMatrix = mat4.create()

  const drawBlob = regl({
    vert: `
    precision mediump float;
    attribute vec3 position;
    uniform mat4 model;
    uniform float P;
    varying float depth;
    varying vec3 normal, viewDir;

    ${commonShader}

    vec3 warp (vec3 p) {
      float pl = pow(
        dot(vec3(1, 1, 1), pow(abs(p), vec3(P))),
        1.0 / P);
      return p / pl  +
        10.0 * (beats[0] + beats[4]) * 0.1 * p * vec3(
          cos(10.0 * p.x + 10.0 * time),
          0,
          0);
    }

    #define EPSILON 0.001

    void main () {
      vec3 wp = warp(position);
      normal = normalize(
        (model * vec4(position, 0)).xyz);
      vec4 clipPosition = projection * view * model * vec4(wp, 1);
      viewDir = clipPosition.xyz / clipPosition.w;
      depth = clipPosition.z;
      gl_Position = clipPosition;
    }
    `,

    frag: `
    precision mediump float;
    varying float depth;
    varying vec3 normal, viewDir;

    ${commonShader}

    void main () {
      float rim =
        max(dot(normal, normalize(viewDir)), 0.0);
      float fog = pow(1.0 / depth, 0.25);
      gl_FragColor = vec4(
        hsv2rgb(vec3(
          hue,
          0.8 - beats[9],
          rim + fog)),
        1
      );
    }
    `,

    attributes: {
      position: sphere.positions
    },

    uniforms: {
      P: regl.prop('p'),
      center: regl.prop('center'),
      model: (_, {center, axis, angle}) => {
        mat4.identity(modelMatrix)
        mat4.translate(modelMatrix, modelMatrix, center)
        mat4.rotate(modelMatrix, modelMatrix, angle, axis)
        return modelMatrix
      }
    },

    elements: sphere.cells
  })

  const blobs = []

  for (let i = 0; i < 2000; ++i) {
    blobs.push({
      center: [
        100.0 * (Math.random() - 0.5),
        100.0 * (Math.random() - 0.5),
        300.0 * Math.random()
      ],
      velocity: [
        0.01 * (Math.pow(2.0 * Math.random() - 1.0, 3.0)),
        0.01 * (Math.random() - 0.5),
        -0.05 * Math.random()
      ],
      axis: [
        Math.random(),
        Math.random(),
        Math.random()
      ],
      angle: 0,
      p: 1.0 + 8.0 * Math.random()
    })
  }

  function scene ({beats}) {
    drawBlob(blobs)
    for (let i = blobs.length - 1; i >= 0; --i) {
      const blob = blobs[i]
      const {
        center, velocity
      } = blob
      for (let i = 0; i < 3; ++i) {
        center[i] += velocity[i]
      }
      blob.angle += 0.01
      if (blob.center[2] < -15) {
        blobs[i] = blobs[blobs.length - 1]
        blobs.pop()
      }
    }

    if (Math.random () < 0.1) {
      blobs.push({
        center: [
          80.0 * (Math.random() - 0.5),
          80.0 * (Math.random() - 0.5),
          1000.0 + Math.random() * 16
        ],
        velocity: [
          0.01 * (Math.random() - 0.5),
          0.01 * (Math.random() - 0.5),
          -0.05 * Math.random()
        ],
        axis: [
          Math.random(),
          Math.random(),
          Math.random()
        ],
        angle: 0,
        p: 1.0 + 8.0 * Math.random()
      })
    }
  }

  const setupHue = regl({
    context: {
      hue: ({tick, tempo}) => 0.4 + 0.05 * Math.cos(0.001 * 2.0 * Math.PI * tick * tempo)
    },
    uniforms: {
      hue: regl.context('hue')
    }
  })

  function forward (context) {
    setupHue(() =>
      setupCamera(
        [0, 0, -10],
        [0, 0, 0],
        () => {
          regl.clear({depth: 1})
          drawBackground()
          scene(context)
        }))
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
