const glslify = require('glslify')

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform float pitches[5];
    uniform vec3 colors[5];
    uniform float tempo;
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    vec3 envMap (vec3 dir) {
      float t = 1.0 / max(0.0001, abs(dir.y));
      vec3 hit = t * dir;

      return mix(
        colors[0],
        colors[2],
        texture2D(freq, vec2(0.001 * length(hit))).r);
    }

    #pragma glslify: snoise = require(glsl-noise/simplex/3d)
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const terrain = initTerrain(regl)

  const setupPrepass = regl({
    colorMask: [false, false, false, false]
  })

  function scene () {
    setupPrepass(() => {
      terrain.draw()
    })
    terrain.draw()
    terrain.update()
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

    uniform vec2 redOffset, greenOffset, blueOffset;
    uniform sampler2D pixels[2];

    void main () {
      vec2 p = uv - 0.5;
      float theta = atan(p.y, p.x);
      float radius = length(p);


      vec2 rotUV = 0.5 + radius * vec2(cos(theta), sin(theta));

      vec4 rcolor = texture2D(pixels[0], rotUV + redOffset);
      vec4 gcolor = texture2D(pixels[0], rotUV + greenOffset);
      vec4 bcolor = texture2D(pixels[0], rotUV + blueOffset);

      vec3 color = vec3(
        rcolor.r,
        gcolor.g,
        bcolor.b
      );

      float dim = 1.0 / (1.0 + exp(-8.0 * (0.25 - length(uv - 0.5))));
      gl_FragColor = vec4(pow(dim * color, vec3(1.0 / gamma)), 1);
    }
    `,

    uniforms: {
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight],
      redOffset: regl.prop('redOffset'),
      blueOffset: regl.prop('blueOffset'),
      greenOffset: regl.prop('greenOffset')
    }
  })

  function postprocess (context) {
    drawPost({
      redOffset: [
        0.08 * context.beats[3] * (Math.random() - 0.5),
        0.08 * context.beats[4] * (Math.random() - 0.5)
      ],
      greenOffset: [
        0.08 * context.beats[5] * (Math.random() - 0.5),
        0.08 * context.beats[6] * (Math.random() - 0.5)
      ],
      blueOffset: [
        0.08 * context.beats[7] * (Math.random() - 0.5),
        0.08 * context.beats[8] * (Math.random() - 0.5)
      ]
    })
  }

  return {
    forward,
    postprocess
  }

  function initTerrain (regl) {
    const BUFFER_SIZE = 64
    const NUM_LODS = 6

    const terrainTexture = regl.texture({
      radius: 128,
      type: 'float',
      wrap: 'repeat',
      min: 'linear',
      mag: 'linear'
    })

    const terrainFBO = [
      regl.framebuffer({
        color: terrainTexture,
        depthStencil: false
      }),
      regl.framebuffer({
        color: regl.texture({
          radius: 512,
          type: 'float',
          wrap: 'repeat'
        }),
        depthStencil: false
      }),
      regl.framebuffer({
        color: regl.texture({
          radius: 512,
          type: 'float',
          wrap: 'repeat'
        }),
        depthStencil: false
      })
    ]

    const terrainSnippet = `
      uniform sampler2D terrain;

      #define EPSILON (1.0 / 4096.0)

      float terrainHeight (vec2 uv) {
        return 10.0 *
           pow(snoise(vec3(20.0 * uv,
             cos(${2.0 * Math.PI} * 0.25 * tempo * time))), 3.0) +

           30.0 *
              pow(snoise(vec3(2.0 * uv,
                cos(${2.0 * Math.PI} * 0.125 * tempo * time))), 2.0)

             - 40.0 +
            texture2D(terrain, 10.0 * uv).r;
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
        uv = qc + vec2(0, +zi / 512.0);
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
        quadScale: regl.prop('scale'),
        terrain: terrainTexture
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

      depth: {
        func: '<='
      }

      //n primitive: 'lines'
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

    const updateTerrain = regl({
      framebuffer: regl.prop('dst'),

      frag: `
      precision highp float;
      uniform sampler2D src;
      uniform vec2 resolution, impulse;
      varying vec2 uv;

      ${commonShader}

      vec4 fetch (sampler2D image, vec2 coord) {
        return texture2D(image, coord / resolution);
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
        vec4 s0 = texture2D(src, uv);

        float theta = 10.0 * ${2.0 * Math.PI} * tempo * time;

        vec2 center = vec2(
          cos(0.125 * ${2.0 * Math.PI} * tempo * time),
          sin(0.125 * ${2.0 * Math.PI} * tempo * time));

        gl_FragColor =
          0.95 * (s0 + 0.01 * lap(src, id) +

          step(0.25, length(uv - center)) *
          4.5 * beats[0] * texture2D(pcm,
            fract(10.0 *
                vec2(cos(theta) * uv.x + sin(theta) * uv.y))))
            ;
      }
      `,

      vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (position + 1.0);
        gl_Position = vec4(position, 0, 1);
      }`,

      uniforms: {
        src: regl.prop('src'),
        prev: regl.prop('prev'),
        resolution: ({viewportWidth, viewportHeight}) =>
          [viewportWidth, viewportHeight],
        impulse: regl.prop('impulse')
      },

      attributes: {
        position: [
          [-4, 0],
          [4, -4],
          [4, 4]
        ]
      },

      count: 3
    })

    return {
      texture: terrainTexture,
      draw: function () {
        drawBuffer(terrainPatches)
      },
      update: function () {
        updateTerrain({
          src: terrainFBO[0],
          dst: terrainFBO[1]
        })
        updateTerrain({
          dst: terrainFBO[0],
          src: terrainFBO[1]
        })
      }
    }
  }
}
