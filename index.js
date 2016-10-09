const regl = require('regl')({
  pixelRatio: 1,
  onDone: (err) => {
    if (err) {
      document.body.innerHTML = `
<div style="width: 100%; font-size: 32pt;" align="center">
WebGL not supported
</div>`
    }
  }
})
const palettesCSS = require('./palettes.json')
const reglAnalyser = require('regl-audio/analyser')

const renderer = require('./renderer')(regl)

const palettes = palettesCSS.map((pal) => {
  return pal.map((hexStr) => {
    return [
      parseInt(hexStr.substr(1, 2), 16) / 255.0,
      parseInt(hexStr.substr(3, 2), 16) / 255.0,
      parseInt(hexStr.substr(5, 2), 16) / 255.0
    ]
  })
})

// docs: https://github.com/regl-project/regl-audio
const getUserMedia = (navigator.getUserMedia ||
                      navigator.webkitGetUserMedia ||
                      navigator.mozGetUserMedia ||
                      navigator.msGetUserMedia)

const audioContext = new (
  window.AudioContext || window.webkitAudioContext)()

setupMic()

function setupMic () {
  getUserMedia.call(
    navigator,
    { audio: true },
    function (stream) {
      const analyser = audioContext.createAnalyser()
      audioContext.createMediaStreamSource(stream).connect(analyser)
      setup(analyser)
    },
    function () {
      window.alert('microphone input not supported')
    })
}

function setup (analyser) {
  const microphone = reglAnalyser({
    regl,
    analyser,
    beats: 16,
    name: '',
    sampleRate: audioContext.sampleRate
  })
  setTimeout(function () {
    const postFBO = [
      regl.framebuffer({
        color: regl.texture({
          radius: 256,
          min: 'linear',
          mag: 'linear'
        })
      }),
      regl.framebuffer({
        color: regl.texture({
          radius: 256,
          min: 'linear',
          mag: 'linear'
        })
      })
    ]

    let nextPalette
    function randomizePalette () {
      const P =
        palettes[(Math.random() * palettes.length) | 0]
      if (P.length !== 5) {
        return
      }
      nextPalette = P.map((colors) =>
        colors.map((x) => Math.pow(x, 2.2)))
      nextPalette.sort(function (a, b) {
        return a[0] + a[1] + a[2] - b[0] - b[1] - b[2]
      })
    }
    randomizePalette()
    let curPalette = nextPalette.slice()

    const basicSetup = regl({
      framebuffer: ({tick}) => postFBO[tick % 2],

      context: {
        colors: ({tick}) => {
          if (tick % 100 === 0) {
            randomizePalette()
          }
          for (let i = 0; i < 5; ++i) {
            for (let j = 0; j < 3; ++j) {
              curPalette[i][j] = 0.25 * curPalette[i][j] + 0.75 * nextPalette[i][j]
            }
          }
          return curPalette
        }
      },

      vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 uv;
      void main () {
        uv = 0.5 * (position + 1.0);
        gl_Position = vec4(position, 1, 1);
      }
      `,

      uniforms: {
        prevPixels: ({tick}) => postFBO[(tick + 1) % 2],
        time: ({tick}) => tick / 60.0,
        pcm: regl.context('timeTexture'),
        'colors[0]': regl.context('colors[0]'),
        'colors[1]': regl.context('colors[1]'),
        'colors[2]': regl.context('colors[2]'),
        'colors[3]': regl.context('colors[3]'),
        'colors[4]': regl.context('colors[4]')
      },

      attributes: {
        position: [
          -4, 0,
          4, 4,
          4, -4
        ]
      },

      count: 3
    })

    const setupPostProcess = regl({
      framebuffer: null,

      context: {
        'curPixels': ({tick}) => postFBO[tick % 2].color[0],
        'prevPixels': ({tick}) => postFBO[(tick + 1) % 2].color[0]
      },

      depth: {
        enable: false,
        mask: false
      },

      uniforms: {
        'pixels[0]': ({tick}) => postFBO[tick % 2].color[0],
        'pixels[1]': ({tick}) => postFBO[(tick + 1) % 2].color[0]
      }
    })

    regl.frame(({viewportWidth, viewportHeight, tick}) => {
      const s = 2
      postFBO[0].resize(s * viewportWidth, s * viewportHeight)
      postFBO[1].resize(s * viewportWidth, s * viewportHeight)
      microphone(() => {
        basicSetup((context) => {
          renderer.forward(context)
          setupPostProcess(renderer.postprocess)
        })
      })
    })
  }, 0)
}
