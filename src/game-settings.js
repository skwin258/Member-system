const activity = { enabled: [0, 1, 1], cost: [50, 10000, 100] };
const tiers = (limits, rewards) => Object.fromEntries(limits.flatMap((limit, index) => [
  [`limit${index + 1}`, [1, 60000, limit]],
  [`reward${index + 1}`, [0, 100000, rewards[index]]],
]));

export const GAME_RULES = {
  numbers: { ...activity, grid: [3, 6, 5], ...tiers([9000, 11000, 13000], [1000, 500, 200]) },
  reaction: { ...activity, minWait: [500, 10000, 1500], waitRange: [0, 10000, 3000], refundEarly: [0, 1, 1], ...tiers([100, 150, 200], [500, 300, 200]) },
  claw: {
    ...activity,
    grip: [1, 10, 6, 0.1], damping: [0.05, 1, 0.15, 0.01],
    carryFactor: [0.3, 1, 0.75, 0.01], jolt: [0, 0.03, 0.012, 0.001],
    fingerFriction: [0.5, 4, 2, 0.05], toyFriction: [0.5, 4, 2, 0.05],
    moveSpeed: [0.2, 1.2, 0.5, 0.01], dropSpeed: [0.2, 1.2, 0.55, 0.01], liftSpeed: [0.2, 1.2, 0.5, 0.01],
    toyMin: [0.04, 0.1, 0.05, 0.002], toyMax: [0.04, 0.1, 0.072, 0.002],
    reward: [0, 100000, 1000],
  },
  football: {},
  redpacket: {},
  wheel: {},
};

export function defaultGameRules(key) {
  return { help: "", ...Object.fromEntries(Object.entries(GAME_RULES[key]).map(([name, [, , value]]) => [name, value])) };
}

export function parseGamePatch(key, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const patch = {};
  for (const [name, value] of Object.entries(input)) {
    if (name === "help") {
      if (typeof value !== "string" || value.length > 1600) return null;
    } else {
      const bounds = GAME_RULES[key][name];
      if (!Object.hasOwn(GAME_RULES[key], name) || !Number.isFinite(value)
        || value < bounds[0] || value > bounds[1] || (!bounds[3] && !Number.isInteger(value))) return null;
    }
    patch[name] = value;
  }
  return patch;
}
