import { GLOBAL, OUTLINE, WHITE } from '../art/palette.js';

export const ICONS = {
  coin: [
    '....OOOO....',
    '..OOvaaaOO..',
    '.OaWWaaaaaO.',
    '.OaWaccaaaO.',
    'OaaaacaaaaaO',
    'OaaaacaaaaaO',
    'OaaaacaaaadO',
    'OaaaaccaaadO',
    '.OaaaaaaadO.',
    '.OdaaaaaddO.',
    '..OOdddddO..',
    '....OOOO....',
  ].map((r) => r.replace('v', 'a')),
  gem: [
    '............',
    '...OOOOOO...',
    '..OmWnnnpO..',
    '.OmWnnnnppO.',
    'OOOOOOOOOOOO',
    'OnWnnnnnnppO',
    '.OnWnnnnppO.',
    '..OnnnnnpO..',
    '...OnnnppO..',
    '....OnnpO...',
    '.....OpO....',
    '......O.....',
  ],
  map: [
    '............',
    '.OOOOOOOOOO.',
    'OgOaaOaaOhhO',
    'OgiOaOaOhhhO',
    'OgOaaOaaOhhO',
    'OiOaaOauOhhO',
    'OgOaaOauuOhO',
    'OgOaaOaaOhhO',
    'OiOaaOaaOhhO',
    '.OOOOOOOOOO.',
    '............',
    '............',
  ],
  chat: [
    '............',
    '.OOOOOOOOOO.',
    'OWWWWWWWWWWO',
    'OWWWWWWWWWWO',
    'OWWOWWOWWOWO',
    'OWWWWWWWWWWO',
    'OWWWWWWWWWWO',
    '.OOOOWWOOOO.',
    '....OWWO....',
    '.....OWO....',
    '......O.....',
    '............',
  ],
  shirt: [
    '............',
    '..OO....OO..',
    '.OnnOOOOnnO.',
    'OnnnnOOnnnnO',
    'OnnnnnnnnnnO',
    '.OOnnnnnnOO.',
    '...OnnnnnO..',
    '...OnnpnnO..',
    '...OnnnnnO..',
    '...OnnnnpO..',
    '...OOOOOOO..',
    '............',
  ],
  house: [
    '.....OO.....',
    '....OppO....',
    '...OppppO...',
    '..OppppppO..',
    '.OppppppppO.',
    'OOOOOOOOOOOO',
    '.OaaaaaaaaO.',
    '.OaaOOaauuO.',
    '.OaaOcaauuO.',
    '.OaaOccaaaO.',
    '.OOOOOOOOOO.',
    '............',
  ],
  gear: [
    '....OOOO....',
    '.OO.OttO.OO.',
    'OtuOOttOOutO',
    '.OttttttttO.',
    '..OtuOOutO..',
    'OOtt....ttOO',
    'OttO....OttO',
    'OOtt....ttOO',
    '..OtuOOutO..',
    '.OttttttttO.',
    'OuOOOttOOOuO',
    '.O..OOOO..O.',
  ],
  heart: [
    '............',
    '..OOO..OOO..',
    '.OnWnOOnnnO.',
    'OnWnnnnnnnpO',
    'OnnnnnnnnnpO',
    'OnnnnnnnnppO',
    '.OnnnnnnnpO.',
    '..OnnnnnpO..',
    '...OnnnpO...',
    '....OnpO....',
    '.....OO.....',
    '............',
  ],
  party: [
    '.......O..O.',
    '..O...O.O...',
    '......OaaO.O',
    '.....OaaO...',
    '....OoaaO...',
    '...OonOO.O..',
    '..OonnaO....',
    '..OonoO.....',
    '.OonnaO.....',
    '.OonoO......',
    'OOOOO.......',
    '............',
  ],
  close: [
    '............',
    '.OO......OO.',
    '.OpO....OpO.',
    '..OpO..OpO..',
    '...OpOOpO...',
    '....OppO....',
    '....OppO....',
    '...OpOOpO...',
    '..OpO..OpO..',
    '.OpO....OpO.',
    '.OO......OO.',
    '............',
  ],
  more: [
    '............',
    '............',
    '............',
    '.OOO.OOO.OOO',
    'OeeeOeeeOeeO',
    'OeeeOeeeOeeO',
    '.OOO.OOO.OOO',
    '............',
    '............',
    '............',
    '............',
    '............',
  ].map((r) => r.slice(0, 12).padEnd(12, '.')),
  send: [
    '............',
    '..........O.',
    '........OOu.',
    '......OOWOu.',
    '....OOWWWOu.',
    '..OOWWWWWOu.',
    'OOWWWWWOOOu.',
    '.OOOOWWOtOu.',
    '....OOWOOu..',
    '.....OOOu...',
    '............',
    '............',
  ],
  play: [
    '............',
    '..OO........',
    '..OhOO......',
    '..OhhhOO....',
    '..OhhhhhOO..',
    '..OhhhhhhhO.',
    '..OhhhhiOO..',
    '..OhhiOO....',
    '..OiOO......',
    '..OO........',
    '............',
    '............',
  ],
  pause: [
    '............',
    '.OOOO..OOOO.',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OuuvO.OuuvO',
    '.OOOOO.OOOOO',
    '............',
    '............',
  ].map((r) => r.slice(0, 12)),
  bell: [
    '.....OO.....',
    '....OaaO....',
    '...OaWaaO...',
    '..OaWaaaaO..',
    '..OaWaaaadO.',
    '..OaaaaaadO.',
    '.OaaaaaaaadO',
    '.OaaaaaaaadO',
    'OOOOOOOOOOOO',
    '....OddO....',
    '.....OO.....',
    '............',
  ],
  cake: [
    '.....O......',
    '....OaO.....',
    '....OnO.....',
    '..OOOOOOOO..',
    '.OWWmWWmWWO.',
    '.OOOOOOOOOO.',
    '.OaaaaaaaaO.',
    '.OaaoaaoaaO.',
    '.OaaaaaaaaO.',
    '.OccccccccO.',
    '.OOOOOOOOOO.',
    '............',
  ],
};

for (const k of Object.keys(ICONS)) ICONS[k] = ICONS[k].map((r) => r.slice(0, 12).padEnd(12, '.'));

export function iconRows(name) {
  return ICONS[name] || null;
}

function colour(ch) {
  if (ch === 'O') return OUTLINE;
  if (ch === 'W') return WHITE;
  return GLOBAL[ch] || null;
}

export function kicon(name, size = 24) {
  const cv = document.createElement('canvas');
  cv.width = 12;
  cv.height = 12;
  cv.style.cssText = 'width:' + size + 'px;height:' + size + 'px;image-rendering:pixelated;flex:none';
  cv.setAttribute('aria-hidden', 'true');
  const rows = ICONS[name];
  if (!rows) return cv;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const c = colour(row[x]);
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}
