export type StrategyDecision = {
  kind: "noop";
  reason: string;
};

export class StrategyEngine {
  decide(): StrategyDecision {
    return { kind: "noop", reason: "Not implemented" };
  }
}

