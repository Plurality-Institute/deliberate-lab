import {TransferStageConfig} from '@deliberation-lab/utils';
import {selectConditionByProbability} from './participant.utils';

describe('selectConditionByProbability', () => {
  it('should produce balanced output for 3 equal classes', () => {
    const probMap = {A: 0.3334, B: 0.3333, C: 0.3333};
    const counts: Record<string, number> = {A: 0, B: 0, C: 0};
    const stageConfig = {
      conditionProbabilities: probMap,
    } as unknown as TransferStageConfig;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      const result = selectConditionByProbability(stageConfig);
      counts[result!]++;
    }
    // Each should be close to N/3, allow 10% tolerance
    const expected = N / 3;
    const tolerance = N * 0.1;
    expect(counts.A).toBeGreaterThanOrEqual(expected - tolerance);
    expect(counts.A).toBeLessThanOrEqual(expected + tolerance);
    expect(counts.B).toBeGreaterThanOrEqual(expected - tolerance);
    expect(counts.B).toBeLessThanOrEqual(expected + tolerance);
    expect(counts.C).toBeGreaterThanOrEqual(expected - tolerance);
    expect(counts.C).toBeLessThanOrEqual(expected + tolerance);
  });
});
