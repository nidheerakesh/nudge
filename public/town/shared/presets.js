import { byId } from './catalog.js';

const P = (name, skin, hair, hair_color, outfit, accessory) => ({
  name,
  skin,
  hair,
  hair_color,
  outfit: 'outfit:' + outfit,
  accessory: accessory ? 'acc:' + accessory : null,
});

export const PRESETS = [
  P('Mochi', 1, 1, 1, 'casual', null),
  P('Sunny', 2, 2, 5, 'casual', null),
  P('Pepper', 3, 3, 2, 'casual', null),
  P('Nori', 4, 4, 2, 'casual', null),
  P('Clover', 5, 5, 1, 'casual', null),
  P('Ember', 2, 6, 3, 'casual', null),
  P('Cocoa', 6, 7, 2, 'hoodie', null),
  P('Pip', 1, 8, 4, 'sweater', null),
  P('Maple', 3, 1, 3, 'school', 'hairclip'),
  P('Bean', 4, 2, 2, 'overalls', 'cap'),
  P('Dot', 2, 3, 6, 'cozy', 'beanie'),
  P('Juno', 5, 4, 2, 'sports', 'headphones'),
  P('Coral', 1, 5, 4, 'summer', 'flowercrown'),
  P('Tango', 3, 6, 4, 'cute', 'hairbow'),
  P('Misty', 2, 7, 8, 'raincoat', 'glasses'),
  P('Luna', 1, 8, 7, 'pajamas', null),
  P('Frost', 2, 1, 5, 'winter', 'scarf'),
  P('Sage', 4, 2, 1, 'formal', 'glasses'),
  P('Kiku', 3, 3, 2, 'traditional', 'hairclip'),
  P('Trek', 5, 4, 1, 'explorer', 'backpack'),
  P('Fern', 2, 5, 5, 'festival', 'flowercrown'),
  P('Merlin', 1, 6, 7, 'wizard', 'hat'),
  P('Nova', 6, 7, 8, 'space', 'sunglasses'),
  P('Bun', 3, 8, 6, 'cute', 'bunnyears'),
];

const parts = (p) => [p.outfit, p.accessory].filter(Boolean);

export function missingParts(preset, owned) {
  const own = owned instanceof Set ? owned : new Set(owned || []);
  const need = [];
  let cost = 0;
  for (const id of parts(preset)) {
    const it = byId(id);
    if (!it || it.price === 0 || own.has(id)) continue;
    need.push(id);
    cost += it.price;
  }
  return { need, cost };
}
