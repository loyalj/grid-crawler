const ADJECTIVES = [
  'Ancient', 'Ashen', 'Bitter', 'Blighted', 'Blood', 'Bone', 'Broken',
  'Crimson', 'Crumbling', 'Cursed', 'Dark', 'Dead', 'Defiled', 'Dire',
  'Dread', 'Dying', 'Feral', 'Fetid', 'Forsaken', 'Forgotten', 'Frozen',
  'Gilded', 'Grim', 'Haunted', 'Hollow', 'Howling', 'Hungry', 'Iron',
  'Lost', 'Mad', 'Molten', 'Murky', 'Nameless', 'Pale', 'Poisoned',
  'Putrid', 'Rotting', 'Ruined', 'Sacred', 'Savage', 'Scorched', 'Shattered',
  'Shrouded', 'Silent', 'Sinister', 'Smoldering', 'Sunken', 'Sunless',
  'Twisted', 'Verdant', 'Vile', 'Withered', 'Wretched'
]

const PLACES = [
  'Abbey', 'Abyss', 'Barrows', 'Bastion', 'Bog', 'Catacombs', 'Cavern',
  'Chasm', 'Citadel', 'Crypt', 'Den', 'Depths', 'Domain', 'Dungeon',
  'Enclave', 'Fortress', 'Forest', 'Gate', 'Grotto', 'Hall', 'Heights',
  'Hold', 'Keep', 'Kingdom', 'Labyrinth', 'Lair', 'Mire', 'Monastery',
  'Passage', 'Pit', 'Reaches', 'Ruins', 'Sanctum', 'Spire', 'Stronghold',
  'Swamp', 'Temple', 'Throne', 'Tomb', 'Tower', 'Undercroft', 'Valley',
  'Vault', 'Warrens', 'Wastes'
]

const DESCRIPTORS = [
  'the Abyss', 'the Ancients', 'Ash', 'the Betrayed', 'the Blind',
  'Bones', 'Chaos', 'the Damned', 'the Dead', 'Despair', 'Doom',
  'Darkness', 'Eternity', 'the Fallen', 'the Forsaken', 'the Forgotten',
  'Madness', 'No Return', 'Oblivion', 'Ruin', 'Shadows', 'Sorrow',
  'Thorns', 'the Lost', 'the Void', 'Whispers'
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateMapName(): string {
  const roll = Math.random()
  const adj  = pick(ADJECTIVES)
  const place = pick(PLACES)
  const desc  = pick(DESCRIPTORS)

  if (roll < 0.35) return `${adj} ${place}`
  if (roll < 0.70) return `The ${adj} ${place}`
  if (roll < 0.85) return `${place} of ${desc}`
  return `The ${place} of ${desc}`
}
