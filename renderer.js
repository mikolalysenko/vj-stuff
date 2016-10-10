const mat4 = require('gl-mat4')
const glslify = require('glslify')
const cube = require('./cube-mesh')
const cubeAnim = require('./cube-anim')

const GRID_SIZE = 4

module.exports = function (regl) {
  const environmentMap = `
  vec3 envMap (vec3 dir) {
    float t = 1.0 / max(0.0001, abs(dir.y));
    vec3 hit = t * dir;

    vec4 noise = texture2D(noiseTexture, 0.05 * hit.xz + vec2(0.05 * time, 0));

    return mix(
      mix(colors[1], colors[2], noise.r),
      colors[0],
      1.0 / (1.0 + exp(12.0 * dir.y)));
  }

  vec3 roughEnvMap (vec3 dir) {
    return mix(
      0.5 * (colors[1] + colors[2]),
      colors[0],
      1.0 / (1.0 + exp(10.0 * dir.y)));
  }
  `

  const commonShader = glslify`
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
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

  const displacements = new Float32Array(
    GRID_SIZE * GRID_SIZE * GRID_SIZE * 3)
  const prevDisplacements = new Float32Array(
    GRID_SIZE * GRID_SIZE * GRID_SIZE * 3)
  const targetDisplacements = new Float32Array(
    GRID_SIZE * GRID_SIZE * GRID_SIZE * 3)
  const displacementTexture = regl.texture({
    type: 'float',
    data: displacements,
    shape: [GRID_SIZE * GRID_SIZE, GRID_SIZE, 3]
  })

  function cubeOffset (i, j, k) {
    return (i * GRID_SIZE + j) + k * GRID_SIZE * GRID_SIZE
  }

  function snapCube (i, j, k) {
    const offset = cubeOffset(i, j, k) * 3
    for (let x = 0; x < 3; ++x) {
      displacements[offset + x] =
      prevDisplacements[offset + x] =
      targetDisplacements[offset + x] =
       Math.round(targetDisplacements[offset + x])
    }
  }

  function moveCube (
    i, j, k,
    tx, ty, tz) {
    const offset = cubeOffset(i, j, k) * 3

    targetDisplacements[offset] = tx
    targetDisplacements[offset + 1] = ty
    targetDisplacements[offset + 2] = tz
  }

  function setCube (
    i, j, k,
    x, y, z
  ) {
    let offset = cubeOffset(i, j, k) * 3
    displacements[offset] =
    prevDisplacements[offset] =
    targetDisplacements[offset] = x

    offset += 1
    displacements[offset] =
    prevDisplacements[offset] =
    targetDisplacements[offset] = y

    offset += 1
    displacements[offset] =
    prevDisplacements[offset] =
    targetDisplacements[offset] = z
  }

  function forEachCube (f) {
    for (let i = 0; i < GRID_SIZE; ++i) {
      for (let j = 0; j < GRID_SIZE; ++j) {
        for (let k = 0; k < GRID_SIZE; ++k) {
          f(i, j, k)
        }
      }
    }
  }

  function updateDisplacements (rate, damping) {
    for (let i = 0; i < displacements.length; ++i) {
      const s = displacements[i]
      const p = prevDisplacements[i]
      const t = targetDisplacements[i]

      const v = s - p
      const f = t - s

      let n = s + rate * f + v
      if (Math.abs(v) + Math.abs(f) < 0.01) {
        n = t
      }

      displacements[i] = s * damping + n * (1.0 - damping)
      prevDisplacements[i] = s
    }

    displacementTexture.subimage(displacements)
  }

  const drawCubeArray = regl({
    frag: `
    precision mediump float;
    varying vec3 fNormal, fEye;
    varying float fAO;

    ${commonShader}

    void main () {
      vec3 N = normalize(fNormal);
      vec3 V = normalize(fEye);
      vec3 R = reflect(N, V);

      vec3 spec = envMap(R);
      vec3 diffuse =
        fAO * max(vec3(1.0), roughEnvMap(R) + 0.5) * colors[3];

      float f0 = 0.95 * pow(1.0 - dot(V, N), 5.0);
      gl_FragColor = vec4(mix(diffuse, spec, f0), 1);
    }
    `,

    vert: `
    precision mediump float;
    attribute vec3 position, normal;
    attribute vec2 id;
    uniform sampler2D displacements;
    uniform vec3 eye;
    uniform mat4 projection, view;
    varying vec3 fNormal, fEye;
    varying float fAO;

    float ambientOcclusion (vec3 p, vec3 n) {
      float s = 0.0;
      for (int i = 0; i < ${GRID_SIZE * GRID_SIZE}; ++i) {
        for (int j = 0; j < ${GRID_SIZE}; ++j) {
          vec3 q = texture2D(displacements,
            vec2(
              float(i) / ${GRID_SIZE * GRID_SIZE}.0,
              float(j) / ${GRID_SIZE}.0)).xyz - 0.5 * ${GRID_SIZE}.0;
          vec3 d = p - q;
          float l2 = dot(d, d);
          s += max(0.0, -dot(d, n)) / l2;
        }
      }
      return 1.0 - min(1.0, 0.1 * s);
    }

    void main () {
      vec3 P = position + texture2D(displacements, id).xyz;
      fNormal = normal;
      fEye = eye - P;
      gl_Position = projection * view * vec4(P, 1);
      fAO = ambientOcclusion(P, normal);
    }
    `,

    attributes: (() => {
      const positions = []
      const normals = []
      const ids = []
      for (let i = 0; i < GRID_SIZE; ++i) {
        for (let j = 0; j < GRID_SIZE; ++j) {
          for (let k = 0; k < GRID_SIZE; ++k) {
            const offset = cubeOffset(i, j, k)
            const u = (0.5 + (offset % (GRID_SIZE * GRID_SIZE))) / (GRID_SIZE * GRID_SIZE)
            const v = (0.5 + Math.floor(offset / (GRID_SIZE * GRID_SIZE))) / GRID_SIZE
            for (let p = 0; p < cube.positions.length; ++p) {
              const x = cube.positions[p]
              positions.push(
                0.5 * x[0] - GRID_SIZE / 2,
                0.5 * x[1] - GRID_SIZE / 2,
                0.5 * x[2] - GRID_SIZE / 2)
              normals.push(cube.normals[p])
              ids.push([u, v])
            }
          }
        }
      }
      return {
        position: positions,
        normal: normals,
        id: ids
      }
    })(),

    cull: {
      enable: true
    },

    uniforms: {
      displacements: displacementTexture
    },

    count: cube.positions.length * GRID_SIZE * GRID_SIZE * GRID_SIZE
  })

  function scene () {
    drawCubeArray()
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

  const {
    init,
    next
  } = cubeAnim({
    snap: snapCube,
    move: moveCube,
    set: setCube,
    forEach: forEachCube,
    N: GRID_SIZE
  })

  init()

  let angle = 0.0
  let animCounter = 0.1

  function forward (context) {
    angle += Math.pow(context.beats[0], 4.0) + 0.001

    const radius = 4.0 + 2.0 * GRID_SIZE

    setupCamera(
      [radius * Math.cos(angle), 2.5, radius * Math.sin(angle)],
      [0, 0, 0], () => {
        regl.clear({depth: 1})
        drawBackground()
        scene(context)
      })
    animCounter -= 4.0 * Math.sqrt(context.beats[0])
    if (animCounter < 0) {
      next()
      animCounter = 0.1
    }
    updateDisplacements(0.1, 0.4)
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
