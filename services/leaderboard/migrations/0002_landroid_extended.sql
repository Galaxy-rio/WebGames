INSERT INTO games(id, name) VALUES ('landroid-extended', 'Landroid extended')
ON CONFLICT(id) DO NOTHING;

INSERT INTO boards(game_id, id, name, sort_order, score_scale, decimals, unit, min_score, max_score, metadata_fields)
VALUES ('landroid-extended', 'exploration', '星系探索', 'desc', 1, 0, '分', -9007199254740991, 97000,
  '["ruleVersion","seed","planetCount","discovered","flightSeconds","fuelSeconds","speedBonus","angleBonus","sequenceBonus","impacts","completed","autopilot"]')
ON CONFLICT(game_id, id) DO NOTHING;
