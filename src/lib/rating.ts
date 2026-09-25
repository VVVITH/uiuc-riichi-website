/** Four-player pairwise Elo. Rates persist across semesters and use individual games only. */
export type RatingPlayer = { id: string; placement: number };
export type RatingGame = { id: string; time: string; players: RatingPlayer[] };
export type RatingState = { rate: number; games: number };
export type RatingPrediction = { actual: number; expected: number; playerA: string; playerB: string };

export const RATING_INITIAL = 1500;
export const RATING_K = 16;
export const RATING_SCALE = 350;
export const RATING_ROOKIE_QUANTILE = 0.05;
export const RATING_ROOKIE_GAMES = 5;
export const RATING_REFERENCE_GAMES = 20;
export const RATING_REFERENCE_DAYS = 180;
export const RATING_REFERENCE_MIN_PLAYERS = 8;

export type StoredRatingState = RatingState & { lastPlayed: number; rookieHandicap: number };
type RatingOptions = { k?: number; scale?: number; rookieQuantile?: number | null; rookieWindow?: number;
  onGame?: (game: RatingGame, predictions: RatingPrediction[]) => void };

function quantile(values: number[], position: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = (sorted.length - 1) * position;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function expectedWin(rateA: number, rateB: number, scale = RATING_SCALE): number {
  return 1 / (1 + 10 ** ((rateB - rateA) / scale));
}

export function applyRatingGame(state: Map<string, StoredRatingState>, game: RatingGame,
  options: RatingOptions = {}): void {
  const k = options.k ?? RATING_K;
  const scale = options.scale ?? RATING_SCALE;
  const rookieQuantile = options.rookieQuantile === undefined ? RATING_ROOKIE_QUANTILE : options.rookieQuantile;
  const rookieWindow = options.rookieWindow ?? RATING_ROOKIE_GAMES;
  if (!(k > 0) || !(scale > 0) || !Number.isInteger(rookieWindow) || rookieWindow < 1 ||
    (rookieQuantile !== null && !(rookieQuantile >= 0 && rookieQuantile <= 1))) {
    throw new Error("Invalid Rating parameters.");
  }
  if (game.players.length !== 4 || new Set(game.players.map(p => p.id)).size !== 4) {
    throw new Error(`Game ${game.id} must have four distinct players.`);
  }
  const gameTime = Date.parse(game.time);
  if (!Number.isFinite(gameTime)) throw new Error(`Game ${game.id} has an invalid time.`);
  for (const player of game.players) if (!state.has(player.id)) {
    const reference = [...state.values()]
      .filter(p => p.games >= RATING_REFERENCE_GAMES &&
        gameTime - p.lastPlayed <= RATING_REFERENCE_DAYS * 86400000)
      .map(p => p.rate);
    const referenceRate = rookieQuantile !== null && reference.length >= RATING_REFERENCE_MIN_PLAYERS
      ? quantile(reference, rookieQuantile) : RATING_INITIAL;
    state.set(player.id, { rate: RATING_INITIAL, games: 0, lastPlayed: gameTime,
      rookieHandicap: Math.max(0, RATING_INITIAL - referenceRate) });
  }
  const before = game.players.map(p => state.get(p.id)!.rate);
  const effective = game.players.map((p, i) => {
    const current = state.get(p.id)!;
    // The rookie discount changes only predictions; ledger Rate starts at 1500.
    return before[i] - current.rookieHandicap * Math.max(0, 1 - current.games / rookieWindow);
  });
  const changes = [0, 0, 0, 0];
  const predictions: RatingPrediction[] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const expected = expectedWin(effective[i], effective[j], scale);
    const actual = game.players[i].placement < game.players[j].placement ? 1
      : game.players[i].placement > game.players[j].placement ? 0 : 0.5;
    changes[i] += actual - expected;
    changes[j] -= actual - expected;
    predictions.push({ playerA: game.players[i].id, playerB: game.players[j].id, actual, expected });
  }
  options.onGame?.(game, predictions);
  for (let i = 0; i < 4; i++) {
    const current = state.get(game.players[i].id)!;
    current.rate = before[i] + k * changes[i] / 3;
    current.games++;
    current.lastPlayed = gameTime;
  }
}

export function calculateStoredRatings(games: RatingGame[], options: RatingOptions = {}) {
  const state = new Map<string, StoredRatingState>();
  for (const game of games) applyRatingGame(state, game, options);
  return state;
}

export function calculateRatings(games: RatingGame[], options: RatingOptions = {}): Map<string, RatingState> {
  const state = calculateStoredRatings(games, options);
  return new Map([...state].map(([id, player]) => [id, { rate: player.rate, games: player.games }]));
}
