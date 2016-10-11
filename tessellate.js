const mat4 = require('gl-mat4')
const glslify = require('glslify')
const delaunay = require('delaunay-triangulate')

module.exports = function (regl) {
  const environmentMap = `
  vec3 ground () {
    return mix(colors[0], colors[4], beats[0] + beats[1] + beats[5]);
  }

  vec3 envMap (vec3 dir) {
    float t = 1.0 / (1.0 - length(dir.xy));
    vec3 hit = t * dir;

    float theta = atan(hit.y, hit.x) + 0.5 * time;
    float radius = hit.z - 0.25 * time;

    float hx = step(fract(theta * 40.0 / ${2.0 * Math.PI}), 0.1);
    float hy = step(fract(radius * 10.0), 0.1);
    return mix(
      mix(
        colors[0],
        colors[2],
        max(hx, hy)),
      colors[1],
      1.0 / (1.0 + exp(-5.0 * (1.0 - abs(hit.z)) ) ));
  }

  vec3 roughEnvMap (vec3 dir) {
    return colors[0];
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

  const drawPoints = regl({
    vert: `
    precision mediump float;
    attribute vec2 position;
    void main () {
      // gl_PointSize = 8.0;
      gl_Position = vec4(0.125 * position, 0, 1);
    }`,

    frag: `
    precision mediump float;
    ${commonShader}
    void main () {
      gl_FragColor = vec4(colors[4], 1);
    }
    `,

    attributes: {
      position: regl.prop('position')
    },

    lineWidth: 4,

    elements: regl.prop('cells')
  })

  let shift = 0

  function scene ({tick, beats}) {
    shift += beats[2]
    const points = []
    for (let i = 0; i < 5; ++i) {
      for (let j = 0; j < 15; ++j) {
        var theta = (i + 0.5 * j *
            Math.cos(shift + 0.001 * Math.PI * 2.0 * tick)) / 5.0 * Math.PI * 2.0
        const c = Math.cos(theta)
        const s = Math.sin(theta)
        points.push([
          (j + 0.125 * Math.cos(0.25 * j + shift + 0.01 * tick)) * c,
          (j + 0.125 * Math.sin(0.25 * j + shift + 0.01 * tick)) * s
        ])
      }
    }
    const cells = delaunay(points)

    const edges = []
    for (let i = 0; i < cells.length; ++i) {
      const c = cells[i]
      for (let j = 0; j < 3; ++j) {
        edges.push([c[j], c[(j + 1) % 3]])
      }
    }
    drawPoints({
      position: points,
      cells: edges
    })
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

    /*
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
    */

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
