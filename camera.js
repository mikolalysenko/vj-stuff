const mat4 = require('gl-mat4')

module.exports = function (regl) {
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

  const result = function (eye, center, body) {
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

  result.up = up

  return result
}
