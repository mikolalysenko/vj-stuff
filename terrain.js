const glslify = require('glslify')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    vec3 envMap (vec3 dir) {
      return colors[0];
    }

    vec3 skyMap (vec3 dir) {
      return colors[0];
    }

    #pragma glslify: snoise = require(glsl-noise/simplex/3d)
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const terrain = initTerrain(regl)

  function scene () {
    terrain.draw()
  }

  function forward (context) {
    var cameraZ = context.tick
    setupCamera(
      [0, 1, cameraZ],
      [0, -200, 1000.0 + cameraZ],
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

  function initTerrain (regl) {
    const BUFFER_SIZE = 64
    const NUM_LODS = 6

    const terrainTexture = regl.texture({
      radius: 512,
      format: 'luminance',
      type: 'float',
      wrap: 'repeat'
    })

    const terrainSnippet = `
      #define EPSILON (1.0 / 4096.0)

      float terrainHeight (vec2 uv) {
        return 10.0 *
          pow(snoise(vec3(vec2(30.0, 5.3) * uv, 0.25 * time)), 0.9) - 10.0;
      }

      vec3 terrainNormal (vec2 uv) {
        float dfdu =
          (terrainHeight(uv + vec2(EPSILON, 0)) -
          terrainHeight(uv - vec2(EPSILON, 0))) / EPSILON;
        float dfdv =
          (terrainHeight(uv + vec2(0, EPSILON)) -
          terrainHeight(uv - vec2(0, EPSILON))) / EPSILON;
        return normalize(vec3(dfdu / 512.0, 1, dfdv / 512.0));
      }
      `

    const drawBuffer = regl({
      vert: `
      precision highp float;
      attribute vec2 quadUV;
      uniform float quadScale;
      uniform vec2 quadShift;

      ${commonShader}
      ${terrainSnippet}

      varying vec2 uv;
      varying vec3 vEye;

      void main () {
        float zi = floor(eye.z);
        vec2 qc = (quadScale * quadUV + quadShift).yx;
        vec2 position = 512.0 * vec2(qc.x - 0.5, qc.y) + vec2(0, zi);
        uv = fract(qc + vec2(0, +zi / 512.0));
        vec3 worldPos = vec3(position.x, terrainHeight(uv), position.y);
        vEye = eye - worldPos;
        gl_Position = projection * view * vec4(worldPos, 1);
      }
      `,

      frag: `
      precision highp float;

      ${commonShader}
      ${terrainSnippet}

      varying vec2 uv;
      varying vec3 vEye;

      void main () {
        vec3 N = terrainNormal(uv);
        vec3 V = normalize(vEye);
        vec3 R = reflect(N, V);

        vec3 vcolor = colors[3];

        vec3 spec = colors[4];
        vec3 diffuse = mix(
          colors[1], colors[3],
          max(0.0, -dot(N, vec3(1, -1, 0.25) ) ) ) ;

        float f0 = 0.95 * pow(1.0 - dot(V, N), 5.0);
        gl_FragColor = vec4(mix(diffuse, spec, f0), 1);
      }
      `,

      attributes: {
        quadUV: (function () {
          const points = []
          for (let i = 0; i <= BUFFER_SIZE; ++i) {
            for (let j = 0; j <= BUFFER_SIZE; ++j) {
              points.push([i / BUFFER_SIZE, j / BUFFER_SIZE])
            }
          }
          return points
        })()
      },

      uniforms: {
        quadShift: regl.prop('shift'),
        quadScale: regl.prop('scale')
      },

      elements: (function () {
        const cells = []
        function id (i, j) {
          return i * (BUFFER_SIZE + 1) + j
        }
        for (let i = 0; i < BUFFER_SIZE; ++i) {
          for (let j = 0; j < BUFFER_SIZE; ++j) {
            cells.push(
              [id(i, j), id(i + 1, j), id(i, j + 1)],
              [id(i, j + 1), id(i + 1, j), id(i + 1, j + 1)])
          }
        }
        return cells
      })(),

       // primitive: 'lines'
    })

    const terrainPatches = []

    let u = 0.0
    for (let d = 0; d < NUM_LODS; ++d) {
      const patchSize = 1.0 / Math.pow(2, NUM_LODS - d)
      for (let v = 0; v < 1.0; v += patchSize) {
        terrainPatches.push({
          scale: patchSize,
          shift: [u, v]
        })
      }
      u += patchSize * (BUFFER_SIZE - 8) / BUFFER_SIZE
    }

    return {
      texture: terrainTexture,
      draw: function () {
        drawBuffer(terrainPatches)
      }
    }
  }
}
