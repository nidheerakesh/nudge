export const SKIN = 6;
export const HAIR_STYLES = 8;
export const HAIR_COLORS = 8;

const tier = (p) => (p === 0 ? 'free' : p <= 150 ? 'common' : p <= 300 ? 'uncommon' : p <= 600 ? 'rare' : p <= 900 ? 'epic' : 'legendary');

const GROUPS = {
  outfit: { casual: 0, hoodie: 100, sweater: 100, school: 150, overalls: 150, cozy: 200, sports: 200, summer: 200, cute: 250, raincoat: 250, pajamas: 250, winter: 300, formal: 400, traditional: 450, explorer: 500, festival: 600, wizard: 900, space: 1200 },
  acc: { hairclip: 60, cap: 80, beanie: 80, hairbow: 80, glasses: 100, beret: 120, scarf: 120, backpack: 150, hat: 150, sunglasses: 150, flowercrown: 250, headphones: 300, catears: 400, bunnyears: 500 },
  house: { hut: 0, small: 600, medium: 1500, large: 3500, manor: 8000 },
  roof: { red: 0, thatch: 100, blue: 150, purple: 200 },
  wall: { plaster: 0, wood: 120, brick: 180 },
  door: { wood: 0, green: 80, blue: 80, pink: 100 },
  floor: { wood: 0, light: 80, tile: 100, carpet: 120 },
  wallpaper: { cream: 0, pink: 80, flowers: 100, leaves: 100, checker: 100, stars: 150 },
  furn: { desk: 0, chair: 0, bed: 0, bookshelf: 150, rug: 80, plant: 60, lamp: 70, window: 100, poster: 60, petbed: 90, globe: 200, books: 50, clock: 100, candle: 60, stool: 60, beanbag: 120, cushion: 50, catplush: 90, chest: 150, stringlights: 120, frame: 70, guitar: 250, bigplant: 100, fishtank: 300 },
  food: { cookie: 10, onigiri: 15, fruit: 15, tea: 15, sandwich: 20, cupcake: 20, coffee: 20, icecream: 20, soup: 25, bubbletea: 25, pizza: 30, ramen: 40 },
};

const NAMES = { hairclip: 'Hair Clip', hairbow: 'Hair Bow', flowercrown: 'Flower Crown', catears: 'Cat Ears', bunnyears: 'Bunny Ears', petbed: 'Pet Bed', catplush: 'Cat Plush', stringlights: 'String Lights', bigplant: 'Big Plant', fishtank: 'Fish Tank', icecream: 'Ice Cream', bubbletea: 'Bubble Tea' };

const cap = (s) => NAMES[s] || s[0].toUpperCase() + s.slice(1);

export const ITEMS = [];
for (const kind of Object.keys(GROUPS)) {
  for (const k of Object.keys(GROUPS[kind])) {
    const price = GROUPS[kind][k];
    ITEMS.push({ id: kind + ':' + k, kind, name: cap(k), price, tier: tier(price) });
  }
}

const MAP = new Map(ITEMS.map((it) => [it.id, it]));

export const byId = (id) => MAP.get(id) || null;
export const isFree = (id) => {
  const it = MAP.get(id);
  return !!it && it.price === 0;
};
export const ids = (kind) => ITEMS.filter((it) => !kind || it.kind === kind).map((it) => it.id);
