export const decks = [
  { title: 'Moonlight Express', genre: 'ADVENTURE', year: '1996', rating: 'EVERYONE', description: 'Catch the last train to somewhere extraordinary.', colors: ['#262650','#645595','#eab1ae','#f9d587'], scene: 'city' },
  { title: 'Coral Odyssey', genre: 'EXPLORATION', year: '1994', rating: 'EVERYONE', description: 'A tiny diver. An ocean of possibilities.', colors: ['#124655','#26999a','#77d8bd','#f79986'], scene: 'sea' },
  { title: 'Evergreen Quest', genre: 'ACTION · ADVENTURE', year: '1993', rating: 'EVERYONE', description: 'Get lost in the woods. Find a little magic.', colors: ['#183f37','#3c7952','#8caf66','#f6dc8d'], scene: 'forest' },
  { title: 'Cosmic Drift', genre: 'ARCADE · RACING', year: '1998', rating: 'EVERYONE', description: 'Leave the ordinary behind. Race beyond the stars.', colors: ['#222445','#625284','#bc84bd','#a7e7e6'], scene: 'space' },
  { title: 'Sunset Circuit', genre: 'RACING', year: '1995', rating: 'EVERYONE', description: 'Neon nights and one more lap around the sun.', colors: ['#673c64','#e08079','#eeb77d','#ffe5a7'], scene: 'road' },
  { title: 'Cloud Castle', genre: 'PLATFORMER', year: '1992', rating: 'EVERYONE', description: 'Take the scenic route to a kingdom in the sky.', colors: ['#507c9f','#80b3bf','#c6ddca','#fbebba'], scene: 'castle' },
  { title: 'Desert Bloom', genre: 'PUZZLE · ADVENTURE', year: '1997', rating: 'EVERYONE', description: 'Every oasis starts with a little curiosity.', colors: ['#7b5060','#bc7b6b','#e4ad79','#f9db9c'], scene: 'desert' },
];
export const wrap = (index, length = decks.length) => ((index % length) + length) % length;
export const relativePosition = (index, focused, length) => {
  const position = wrap(index - focused, length);
  return position > length / 2 ? position - length : position;
};
