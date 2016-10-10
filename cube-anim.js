module.exports = function ({
  set,
  snap,
  move,
  forEach,
  N
}) {
  var events = []
  var eventPtr = 0

  function sandPileIn () {
    const height = Array(N).fill().map(() => Array(N).fill(0))

    const e0 = []
    forEach((i, j, k) => {
      e0.push(
        i, j, k,
        i, j + 20, k)
    })
    e0.snap = true
    events.push(e0, [], [], [], [], [])
    let counter = 0
    while (counter < N * N * N) {
      const x = Math.floor(Math.random() * N)
      const y = Math.floor(Math.random() * N)

      if (height[x][y] < N) {
        events.push([
          x, height[x][y], y,
          x, height[x][y], y
        ])
        height[x][y] += 1
        counter += 1
      }
    }
  }

  function sandPileOut () {
    const height = Array(N).fill().map(() => Array(N).fill(0))

    let counter = 0
    while (counter < N * N * N) {
      const x = Math.floor(Math.random() * N)
      const y = Math.floor(Math.random() * N)

      if (height[x][y] < N) {
        events.push([
          x, height[x][y], y,
          x, -20, y
        ])
        height[x][y] += 1
        counter += 1
      }
    }
  }

  function sandPileAnim () {
    sandPileOut()
    sandPileIn()
  }

  function polyominoes () {
    const cut = Array(N * N * N).fill(false)
    const poly = []

    function offset (i, j, k) {
      return i + j * N + k * N * N
    }

    forEach((i, j, k) => {
      if (cut[offset(i, j, k)]) {
        return
      }

      const queue = [[i, j, k]]
      cut[offset(i, j, k)] = true
      let ptr = 0
      while (queue.length < 5 && ptr < queue.length) {
        const x = queue[ptr++]

        for (let n = 0; n < 4; ++n) {
          const y = x.slice()
          y[(Math.random() * 3) | 0] +=
            Math.random() < 0.5 ? -1 : 1
          var inBounds = true
          for (let d = 0; d < 3; ++d) {
            if (y[d] < 0 || y[d] >= N) {
              inBounds = false
              break
            }
          }
          if (!inBounds) {
            continue
          }
          const o = offset(y[0], y[1], y[2])
          if (!cut[o]) {
            cut[o] = true
            queue.push(y)
          }
        }
      }
      poly.push(queue)
    })

    for (let i = 0; i < poly.length; ++i) {
      const swap = (Math.random() * (i + 1)) | 0
      const t = poly[swap]
      poly[swap] = poly[i]
      poly[i] = t
    }

    return poly
  }

  function polyIn () {
    const polys = polyominoes()

    const e0 = []
    events.push(e0)

    polys.forEach((poly) => {
      const event = []

      const delta = [0, 0, 0]
      delta[(Math.random() * 3) | 0] =
        (Math.random() < 0.5) ? -(N + 1) : (N + 1)

      poly.forEach((p) => {
        const i = p[0]
        const j = p[1]
        const k = p[2]

        e0.push(
          i, j, k,
          i + delta[0],
          j + delta[1],
          k + delta[2])

        event.push(
          i, j, k,
          i, j, k)
      })

      events.push(event)
    })
  }

  function polyOut () {
    const polys = polyominoes()

    polys.forEach((poly) => {
      const event = []

      const delta = [0, 0, 0]
      delta[(Math.random() * 3) | 0] =
        (Math.random() < 0.5) ? -(N + 1) : (N + 1)

      poly.forEach((p) => {
        const i = p[0]
        const j = p[1]
        const k = p[2]

        event.push(i, j, k,
          i + delta[0],
          j + delta[1],
          k + delta[2])
      })

      events.push(event)
    })
  }

  function explodeAnim () {
    const event0 = []
    const event1 = []
    forEach((i, j, k) => {
      move(i, j, k,
        N / 2, N / 2, N / 2)
      event0.push(
        i, j, k,
        3 * (i - N / 2) + N,
        3 * (j - N / 2) + N,
        3 * (k - N / 2) + N)
      event1.push(
        i, j, k,
        i,
        j,
        k)
    })
    events.push(
      [], [], [], [], [],
      [], [], [], [], [],
      [], [], [], [], [],
      event0,
      [], [], [], [], [], [],
      [], [], [], [], [], [],
      [], [], [], [], [], [],
      [], [], [], [], [], [],
      [], [], [], [], [], [],
      event1,
      [], [], [],
      [], [], [], [], [], [],
      [], [], [], [], [], [])
  }

  function polyAnim () {
    polyIn()
    events.push([])
    polyOut()
  }

  function sliceAnim () {
    for (let i = N - 1; i >= 0; --i) {
      const e = []
      for (let j = 0; j < N; ++j) {
        for (let k = 0; k < N; ++k) {
          e.push(i, j, k,
            2 * i, j, k)
        }
      }
      events.push(e)
    }

    for (let j = N - 1; j >= 0; --j) {
      const e = []
      for (let i = 0; i < N; ++i) {
        for (let k = 0; k < N; ++k) {
          e.push(i, j, k,
            2 * i, 2 * j, k)
        }
      }
      events.push(e)
    }

    for (let k = N - 1; k >= 0; --k) {
      const e = []
      for (let i = 0; i < N; ++i) {
        for (let j = 0; j < N; ++j) {
          e.push(i, j, k,
            2 * i,
            2 * j,
            2 * k)
        }
      }
      events.push(e)
    }

    for (let i = 0; i < N; ++i) {
      const e = []
      for (let j = 0; j < N; ++j) {
        for (let k = 0; k < N; ++k) {
          e.push(i, j, k,
            i, 2 * j, 2 * k)
        }
      }
      events.push(e)
    }

    for (let j = 0; j < N; ++j) {
      const e = []
      for (let i = 0; i < N; ++i) {
        for (let k = 0; k < N; ++k) {
          e.push(i, j, k,
            i, j, 2 * k)
        }
      }
      events.push(e)
    }

    for (let k = 0; k < N; ++k) {
      const e = []
      for (let i = 0; i < N; ++i) {
        for (let j = 0; j < N; ++j) {
          e.push(i, j, k,
            i, j, k)
        }
      }
      events.push(e)
    }
  }

  function shuffleAnim () {
    const polys = polyominoes()
    const positions = polys.map(() => [0, 0, 0])

    function applyPos () {
      const e = []
      polys.forEach((poly, n) => {
        const p = positions[n]
        poly.forEach(([i, j, k]) => {
          e.push(i, j, k,
            i + p[0],
            j + p[1],
            k + p[2])
        })
      })
      events.push(e)
    }

    applyPos()

    for (let i = 0; i < 40; ++i) {
      positions.forEach((pos) => {
        pos[(3 * Math.random()) | 0] += ((Math.random() - 0.5) * 10) | 0
      })
      applyPos()
    }

    for (let i = 0; i < 3; ++i) {
      positions.forEach((pos) => {
        const d = (Math.random() * 3) | 0
        pos[d] = 0
      })
      applyPos()
    }

    positions.forEach((pos) => pos[0] = pos[1] = pos[2] = 0)
    applyPos()
  }

  function screenAnim () {
    const e = []
    forEach((i, j, k) => {
      e.push(
        i, j, k,
        i + 4 * (k % 2), j + 4 * Math.floor(k / 2), 0)
    })
    events.push(e, [], [], [], [])
  }

  function octAnim () {
    let e = []
    forEach((i, j, k) => {
      const ei = Math.floor(i / 2)
      const ej = Math.floor(j / 2)
      const ek = Math.floor(k / 2)

      e.push(i, j, k,
        4 * ei + (i % 2) - 2,
        4 * ej + (j % 2) - 2,
        4 * ek + (k % 2) - 2)
    })
    events.push(e)
    for (let i = 0; i < 10; ++i) {
      events.push([])
    }
    e = []
    forEach((i, j, k) => {
      e.push(i, j, k,
        8 * i - 8,
        8 * j - 8,
        8 * k - 8)
    })
    events.push(e)
    for (let i = 0; i < 10; ++i) {
      events.push([])
    }
  }

  function anim () {
    events.length = 0
    eventPtr = 0
    if (Math.random() < 0.25) {
      octAnim()
    } else if (Math.random() < 0.1) {
      screenAnim()
    } else if (Math.random() < 0.25) {
      shuffleAnim()
    } else if (Math.random() < 0.5) {
      polyOut()
      events.push([], [], [], [], [])
      while (Math.random() < 0.9) {
        polyAnim()
      }
      polyIn()
    } else if (Math.random() < 0.5) {
      sliceAnim()
      while (Math.random() < 0.6) {
        sliceAnim()
      }
    } else if (Math.random() < 0.5) {
      explodeAnim()
    } else {
      sandPileAnim()
    }
  }

  function next () {
    if (eventPtr >= events.length) {
      anim()
    } else {
      const p = events[eventPtr++]
      for (var x = 0; x < p.length; x += 6) {
        if (p.snap) {
          set(
            p[x + 0], p[x + 1], p[x + 2],
            p[x + 3], p[x + 4], p[x + 5])
        } else {
          move(
            p[x + 0], p[x + 1], p[x + 2],
            p[x + 3], p[x + 4], p[x + 5])
        }
      }
    }
  }

  forEach((i, j, k) => {
    set(i, j, k, i, j, k)
  })

  return {
    init: anim,
    next
  }
}
