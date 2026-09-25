export class GameValidationError extends Error {}

export function parseHundreds(value: unknown): number {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    throw new GameValidationError("Scores must be whole numbers of 100 points.");
  }
  const score = Number(value) * 100;
  if (!Number.isSafeInteger(score)) {
    throw new GameValidationError("Score is outside the supported range.");
  }
  return score;
}

export function validateGameEntries(entries: { player_id: string; score: number }[]): void {
  if (entries.length !== 4 || entries.some(({ player_id }) =>
    typeof player_id !== "string" || !/^[1-9]\d*$/.test(player_id) ||
    BigInt(player_id) > 18446744073709551615n)) {
    throw new GameValidationError("You must select 4 valid players.");
  }
  if (new Set(entries.map(({ player_id }) => player_id)).size !== 4) {
    throw new GameValidationError("You must select 4 distinct players.");
  }
  if (entries.some(({ score }) => !Number.isSafeInteger(score) || score % 100 !== 0)) {
    throw new GameValidationError("Scores must be whole multiples of 100 points.");
  }
  // BigInt keeps even unusually large, but valid, integer inputs exact.
  const total = entries.reduce((sum, { score }) => sum + BigInt(score), 0n);
  if (total !== 100000n) {
    throw new GameValidationError(`Total score does not add up to 100000. Current total score: ${total}`);
  }
}
