const regl = require('regl')({
  pixelRatio: 1,
  extensions: ['OES_texture_float', 'OES_texture_half_float'],
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

const gamma = 2.2

// const renderer = require('./cube')(regl)
// const renderer = require('./video-mesh')(regl)
// const renderer = require('./del-voro')(regl)
// const renderer = require('./react-diffuse')(regl)
// const renderer = require('./tessellate')(regl)
const renderer = require('./terrain')(regl)

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

getUserMedia.call(
  navigator,
  {
    video: renderer.video,
    audio: true
  },
  function (stream) {
    const analyser = audioContext.createAnalyser()
    audioContext.createMediaStreamSource(stream).connect(analyser)

    if (renderer.video) {
      const video = document.createElement('video')
      video.muted = true
      video.src = window.URL.createObjectURL(stream)
      video.addEventListener('canplay', function (e) {
        setup(analyser, video)
      })
      video.play()
    } else {
      setup(analyser, null)
    }
  },
  function () {
    window.alert('microphone input not supported')
  })

function setup (analyser, video) {
  const microphone = reglAnalyser({
    regl,
    analyser,
    beats: 16,
    name: '',
    sampleRate: audioContext.sampleRate
  })
  setTimeout(function () {
    let videoTexture = null
    if (video) {
      videoTexture = regl.texture(video)
    }

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

    let paletteCounter = 25

    const basicSetup = regl({
      framebuffer: ({tick}) => postFBO[tick % 2],

      context: {
        colors: ({beats}) => {
          paletteCounter -=
            Math.sqrt(beats[0]) +
            Math.sqrt(beats[1]) +
            Math.sqrt(beats[2]) +
            Math.sqrt(beats[3]) - 0.125
          if (paletteCounter < 0 || paletteCounter > 50) {
            paletteCounter = 25
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
      precision highp float;
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
        'colors[4]': regl.context('colors[4]'),
        noiseTexture: regl.texture({
          shape: [64, 64, 4],
          data: (Array(64 * 64 * 4)).fill().map(() =>
            255.0 * Math.random()),
          min: 'linear mipmap linear',
          mag: 'linear',
          wrap: 'repeat'
        }),
        gamma: gamma,
        video: video ? videoTexture : 0
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

      if (video && tick % 2) {
        videoTexture.subimage(video)
      }
    })
  }, 0)
}
