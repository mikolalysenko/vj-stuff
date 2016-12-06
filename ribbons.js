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
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const ribbons = setupRibbons()

  function scene () {
    ribbons.draw()
  }

  function forward (context) {
    const angle = context.tick * 0.01
    const radius = 2.0
    setupCamera(
      [radius * Math.cos(angle), 0, radius * Math.sin(angle)],
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

  function setupRibbons () {
    const ribbonData = new Float32Array(256 * 256 * 4)

    function setRibbon (u, v, x, y, z) {
      const ptr = 4 * (v * 256 + u)
      ribbonData[ptr] = x
      ribbonData[ptr + 1] = y
      ribbonData[ptr + 2] = z
    }

    const ribbonCoords = []
    for (let v = 0; v < 256; v += 2) {
      if (v > 0) {
        ribbonCoords.push(0, v)
      }

      const z = Math.random()

      for (let u = 0; u < 256; ++u) {
        ribbonCoords.push(
          u, v,
          u, v + 1)

        setRibbon(u, v, u / 256, v / 256, z)
        setRibbon(u, v + 1, u / 256, (v + 1) / 256, z)
      }
      if (v + 1 < 255) {
        ribbonCoords.push(255, v + 1)
      }
    }

    const ribbonState = Array(2).fill().map(() =>
      regl.framebuffer({
        color: regl.texture({
          shape: [256, 256, 4],
          data: ribbonData,
          type: 'float'
        }),
        depthStencil: true
      }))

    const drawRibbon = regl({
      vert: `
      precision highp float;
      attribute vec2 uv;
      uniform sampler2D position;
      varying vec2 vUV;
      ${commonShader}
      void main () {
        vUV = uv;
        vec3 p = texture2D(position, uv).xyz;
        gl_Position = projection * view * vec4(p, 1);
      }`,

      frag: `
      precision highp float;
      varying vec2 vUV;
      void main () {
        gl_FragColor = vec4(vUV.r, 0, vUV.g, 1);
      }
      `,

      attributes: {
        uv: {
          buffer: new Uint8Array(ribbonCoords),
          normalized: true,
          size: 2
        }
      },

      uniforms: {
        position: ({tick}) => ribbonState[tick % 2]
      },

      count: ribbonCoords.length / 2,

      primitive: 'triangle strip'
    })

    const updateRibbons = regl({
      vert: `
      precision highp float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (position + 1);
        gl_Position = vec4(position, 0, 1);
      }
      `,

      frag: `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D prev;

      vec4 fetch (vec2 p) {
        return texture2D(prev, p / 256.);
      }

      void main () {
        gl_Position = fetch(uv);
      }
      `
    })

    return {
      draw: drawRibbon
    }
  }
}
