// Public on-demand USD rates, in microdollars per token.
const rates = new Map([
  ["claude-sonnet-5-5", { input: 2, output: 10 }],
]);

export function projectRoomTokenCost(rounds) {
  let microdollars = 0;
  let priced = 0;
  for (const round of rounds) {
    for (const result of Object.values(round.outputs)) {
      const rate = rates.get(result.model);
      const input = result.usage?.input_tokens;
      const output = result.usage?.output_tokens;
      if (result.source !== "api" || !rate ||
        !Number.isSafeInteger(input) || input < 0 ||
        !Number.isSafeInteger(output) || output < 0) continue;

      microdollars += input * rate.input + output * rate.output;
      priced++;
    }
  }
  return { microdollars, priced };
}
