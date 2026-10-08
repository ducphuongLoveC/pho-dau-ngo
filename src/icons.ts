export const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    bowl: '<path d="M3 11h18c-1 6-4 9-9 9s-8-3-9-9Z"/><path d="M8 7c-3-3 3-3 0-6m7 6c-3-3 3-3 0-6M7 21h10"/>',
    leaf: '<path d="M20 3C8 2 2 8 5 15s14 6 15-12Z"/><path d="m4 21 11-12"/>',
    wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 11h6v6h-6zM18 14h1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    book: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
    shop: '<path d="m4 3-2 6c0 3 4 3 5 0 1 3 5 3 5 0 1 3 5 3 5 0 1 3 5 3 5 0l-2-6ZM4 12v9h16v-9M9 21v-7h6v7"/>',
    sound: '<path d="m11 4-5 4H2v8h4l5 4ZM15 8c3 2 3 6 0 8m3-12c5 4 5 12 0 16"/>',
    mute: '<path d="m11 4-5 4H2v8h4l5 4Zm5 5 6 6m0-6-6 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3h.01"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m7 3 14 9-14 9Z"/>',
    check: '<path d="m5 12 4 4L20 5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    bag: '<path d="M5 7h14l2 14H3ZM8 8V6a4 4 0 0 1 8 0v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    flame: '<path d="M13 2c2 8-5 7-2 12 2-1 3-3 3-5 9 8 4 14-2 13C3 22 2 12 8 8c-1 4 1 5 2 4-3-5 2-6 3-10Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    save: '<path d="M20 11v9H4V4h11M8 4v6h7M8 20v-6h8v6m1-17 2 2 4-4"/>',
    heart: '<path d="M12 21 3 12C-3 4 7-1 12 6 17-1 27 4 21 12Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
    sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
    people: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3m0-18a4 4 0 0 1 0 8m3 4a5 5 0 0 1 3 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bowl}</svg>`;
};

export function ingredientArt(id: string) {
  const art: Record<string, string> = {
    quay: '<ellipse cx="40" cy="53" rx="33" ry="10" fill="#eee9d9" stroke="#547488" stroke-width="2"/><g fill="#dfa64f" stroke="#946131" stroke-width="1.5"><rect x="17" y="13" width="17" height="44" rx="8" transform="rotate(-15 25 35)"/><rect x="41" y="11" width="17" height="45" rx="8" transform="rotate(12 49 34)"/></g><path d="m22 20 9 31m20-33-7 31" stroke="#f8d785" stroke-width="3" stroke-linecap="round"/>',
    noodle: '<ellipse cx="40" cy="51" rx="30" ry="9" fill="#d8c9ac"/><g fill="none" stroke="#fff9e8" stroke-width="5" stroke-linecap="round"><path d="M14 43c5-20 10 13 16-7s11 16 16-7 14 17 18 4"/><path d="M15 49c7-21 13 14 19-7s12 11 16-4 14 18 17 3"/><path d="M19 34c6-16 10 11 15-6s11 11 16-5 10 9 13 4"/></g>',
    tai: '<g stroke="#a96758" stroke-width="1.5"><path d="M12 42c1-13 25-24 36-19s8 13 0 21-38 14-36-2Z" fill="#d99d92"/><path d="M26 47c-2-11 20-24 31-20s15 12 7 20-36 14-38 0Z" fill="#e5afa0"/></g><g stroke="#f9d9c6" stroke-width="3" fill="none"><path d="m24 34 17 7m-9-12 17 8m-11 5 17 6m-5-15 11 5"/></g>',
    chin: '<g fill="#a07857" stroke="#71583f" stroke-width="1.5"><path d="m10 36 25-14 24 10-23 17Z"/><path d="m18 44 26-15 24 10-23 17Z"/><path d="m27 51 25-15 20 10-22 13Z"/></g><g stroke="#d7b990" stroke-width="2"><path d="m24 31 21 9m-12-4 19 9m-7-1 16 7"/></g>',
    broth: '<path d="M14 29h50v22c0 13-50 13-50 0Z" fill="#b7c4b9" stroke="#627268" stroke-width="2"/><ellipse cx="39" cy="30" rx="25" ry="10" fill="#d6aa58" stroke="#627268" stroke-width="2"/><path d="M29 21c-10-10 10-8 0-18m15 18c-10-10 10-8 0-18" fill="none" stroke="#a3a393" stroke-width="2" stroke-linecap="round"/>',
    scallion: '<g stroke="#6d8b4e" stroke-width="6" stroke-linecap="round"><path d="m21 49 29-30m-20 34 28-29m-17 32 23-25"/></g><g stroke="#ebedc9" stroke-width="6" stroke-linecap="round"><path d="m15 55 11-11m-1 13 9-10m2 13 8-10"/></g><g fill="#94ac66" stroke="#607748" stroke-width="1.5"><ellipse cx="18" cy="24" rx="6" ry="4"/><ellipse cx="28" cy="18" rx="5" ry="4"/><ellipse cx="17" cy="34" rx="5" ry="3"/></g>',
    onion: '<g fill="#f3f0da" stroke="#c9bdab" stroke-width="2"><path d="M14 43c0-33 48-33 48 0Z"/><path d="M24 49c0-29 43-29 43 0Z"/><path d="M16 43c1-23 43-25 44 0M26 49c2-19 37-21 39 0M24 43c2-15 27-15 29 0M34 49c1-12 23-12 25 0" fill="none"/></g>',
    herbs: '<g stroke="#527446" stroke-width="2" fill="#7e9b61"><path d="m38 58 4-40m-3 28L21 32m20 6 16-14" fill="none"/><path d="M40 37c-20 1-26-10-23-20 15 0 24 8 23 20Z"/><path d="M42 29c-11-9-11-20-1-27 11 8 11 19 1 27Z"/><path d="M43 43c-3-19 7-28 23-26 0 15-9 24-23 26Z"/><path d="M37 53c-19 1-27-8-23-18 14-2 23 5 23 18Z"/></g>',
    chili: '<path d="M56 17C59 51 26 61 12 52c24-2 27-23 31-32Z" fill="#c66645" stroke="#8b4f38" stroke-width="2"/><path d="M44 20c0-4 6-6 11-2l6-10" fill="none" stroke="#628350" stroke-width="4" stroke-linecap="round"/><path d="M46 29c-3 9-8 15-14 18" stroke="#e2a17e" stroke-width="3" stroke-linecap="round" fill="none"/>',
    lime: '<path d="M12 41a27 27 0 0 1 54 0Z" fill="#9caf61" stroke="#647b40" stroke-width="2"/><path d="M17 39a22 22 0 0 1 44 0Z" fill="#e8e7a5"/><path d="m39 39-17-8m17 8-8-19m8 19V17m0 22 10-19m-10 19 18-10" stroke="#f9f6d4" stroke-width="2"/>',
    sauce: '<path d="M31 19h18l5 12v25c0 7-28 7-28 0V31Z" fill="#ad623f" stroke="#73553e" stroke-width="2"/><path d="M31 17h18v7H31Z" fill="#6b7d51"/><path d="M36 17V6h8v11" fill="#d6b37a" stroke="#73553e" stroke-width="2"/><rect x="28" y="36" width="24" height="15" rx="2" fill="#e8d3a9"/><path d="m36 44 4-4 4 4-4 4Z" fill="#ae6146"/>',
  };
  return `<svg viewBox="0 0 80 68" fill="none" aria-hidden="true">${art[id] || art.broth}</svg>`;
}

export function avatarArt(n: number, large = false) {
  const i = Math.abs(Number(n) || 0) % 6;
  const shirts = ['#b47b57', '#789185', '#bca268', '#888da1', '#9a7c84', '#78976a'];
  const backs = ['#f0e3cc','#e3eade','#eee7d6','#e4e7eb','#eee0dc','#e7ead8'];
  const hairs = ['<path d="M22 39C8 8 62 2 60 36L48 24 34 29Z"/>','<path d="M20 43V25c0-23 41-23 41 0v21l-10-13-18-11-10 19Z"/>','<path d="M21 32c-3-24 40-25 39 0l-12-12-19 7Z"/>','<path d="M18 47V26c-1-26 45-26 45 1v26L53 39l-3-14-18-1-5 25Z"/>','<path d="M22 30C12 7 61 2 61 29l-11-6-10-9-9 12Z"/>','<path d="M20 36C11 7 69 5 61 38l-7-17-16 11-10-8Z"/>'];
  return `<svg viewBox="0 0 80 80" aria-hidden="true" class="avatar-art ${large ? 'large' : ''}"><rect width="80" height="80" rx="40" fill="${backs[i]}"/><path d="M9 81c0-28 61-29 63 0" fill="${shirts[i]}"/><path d="M34 52h12v16c-4 5-8 5-12 0Z" fill="#dbac85"/><g fill="#554c3c">${hairs[i]}</g><ellipse cx="40" cy="38" rx="18" ry="23" fill="#e7bd97"/><path d="M23 29c1-20 34-25 35 0-10-3-15-12-18-11-5 7-10 10-17 11Z" fill="#554c3c"/><g fill="#554c3c"><ellipse cx="33" cy="38" rx="1.4" ry="1.8"/><ellipse cx="47" cy="38" rx="1.4" ry="1.8"/></g><path d="M37 48q3 3 6 0" stroke="#945e44" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="28" cy="44" rx="4" ry="2.3" fill="#db9c80" opacity=".6"/><ellipse cx="52" cy="44" rx="4" ry="2.3" fill="#db9c80" opacity=".6"/>${i === 0 || i === 2 ? '<g stroke="#736446" stroke-width="1.5" fill="none"><circle cx="32" cy="38" r="6"/><circle cx="48" cy="38" r="6"/><path d="M38 38h4"/></g>' : ''}</svg>`;
}
