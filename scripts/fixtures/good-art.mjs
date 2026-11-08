const blank = (w, h, ch) => ({ w, h, rows: Array.from({ length: h }, () => ch.repeat(w)) });
export default {
  sprites: {
    'shadow.base': blank(12, 3, '.'),
    'body.walk.d.0': blank(16, 24, '.'),
    'body.walk.d.1': blank(16, 24, 'L'),
    'head.d': blank(12, 11, '1'),
  },
  anims: {
    'body.walk.d': { id: 'body.walk.d', frames: ['body.walk.d.0', 'body.walk.d.1'], fps: 8, loop: true },
  },
  meta: {},
};
