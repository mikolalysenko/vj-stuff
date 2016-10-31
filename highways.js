const glslify = require('glslify')
const icosphere = require('icosphere')(3)

module.exports = function (regl) {
  const commonShader = glslify`
    uniform float beats[16];
    uniform vec3 colors[5];
    uniform sampler2D pcm, freq, noiseTexture, prevPixels;
    uniform float time, volume, gamma, tempo;
    uniform vec3 eye;
    uniform mat4 projection, view, invProjection, invView;

    vec3 envMap (vec3 dir) {
      return mix(colors[0], colors[2], pow(texture2D(freq, vec2(0.1)).r, 4.0));
    }
  `

  let cameraPosition = [0, 0, 0]
  let targetCameraPosition = [0, 0, 10]

  const setupCamera = require('./camera')(regl)
  const drawBackground = require('./skybox')(regl, commonShader)

  const N = 128

  const drawLights = regl({
    frag: `
    precision highp float;
    ${commonShader}
    void main () {
      if (length(gl_PointCoord.xy - 0.5) > 0.5) {
        discard;
      }
      gl_FragColor = vec4(colors[4], 0.5);
    }
    `,

    vert: `
    precision highp float;
    ${commonShader}
    attribute float pointId;
    uniform vec3 offset, direction;

    vec3 position (float pointId) {
      return offset + direction * pointId;
    }

    void main () {
      vec3 p = position(pointId);

      vec3 d = p - eye;
      float zdist = d.z;
      d.z = 0.;
      p += 100. * pow(texture2D(freq, vec2(0.2)).r, 2.0) * normalize(d) * pow(length(d), 0.5);

      gl_PointSize = 4.0 * beats[0] + 8. + 8. * pow(cos(5.0 * time + 0.01 * pointId), 3.0);
      gl_Position = projection * view * vec4(p, 1);
    }`,

    attributes: {
      pointId: Array(N).fill().map((_, i) => i)
    },

    uniforms: {
      offset: regl.prop('offset'),
      direction: regl.prop('direction')
    },

    count: N,

    primitive: 'points'
  })

  const drawCube = regl({
    frag: `
    precision highp float;
    ${commonShader}
    void main () {
      gl_FragColor = (0.15 + 0.1 * cos(time) + beats[2]) * vec4(colors[1], 1);
    }
    `,

    vert: `
    precision highp float;
    ${commonShader}
    attribute vec3 position;
    uniform vec3 offset, scale;

    void main () {
      vec3 p = offset + position * scale;
      gl_Position = projection * view * vec4(p, 1);
    }`,

    attributes: {
      position: (() => {
        const points = []
        for (let d = 0; d < 3; ++d) {
          const u = (d + 1) % 3
          const v = (d + 2) % 3
          for (let s = -1; s <= 1; s += 2) {
            const f = []
            for (let dx = -1; dx <= 1; dx += 2) {
              for (let dy = -1; dy <= 1; dy += 2) {
                const p = [0, 0, 0]
                p[d] = s
                p[u] = dx
                p[v] = dy
                f.push(p)
              }
            }
            points.push(
              f[0], f[1], f[2],
              f[2], f[1], f[3])
          }
        }
        return points
      })()
    },

    uniforms: {
      offset: regl.prop('offset'),
      scale: regl.prop('scale')
    },

    blend: {
      enable: true,
      equation: 'add',
      func: {
        src: '1',
        dst: '1'
      }
    },

    depth: {
      mask: false
    },

    count: 36
  })

  const drawSphere = regl({
    frag: `
    precision highp float;
    ${commonShader}
    varying vec3 normal;
    void main () {
      gl_FragColor = vec4(
        mix(
          colors[0],
          colors[3],
          normal.y - 0.3 * normal.z),
          1);
    }
    `,

    vert: `
    precision highp float;
    ${commonShader}
    attribute vec3 position;
    uniform vec3 offset;
    varying vec3 normal;

    void main () {
      vec3 p = offset + position * 100.;
      normal = normalize(position);
      gl_Position = projection * view * vec4(p, 1);
    }`,

    attributes: {
      position: icosphere.positions
    },

    uniforms: {
      offset: regl.prop('offset')
    },

    elements: icosphere.cells
  })

  const highways = []

  for (let i = 0; i < 1000; ++i) {
    const direction = [0, 0, 0]
    direction[(Math.random() * 3) | 0] =
      Math.random() < 0.5 ? -50 : 50
    highways.push({
      offset: [
        3000 * Math.round(Math.random() * 10 - 5),
        2000 * Math.round(Math.random() * 10 - 5),
        2000 * Math.round(Math.random() * 10)
      ],
      direction
    })
  }

  const cubes = []

  for (let i = 0; i < 100; ++i) {
    cubes.push({
      offset: [
        2000 * Math.round(Math.random() * 10 - 5),
        2000 * Math.round(Math.random() * 10 - 5),
        2000 * Math.round(Math.random() * 10)
      ],
      scale: [
        10 * Math.round(Math.random() * 100) + 2,
        10 * Math.round(Math.random() * 100) + 2,
        10 * Math.round(Math.random() * 100) + 2
      ]
    })
  }

  const spheres = []

  for (let i = 0; i < 50; ++i) {
    const p = [
      800 * Math.round(Math.random() * 10 - 5) + 400,
      800 * Math.round(Math.random() * 10 - 5) + 400,
      2000 * Math.round(Math.random() * 10)
    ]
    spheres.push({
      offset: p,
      target: p.slice()
    })
  }

  const CAMERA_SPEED = 20

  function scene ({freq, tick}) {
    drawLights(highways)
    drawCube(cubes)
    drawSphere(spheres)

    for (let i = 0; i < highways.length; ++i) {
      const h = highways[i]
      if (Math.max(
        h.offset[2],
        h.offset[2] + N * h.direction[2]) < cameraPosition[2]) {
        h.offset = [
          3000 * Math.round(Math.random() * 10 - 5),
          2000 * Math.round(Math.random() * 10 - 5),
          Math.floor(cameraPosition[2]) + 20000 + 2000 * Math.round(Math.random() * 10)
        ]
        const direction = [0, 0, 0]
        direction[(Math.random() * 3) | 0] =
          Math.random() < 0.5 ? -50 : 50
        h.direction = direction
      }
    }

    for (let i = 0; i < cubes.length; ++i) {
      const c = cubes[i]
      if (Math.max(
        c.offset[2],
        c.offset[2] + c.scale[2]) < cameraPosition[2]) {
        c.offset = [
          2000 * Math.round(Math.random() * 10 - 5),
          2000 * Math.round(Math.random() * 10 - 5),
          Math.round(cameraPosition[2]) + 1000 + 2000 * Math.round(Math.random() * 10)
        ]
        c.scale = [
          10 * Math.round(Math.random() * 100) + 2,
          10 * Math.round(Math.random() * 100) + 2,
          10 * Math.round(Math.random() * 100) + 2
        ]
      }
    }

    for (let i = 0; i < spheres.length; ++i) {
      const s = spheres[i]

      let dist = 0.0
      for (let d = 0; d < 3; ++d) {
        const x = s.offset[d] - s.target[d]
        dist += Math.abs(x)
        if (x < 0) {
          s.offset[d] += 3 * CAMERA_SPEED
        } else if (x > 0) {
          s.offset[d] -= 3 * CAMERA_SPEED
        }
      }

      if (s.offset[2] < cameraPosition[2]) {
        s.target[2] += 4000
        s.target[0] = s.offset[0]
        s.target[1] = s.offset[1]
      } else if (dist < 6.0 * CAMERA_SPEED) {
        const d = Math.floor(Math.random() * 3)
        s.target[d] +=
          Math.random() < 0.5
          - 0.0001 * (s.offset[d] - cameraPosition[d]) ? 1000 : -1000
      }
    }
  }

  let lastSide = true

  function forward (context) {
    let cameraOffset = [0, 0, 10]

    setupCamera(
      cameraPosition,
      [
        cameraOffset[0] + cameraPosition[0],
        cameraOffset[1] + cameraPosition[1],
        cameraOffset[2] + cameraPosition[2]],
      () => {
        regl.clear({depth: 1})
        drawBackground()
        scene(context)
      })

    let allEqual = true
    const speed = CAMERA_SPEED + context.beats[0] * 30
    for (let i = 0; i < 3; ++i) {
      if (cameraPosition[i] < targetCameraPosition[i]) {
        cameraPosition[i] += speed
      } else if (cameraPosition[i] > targetCameraPosition[i]) {
        cameraPosition[i] -= speed
      }
      allEqual = allEqual && Math.abs(cameraPosition[i] - targetCameraPosition[i]) < 2 * speed
    }

    if (context.beats[3] || allEqual) {
      if (lastSide || Math.random() < 0.9) {
        targetCameraPosition[2] += 40
        lastSide = false
      } else if (Math.random() < 0.5) {
        if (cameraPosition[1] > 150) {
          targetCameraPosition[1] -= 120
        } else if (cameraPosition[1] < -150) {
          targetCameraPosition[1] += 120
        } else {
          targetCameraPosition[1] += 40 * Math.round((Math.random() - 0.5) * 10)
        }
        lastSide = true
      } else {
        if (cameraPosition[0] > 150) {
          targetCameraPosition[0] -= 120
        } else if (cameraPosition[0] < -150) {
          targetCameraPosition[0] += 120
        } else {
          targetCameraPosition[0] += 40 * Math.round((Math.random() - 0.5) * 10)
        }
        lastSide = true
      }
    }
  }

  const drawPost = regl({
    frag: glslify`
    precision mediump float;
    varying vec2 uv;

    ${commonShader}

    uniform sampler2D pixels[2];
    uniform vec2 resolution;

    void main () {
      vec3 color = vec3(0);
      float blur = 8.0 * texture2D(freq, vec2(0.05)).r;
      for (int i = -2; i <= 2; ++i) {
        for (int j = -2; j <= 2; ++j) {
          color += 0.25 * texture2D(pixels[1], uv + blur * vec2(i, j) / resolution).rgb / (1.0 + length(vec2(i, j)));
        }
      }

      gl_FragColor = vec4(
        pow(color, vec3(1.0 / gamma)), 1);
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
