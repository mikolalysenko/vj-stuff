const resl = require('resl')
const glslify = require('glslify')

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

    #pragma glslify: pnoise = require(glsl-noise/periodic/2d)

    #pragma glslify: curlNoise = require(glsl-curl-noise)
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = regl({
    frag: `
    precision highp float;
    varying vec2 screenPos;

    ${commonShader}

    void main () {
      vec4 pcolor = texture2D(prevPixels, screenPos);
      gl_FragColor = vec4(pcolor.rgb * 0.99, 1);
    }
    `,

    vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 screenPos;
    void main () {
      screenPos = 0.5 * (position + 1.0);
      gl_Position = vec4(position, 1, 1);
    }
    `,

    depth: {
      enable: false
    }
  })

  let _scene = function () {}
  function forward (context) {
    const t = context.tick * 0.001
    setupCamera(
      [5 * Math.cos(t), 0, 10 * Math.sin(t)],
      [0, 0, 0],
      () => {
        regl.clear({depth: 1})
        drawBackground()
        _scene(context)
      })
  }

  const drawPost = regl({
    frag: glslify`
    precision mediump float;
    varying vec2 uv;

    ${commonShader}

    uniform sampler2D pixels[2];

    void main () {
      /*
      vec2 p = uv - 0.5;
      float theta = atan(p.y, p.x);
      float radius = length(p);
      vec4 color = texture2D(pixels[0],
        0.5 + radius * vec2(cos(theta), sin(theta)));
      */

      vec4 color0 = texture2D(pixels[0], uv);
      vec4 color1 = texture2D(pixels[1], uv);

      vec4 color = color0 + color1;

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

  resl({
    manifest: {
      skull: {
        type: 'video',
        src: 'gifs/skull.mp4'
      },

      pumpkin: {
        type: 'video',
        src: 'gifs/pumpkin.mp4'
      }
    },

    onDone(assets) {
      _scene = setupScene(assets)
    }
  })

  return {
    forward,
    postprocess
  }

  function setupScene ({skull, pumpkin}) {
    skull.loop = true
    skull.play()
    const skullTex = regl.texture(skull)

    pumpkin.loop = true
    pumpkin.play()
    const pumpkinTex = regl.texture(pumpkin)


    const N = 32
    const T = 3

    //
    //  dx / dt = x(t) - x(t - 1)
    //

    const stateFBO = Array(T).fill().map(() =>
      regl.framebuffer({
        depthStencil: false,
        color: regl.texture({
          radius: N,
          type: 'float',
          min: 'linear',
          mag: 'linear',
          wrap: 'repeat'
        })
      }))

    function nextFBO ({tick}) {
      return stateFBO[tick % T]
    }

    function prevFBO (n) {
      return ({tick}) => stateFBO[(tick + T - n) % T]
    }

    const bigTriangle = {
      vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (position + 1.0);
        gl_Position = vec4(position, 0, 1);
      }
      `,

      attributes: {
        position: [
          [-4, 0],
          [4, 4],
          [4, -4]
        ]
      },

      count: 3
    }

    const update = regl(Object.assign({
      framebuffer: nextFBO,

      uniforms: {
        'state[0]': prevFBO(1),
        'state[1]': prevFBO(2),
        resolution: ({viewportWidth, viewportHeight}) =>
          [viewportWidth, viewportHeight]
      },

      frag: `
      precision highp float;
      uniform sampler2D state[2];
      varying vec2 uv;

      ${commonShader}

      #define EPSILON 0.001

      vec3 force (vec3 p) {
        return 0.00001 * curlNoise(p) + 0.000005 * (normalize(p) - p);
        /*
        return 0.0 +
          0.0025 * beats[0] * curlNoise(p) +
          0.00005 * (1.0 - beats[3]) * (normalize(p) - p) +
          impulseDir / (1.0 + exp(-20.0 * (0.9 - length(p - impulseOrigin))));
        */
      }

      void main () {
        vec3 s0 = texture2D(state[0], uv).xyz;
        vec3 s1 = texture2D(state[1], uv).xyz;

        vec3 nextPos = s0 +
          (s0 - s1) + force(s0);

        gl_FragColor = vec4(
          nextPos,
          1);
      }
      `
    }, bigTriangle))

    const drawSkulls = regl({
      vert: `
      precision highp float;
      attribute vec2 position, id;
      attribute float size;
      ${commonShader}
      varying vec2 uv;
      varying float weight;

      uniform sampler2D skullPosition;

      void main () {
        weight = step(id.x, 0.25);
        uv = 0.5 * (position + 1.0);
        vec3 worldPos = texture2D(skullPosition, id).xyz;
        gl_Position = projection * (vec4(size * position, 0, 0) + view * vec4(worldPos, 1));
      }
      `,

      frag: `
      precision highp float;
      ${commonShader}
      varying vec2 uv;
      varying float weight;
      uniform sampler2D gif[2];

      void main () {
        vec4 color0 = texture2D(gif[0], vec2(uv.x, 1.0 - uv.y));
        vec4 color1 = texture2D(gif[1], vec2(uv.x, 1.0 - uv.y));
        vec4 color = mix(color0, color1, weight);

        if (min(min(color.r, color.g), color.b) >= 0.8) {
          discard;
        }
        gl_FragColor = color;
      }
      `,

      attributes: (() => {
        const positions = []
        const ids = []
        const size = []

        for (let i = 0; i < N; ++i) {
          for (let j = 0; j < N; ++j) {
            positions.push([
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, -1],
              [-1, 1],
              [1, 1]
            ])
            const s = Math.random() * 0.125
            for (let l = 0; l < 6; ++l) {
              ids.push([
                i / N,
                j / N
              ])
              size.push(s)
            }
          }
        }

        return {
          position: positions,
          id: ids,
          size
        }
      })(),

      uniforms: {
        'gif[0]': skullTex,
        // 'gif[1]': pumpkinTex,
        'gif[1]': skullTex,
        skullPosition: nextFBO
      },

      count: N * N * 6
    })

    init()

    return function (context) {
      drawSkulls()
      skullTex(skull)
      pumpkinTex(pumpkin)
      update()
    }

    function init () {
      const initFBO = regl(Object.assign({
        frag: glslify`
        precision mediump float;
        varying vec2 uv;

        #pragma glslify: pnoise = require(glsl-noise/periodic/2d)

        void main () {
          float theta = ${4.0 * Math.PI} * uv.x;
          float phi = ${Math.PI} * (uv.y - 0.5);

          float r = 1.0;

          gl_FragColor = vec4(
            r * cos(theta) * cos(phi),
            r * sin(theta) * cos(phi),
            r * sin(phi),
            1);
        }
        `,

        framebuffer: regl.prop('framebuffer')
      }, bigTriangle))

      for (let i = 0; i < T; ++i) {
        initFBO({
          framebuffer: stateFBO[i]
        })
      }
    }
  }
}
