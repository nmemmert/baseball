// Generated art: team crests and player portraits as inline SVG (no image assets).
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const SKIN = ['#f3cba3', '#e6b286', '#cd9367', '#aa7048', '#7d4e32', '#5b371f'];
const HAIR = ['#1b1410', '#3a2a1c', '#6b4423', '#a87b3a', '#bdbdbd', '#7a2b1b'];

export function crest(team, size = 30) {
  const h = hash(`${team.city}${team.nick}`), hue = h % 360, hue2 = (hue + 35 + ((h >>> 8) % 40)) % 360;
  const a = `hsl(${hue} 66% 48%)`, b = `hsl(${hue2} 62% 28%)`, id = `cr${h}`;
  const shape = ['shield', 'circle', 'hex', 'diamond'][(h >>> 4) % 4];
  const path = {
    shield: 'M20 2 L36 8 V20 C36 29 29 35 20 38 C11 35 4 29 4 20 V8 Z',
    circle: 'M20 2 a18 18 0 1 0 0.01 0 Z',
    hex: 'M20 2 L36 11 V29 L20 38 L4 29 V11 Z',
    diamond: 'M20 1 L38 20 L20 39 L2 20 Z',
  }[shape];
  const motif = (h >>> 10) % 3, letter = ((team.nick || '?')[0] || '?').toUpperCase();
  const deco = motif === 0 ? '<rect x="5" y="27" width="30" height="4" fill="#fff" fill-opacity=".85"/>'
    : motif === 1 ? '<path d="M20 5.5l2.2 4.6 5 .7-3.7 3.5.9 5-4.4-2.4-4.4 2.4.9-5-3.7-3.5 5-.7z" fill="#ffd166"/>'
      : '<path d="M8 28 L20 21 L32 28 V32 L20 25 L8 32 Z" fill="#fff" fill-opacity=".85"/>';
  const ly = motif === 1 ? 33 : motif === 0 ? 23 : 21;
  return `<svg class="crest" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <path d="${path}" fill="url(#${id})" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>${deco}
    <text x="20" y="${ly}" text-anchor="middle" font-size="${motif === 1 ? 12 : 15}" font-weight="900" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width=".9" paint-order="stroke" font-family="system-ui,sans-serif">${letter}</text></svg>`;
}

/** Player portrait. sport: 'bb' (cap) or 'fb' (helmet). col is the team colour. */
export function face(p, col = '#2b6cb0', size = 44, sport = 'bb') {
  const h = hash(p.uid || p.name), skin = SKIN[h % 6], hair = HAIR[(h >>> 3) % 6], id = `fc${h}${sport}`;
  const num = (h >>> 6) % 98 + 1, beard = (h >>> 11) % 5 === 0, brows = (h >>> 13) % 2;
  const head = `<ellipse cx="22" cy="22" rx="8.6" ry="10" fill="${skin}"/><circle cx="13.7" cy="23" r="2.1" fill="${skin}"/><circle cx="30.3" cy="23" r="2.1" fill="${skin}"/>`;
  const features = `<circle cx="18.4" cy="22" r="1.05" fill="#222"/><circle cx="25.6" cy="22" r="1.05" fill="#222"/>
    <path d="M16.6 19.6 q1.8 ${brows ? -1.4 : -0.6} 3.6 0 M23.8 19.6 q1.8 ${brows ? -1.4 : -0.6} 3.6 0" stroke="${hair}" stroke-width="1" fill="none"/>
    <path d="M19.4 27.4 q2.6 1.6 5.2 0" stroke="#7a3b2e" stroke-width="1" fill="none" stroke-linecap="round"/>${beard ? `<path d="M14 25 q8 11 16 0 q-2 6 -8 6 q-6 0 -8 -6z" fill="${hair}" fill-opacity=".85"/>` : ''}`;
  const jersey = `<path d="M3 44 C3 35 11 32 22 32 C33 32 41 35 41 44 Z" fill="${col}"/><path d="M17 32 q5 5 10 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-opacity=".9"/><text x="22" y="42.2" text-anchor="middle" font-size="6.5" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">${num}</text>`;
  const hat = sport === 'fb'
    ? `<path d="M10.5 24 C8.5 6 35.5 6 33.5 24 L31.5 27 H12.5 Z" fill="${col}"/><path d="M22 6.6 V16" stroke="#fff" stroke-width="2.2" stroke-opacity=".9"/><path d="M14 23.5 H30 M14.5 26.6 H29.5 M18.5 21.5 V30 M25.5 21.5 V30" stroke="#e9eef7" stroke-width="1.15" fill="none"/>`
    : `<path d="M12.3 18.6 C12.3 6.6 31.7 6.6 31.7 18.6 Z" fill="${col}"/><path d="M10.6 18.6 H33.4 Q22 22.8 10.6 18.6 Z" fill="${col}" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><circle cx="22" cy="12" r="2.2" fill="#fff" fill-opacity=".85"/>`;
  return `<svg class="face" viewBox="0 0 44 44" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="${id}" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient><clipPath id="${id}c"><circle cx="22" cy="22" r="21"/></clipPath></defs>
    <g clip-path="url(#${id}c)"><rect width="44" height="44" fill="${col}" fill-opacity=".35"/><rect width="44" height="44" fill="#0a1d3e" fill-opacity=".12"/>${jersey}<rect x="18.4" y="29" width="7.2" height="5" fill="${skin}"/>${head}${features}${hat}<rect width="44" height="44" fill="url(#${id})"/></g><circle cx="22" cy="22" r="20.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/></svg>`;
}
