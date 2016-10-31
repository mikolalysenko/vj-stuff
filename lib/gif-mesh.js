const ndarray = require('ndarray')
const GifReader = require('omggif').GifReader
const generateMesh = require('greedy-mesher')({
  extraArgs: 1,
  order: [0, 1],
  append: function (lo_x, lo_y, hi_x, hi_y, val, mesh) {
    if (val) {
      mesh.positions.push(
        lo_x, lo_y,
        hi_x, lo_y,
        lo_x, hi_y,
        hi_x, lo_y,
        lo_x, hi_y,
        hi_x, hi_y)
      const r = val & 0xff
      const g = (val >> 8) & 0xff
      const b = (val >> 16) & 0xff
      mesh.colors.push(
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b,
        r, g, b)
      const c = mesh.count++
      mesh.ids.push(
        c,
        c,
        c,
        c,
        c,
        c)
    }
  }
})

module.exports = function convertGifToMesh (gifData) {
  const frames = []
  let reader = null
  try {
    reader = new GifReader(new Uint8Array(gifData))
  } catch (e) {
    return null
  }

  const w = reader.width
  const h = reader.height

  const data = new Uint8Array(w * h * 4)
  const ndata = ndarray(
    new Uint32Array(data.buffer),
    [w, h],
    [1, -w],
    w * h - 1)
  const mesh = {
    positions: [],
    colors: [],
    ids: [],
    count: 0
  }

  for (let i = 0; ; ++i) {
    for (let j = 0; j < data.length; ++j) {
      data[j] = 0
    }
    try {
      reader.decodeAndBlitFrameRGBA(i, data)
    } catch (err) {
      break
    }

    frames.push(mesh.positions.length / 2)
    generateMesh(ndata, mesh)
  }
  frames.push(mesh.positions.length / 2)

  return {
    position: new Uint16Array(mesh.positions),
    color: new Uint8Array(mesh.colors),
    id: new Uint16Array(mesh.ids),
    frames: frames
  }
}
