const vd = require('voronoi-diagram')
const ch = require('convex-hull')
const vec3 = require('gl-vec3')

module.exports = function (sites) {
  var voronoi = vd(sites)

  var flatCells = []

  voronoi.cells.forEach(function (cell) {
    if (cell.indexOf(-1) >= 0) {
      return
    }

    var vpoints = cell.map(function (v) {
      return voronoi.positions[v]
    })

    var hull = ch(vpoints)

    // Find center of mass
    const center = [0, 0, 0]
    for (let i = 0; i < vpoints.length; ++i) {
      for (let j = 0; j < 3; ++j) {
        center[j] += vpoints[i][j]
      }
    }
    for (let j = 0; j < 3; ++j) {
      center[j] /= vpoints.length
    }

    const positions = []
    let maxLength = 0.0
    hull.forEach(function (f) {
      f.forEach(function (v, i) {
        const a = vpoints[v]
        const b = vpoints[f[(i + 1) % 3]]
        maxLength = Math.max(maxLength, vec3.distance(a, b))
        positions.push(vpoints[v])
      })
    })
    if (maxLength > 100.0) {
      return
    }

    flatCells.push({
      center,
      positions,
      normals: hull.map(function (f) {
        const p0 = vpoints[f[0]]
        const p1 = vpoints[f[1]]
        const p2 = vpoints[f[2]]
        const d01 = vec3.subtract([], p0, p1)
        const d02 = vec3.subtract([], p0, p2)
        const n = vec3.cross([], d01, d02)
        return vec3.normalize(n, n)
      })
    })
  })

  return flatCells
}
