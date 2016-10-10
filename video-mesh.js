const mat4 = require('gl-mat4')
const glslify = require('glslify')
const surfaceNets = require('surface-nets')
const ndarray = require('ndarray')

const GRID_SIZE = 4

module.exports = function (regl) {
  const environmentMap = `
  vec3 ground () {
    return mix(colors[0], colors[4], beats[0] + beats[1] + beats[5]);
  }

  vec3 envMap (vec3 dir) {
    float t = 1.0 / max(0.0001, length(dir.y));
    vec3 hit = t * dir;

    vec2 hx = step(vec2(0.05), fract(0.25 * hit.xz));

    return colors[0];
  }

  vec3 roughEnvMap (vec3 dir) {
    return mix(
      0.5 * (colors[2] + colors[4]),
      ground(),
      1.0 / (1.0 + exp(10.0 * dir.y)));
  }
  `

  const commonShader = glslify`
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels, video;
    uniform float time, volume, gamma;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    ${environmentMap}
  `

  const drawBackground = regl({
    frag: `
    precision highp float;
    varying vec2 screenPos;

    ${commonShader}

    void eyeVec (out vec3 origin, out vec3 dir) {
      mat4 inv = invView * invProjection;

      vec4 s0 = inv * vec4(screenPos, 0, 1);
      vec4 s1 = inv * vec4(screenPos, 1, 1);

      vec3 x0 = s0.xyz / s0.w;
      vec3 x1 = s1.xyz / s1.w;

      origin = x0;
      dir = normalize(x1 - x0);
    }

    void main () {
      vec3 origin, dir;
      eyeVec(origin, dir);
      gl_FragColor = vec4(envMap(dir), 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 screenPos;
    void main () {
      screenPos = position;
      gl_Position = vec4(position, 1, 1);
    }
    `,

    depth: {
      enable: false
    }
  })

  const webcamParticles = regl({
    vert: `
    precision mediump float;
    attribute vec2 particleId;
    varying vec3 fcolor;

    ${commonShader}

    void main () {
      vec4 videoColor = texture2D(video, particleId);

      float luminance = max(videoColor.r, max(videoColor.g, videoColor.b));

      fcolor = mix(colors[1], colors[3], pow(luminance, 0.01));

      gl_PointSize = 8.0;

      gl_Position = projection * view * vec4(
        80.0 * (vec3(particleId.x,
        1.0 - particleId.y,
        luminance + 4.0 * beats[0] *
          cos(10.0 * time + 10.0 * length(particleId - 0.5))
        ) - 0.5),
        1);
    }
    `,

    frag: `
    precision mediump float;
    varying vec3 fcolor;

    void main () {
      gl_FragColor = vec4(fcolor, 1);
    }
    `,

    attributes: {
      particleId: (() => {
        const ids = []
        for (let x = 0; x < 256; ++x) {
          for (let y = 0; y < 256; ++y) {
            ids.push(x / 256, y / 256)
          }
        }
        return ids
      })()
    },

    count: 256 * 256,

    primitive: 'points'
  })

  const webcamFBO = regl.framebuffer({
    shape: [256, 256, 4],
    depthStencil: false
  })

  const drawWebcam = regl({
    frag: `
    precision mediump float;
    varying vec2 uv;
    uniform sampler2D video;
    void main () {
      vec4 color = texture2D(video, uv);
      gl_FragColor = vec4(max(
        color.r,
        max(color.g, color.b)
      ), 0, 0, 1);
    }
    `,

    vert: `
    precision mediump float;
    attribute vec2 position;
    varying vec2 uv;

    void main () {
      uv = 0.5 * (position + 1.0);
      gl_Position = vec4(position, 0, 1);
    }
    `,

    framebuffer: webcamFBO
  })

  const webcamPixels = new Uint8Array(256 * 256 * 4)

  const webcamBuffer = regl.buffer({
    type: 'float'
  })
  const webcamElements = regl.elements({
    primitive: 'lines',
    length: 1
  })

  const webcamLines = regl({
    vert: `
    precision mediump float;

    ${commonShader}

    attribute vec2 position;

    varying float fDZ;

    void main () {
      float dz = 1.0 + cos(0.1 * time + 0.5 * position.x);

      gl_Position = projection * view * vec4(
        80.0 * position.x / 256.0 - 40.0,
        80.0 * (1.0 -  (position.y / 256.0)) - 40.0 +
        2.0 * dz * sin(0.8 * position.x + 12.0 * time),
        -30.0 + 5.0 * dz,
        1.0);
    }
    `,

    frag: `
    precision mediump float;

    ${commonShader}

    void main () {
      gl_FragColor = vec4(colors[3], 1);
    }
    `,

    attributes: {
      position: webcamBuffer
    },

    lineWidth: 8,

    elements: webcamElements
  })

  function scene () {
    drawWebcam(({tick}) => {
      regl.draw()
      regl.read(webcamPixels)
      const mesh = surfaceNets(ndarray(
        webcamPixels,
        [256, 256],
        [4, 256 * 4]
      ), 2)

      webcamBuffer(mesh.positions)
      webcamElements(mesh.cells)
    })
    webcamParticles()
    webcamLines()
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
      uniform mat4 projection, view;
      void main () {
        gl_Position = projection * view * vec4(position, 1);
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
        eye: regl.prop('eye')
      },

      uniforms: {
        projection: regl.context('projection'),
        invProjection: regl.context('invProjection'),
        view: regl.context('view'),
        invView: regl.context('invView'),
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

  let angle = 0.0
  const cameraTarget = [0, 0, 0]
  const cameraTargetGoal = [0, 0, 0]
  const cameraEye = [0, 0, -40]
  const cameraEyeGoal = [0, 0, -40]
  function forward (context) {
    angle += 0.01

    const radius = 4.0 + 2.0 * GRID_SIZE

    if (context.beats[3] > 0.001) {
      for (let i = 0; i < 3; ++i) {
        cameraTargetGoal[i] += 2.0 * (Math.random() - 0.5)
        cameraTargetGoal[i] *= 0.95
      }
    }

    if (context.beats[0] > 0.001) {
      for (let i = 0; i < 3; ++i) {
        cameraEyeGoal[i] += 10.0 * (Math.random() - 0.5)
        cameraEyeGoal[i] *= 0.95
      }
      cameraEyeGoal[2] = 40
    }

    for (let i = 0; i < 3; ++i) {
      cameraTarget[i] = 0.9 * cameraTarget[i] + 0.1 * cameraTargetGoal[i]
      cameraEye[i] = 0.9 * cameraEye[i] + 0.1 * cameraEyeGoal[i]
    }

    setupCamera(
      cameraEye,
      cameraTarget, () => {
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
      vec4 color = texture2D(pixels[0], uv);
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
