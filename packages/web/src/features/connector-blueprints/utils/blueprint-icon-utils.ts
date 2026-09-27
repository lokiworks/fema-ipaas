function letterOf(name: string): string {
  const character = [...name.trim()][0] ?? '?';
  return /[a-z]/.test(character) ? character.toUpperCase() : character;
}

export const blueprintIconUtils = {
  letterOf,
};
