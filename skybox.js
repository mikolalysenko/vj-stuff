module.exports = function (regl, commonShader) {
  return regl({
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
}
