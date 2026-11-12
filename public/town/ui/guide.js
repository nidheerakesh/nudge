const SECTIONS = [
  ['Welcome', [
    'Nudge Town is a shared study village. You earn coins by studying, then spend them on clothes, furniture and food, and you can visit other students’ houses.',
    'Walk with the arrow keys or by tapping. The Map button shows the districts, and Open full map shows every plot in detail.',
  ]],
  ['1. Study to earn coins', [
    'Start a timer on the Focus tab, or tap Start a focus timer inside the Library. Press Done when you finish.',
    'You earn 1 coin per verified focused minute. A session must have at least 5 verified minutes, and you can earn up to 240 coins a day.',
    'Every 10 to 16 minutes (sooner in the first stretch) a Still here? check appears. Answer within 90 seconds. Missing a check means that stretch does not count, and missing two in a row stops the session paying.',
    'Paused time does not count, and only one timer can run at a time.',
  ]],
  ['2. The Library', [
    'Walk to the Library door to go in and sit at a chair. The Study board lists focus minutes today for people who opted in.',
    'Use the emote buttons to wave to others. Tap Leave or the exit to go back to the street.',
  ]],
  ['3. Dress your character', [
    'The Boutique sells hair, outfits and accessories. Walk to its door to shop.',
    'Open Wardrobe to change your look. Things you own can be worn any time.',
  ]],
  ['4. Build your house', [
    'You get a plot when you join. Tap House to open the editor.',
    'Every house starts at a roomy 10x7 inside. The builder counter in the Home Store sells Large and Manor sizes with more room.',
    'Houses sit inside a fenced plot. Only the owner\u2019s door and the knock tile are open, so nobody walks through other people\u2019s yards.',
    'Style: pick roof, walls, door, floor and wallpaper, name your house, and set the door (see below). Press Save.',
    'Furnish: buy furniture at the Home Store first. In the editor choose a piece from the tray, then tap a tile to place it. Tap a placed piece to Move, Flip or Delete it. You can place up to 40 pieces and need to keep the doorway clear. Press Save, then Done.',
    'Location: House > Location, or Map > Open full map, shows every plot in every district. Tap a free green plot and press Move my house here. Your furniture and style move with you.',
    'Walk to your own door to go inside and see it. Tap a bed to climb in and sleep (zzz). Move or tap anywhere to wake up.',
  ]],
  ['5. Door settings', [
    'Knock: visitors knock and you choose whether to let them in. Open: anyone can walk in. Closed: nobody can enter.',
    'In your house you can mute or kick a visitor from the chat panel.',
  ]],
  ['6. Visit friends', [
    'Walk to another house and go to its door to knock. If the owner accepts (or the door is open), you go in and can chat.',
    'You can block or report someone from the chat. Blocking removes them from your house right away.',
  ]],
  ['7. Bakery and food', [
    'Buy snacks at the Bakery and eat them from your pantry. Being fed shows a small icon above your character for 2 hours. It is just for fun.',
  ]],
  ['8. Privacy', [
    'Tap Settings to hide yourself from the town, share or hide your study stats and subject, change your door, and manage blocked people.',
    'Hidden players cannot be seen or knocked on.',
  ]],
];

export function openGuide(ctx) {
  const { h } = ctx.ui;
  const body = h('div', { class: 'col', style: { maxHeight: '65vh', overflowY: 'auto', gap: '14px' } },
    ...SECTIONS.map(([t, ps]) => h('section', { class: 'col' }, h('h3', { style: { margin: '0' } }, t), ...ps.map((p) => h('p', { style: { margin: '0' } }, p)))));
  return ctx.ui.sheet('Town guide', h('div', { class: 'k-panel col', style: { padding: '12px' } }, body));
}
