import { fail, integer } from './validation.ts';

/** Check the completed round's arithmetic and eligibility before storing it. */
export function validateLandroidResult(
  score: number,
  metadata: Record<string, unknown>,
): void {
  const m = metadata;
  if (m.ruleVersion !== 1 || m.completed !== true || m.autopilot !== false)
    fail(
      400,
      'INVALID_FLIGHT',
      '只有完成全部星球探索、且未开启 AUTO 的本局得分可以上传。',
    );
  integer(m.seed, '星系种子', 0, Number.MAX_SAFE_INTEGER);
  const count = integer(m.planetCount, '星球数量', 1, 10);
  if (m.discovered !== count)
    fail(400, 'INCOMPLETE_FLIGHT', '请先完成当前星系的全部星球探索。');
  const speed = integer(m.speedBonus, '速度奖励', 0, count * 3000);
  const angle = integer(m.angleBonus, '朝向奖励', 0, count * 3000);
  const sequence = integer(m.sequenceBonus, '顺序奖励', 0, 2000);
  if (sequence !== 0 && sequence !== 2000)
    fail(400, 'INVALID_FLIGHT', '顺序奖励不正确。');
  const impacts = integer(m.impacts, '撞击次数', 0, 1000000000);
  const flight = m.flightSeconds;
  const fuel = m.fuelSeconds;
  if (
    typeof flight !== 'number' ||
    !Number.isFinite(flight) ||
    flight < 0 ||
    flight > 1e12 ||
    typeof fuel !== 'number' ||
    !Number.isFinite(fuel) ||
    fuel < 0 ||
    fuel > flight + 1e-6
  )
    fail(400, 'INVALID_FLIGHT', '飞行时间或燃料记录不正确。');
  const expected =
    5000 +
    count * 3000 +
    speed +
    angle +
    sequence -
    impacts * 500 -
    Math.round(flight * 10 + fuel * 100);
  if (score !== expected)
    fail(400, 'INVALID_FLIGHT_SCORE', '得分与本局记录不一致，请重新完成一局。');
}
