const positions = []
const normals = []
const uvs = []

for (let d = 0; d < 3; ++d) {
  for (let s = -1; s <= 1; s += 2) {
    const u = (d + s + 3) % 3
    const v = (d - s + 3) % 3

    const x = [0, 0, 0]
    x[d] = s

    const points = []

    for (let du = -1; du <= 1; du += 2) {
      for (let dv = -1; dv <= 1; dv += 2) {
        x[u] = du
        x[v] = dv
        points.push(x.slice())
      }
    }

    positions.push(
      points[0],
      points[2],
      points[1],
      points[1],
      points[2],
      points[3])
    const normal = [0, 0, 0]
    normal[d] = s
    normals.push(
      normal,
      normal,
      normal,
      normal,
      normal,
      normal)
    uvs.push(
      [0, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [1, 0],
      [1, 1])
  }
}

module.exports = {
  positions,
  normals,
  uvs
}
