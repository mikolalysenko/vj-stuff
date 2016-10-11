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
  `

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  function scene () {
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
