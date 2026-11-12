export const WORDS = ['fuck', 'shit', 'bitch', 'bastard', 'asshole', 'ass', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bullshit', 'motherfucker', 'retard', 'faggot', 'fag', 'nigger', 'nigga', 'dyke', 'twat', 'wanker', 'prick', 'piss', 'bollocks', 'crap', 'tits', 'cum', 'jizz', 'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'chutiye', 'gandu', 'gaandu', 'bhosdi', 'bhosdike', 'randi', 'harami', 'kutta', 'kutti', 'saala', 'saale', 'lauda', 'lund', 'gand', 'chod']

const SET = new Set(WORDS)
const SUF = ['', 's', 'es', 'ed', 'er', 'ers', 'ing']
const LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't' }

function norm(t) {
  return t.toLowerCase().replace(/[@!$013457]/g, (c) => LEET[c]).replace(/(.)\1{2,}/g, '$1')
}

function hit(t) {
  const k = norm(t)
  return SUF.some((f) => k.endsWith(f) && SET.has(k.slice(0, k.length - f.length)))
}

export function clean(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/[A-Za-z0-9@$!]+/g, (t) => {
    const core = t.replace(/^!+|!+$/g, '')
    if (!core || !hit(core)) return t
    const at = t.indexOf(core)
    return t.slice(0, at) + '*'.repeat(core.length) + t.slice(at + core.length)
  })
}

export function bad(s) {
  return clean(s) !== s
}
