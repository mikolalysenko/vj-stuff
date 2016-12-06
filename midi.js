const DECAY_TIME = 200.0
const ATTACK_TIME = 180.0
const SUSTAIN_TIME = 100.0

module.exports = function initMidi ({regl}) {
  const state = {
    buttons: Array(8).fill(0),
    knobs: Array(9).fill(0),
    ontap: () => {},
    tick,
    setup: regl({
      context: {
        buttons: regl.this('buttons'),
        knobs: regl.this('knobs')
      },
      uniforms: {
        'buttons[0]': regl.this('buttons[0]'),
        'buttons[1]': regl.this('buttons[1]'),
        'buttons[2]': regl.this('buttons[2]'),
        'buttons[3]': regl.this('buttons[3]'),
        'buttons[4]': regl.this('buttons[4]'),
        'buttons[5]': regl.this('buttons[5]'),
        'buttons[6]': regl.this('buttons[6]'),
        'buttons[7]': regl.this('buttons[7]'),

        'knobs[0]': regl.this('knobs[0]'),
        'knobs[1]': regl.this('knobs[1]'),
        'knobs[2]': regl.this('knobs[2]'),
        'knobs[3]': regl.this('knobs[3]'),
        'knobs[4]': regl.this('knobs[4]'),
        'knobs[5]': regl.this('knobs[5]'),
        'knobs[6]': regl.this('knobs[6]'),
        'knobs[7]': regl.this('knobs[7]'),
        'knobs[8]': regl.this('knobs[8]')
      }
    })
  }

  const buttonTime = Array(8).fill(Date.now())
  const buttonState = Array(8).fill(0)

  function tick () {
    const now = Date.now()
    for (let i = 0; i < 8; ++i) {
      const b = state.buttons[i]
      const s = buttonState[i]
      const t = now - buttonTime[i]
      if (s) {
        if (t < ATTACK_TIME) {
          state.buttons[i] = Math.min(1,
            b + t / ATTACK_TIME)
        } else {
          state.buttons[i] = Math.max(0.5, b - (t - ATTACK_TIME) / SUSTAIN_TIME)
        }
      } else {
        state.buttons[i] = Math.max(0, b - 0.5 * t / DECAY_TIME)
        buttonTime[i] = now
      }
    }
  }

  function handleMessage ({data}) {
    let id
    switch (data[0]) {
      case 144:
        // press
        id = data[1] - 36
        buttonTime[id] = Date.now()
        buttonState[id] = 1
        break
      case 128:
        // release
        id = data[1] - 36
        buttonTime[id] = Date.now()
        buttonState[id] = 0
        break
      case 176:
        // dial
        state.knobs[data[1] - 1] = data[2] / 127
        break
      case 192:
        // tap
        state.ontap(data[1])
        break
    }
  }

  function connect (midi) {
    function deviceChange () {
      midi.inputs.forEach((entry) => {
        if (entry.id === '1520147721') {
          entry.onmidimessage = handleMessage
        }
      })
    }

    midi.onstatechange = deviceChange
    deviceChange()
  }

  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(connect)
  }

  return state
}
