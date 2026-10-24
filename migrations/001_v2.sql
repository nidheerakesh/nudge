ALTER TABLE tasks ADD COLUMN area_id INTEGER;
ALTER TABLE habits ADD COLUMN area_id INTEGER;
INSERT INTO areas(name, sort) SELECT 'Study', 0 WHERE (SELECT COUNT(*) FROM areas)=0;
INSERT INTO areas(name, sort) SELECT 'Health', 1 WHERE (SELECT COUNT(*) FROM areas)=1 AND (SELECT COUNT(*) FROM areas WHERE sort<1 AND name IN ('Study'))=1;
INSERT INTO areas(name, sort) SELECT 'Money', 2 WHERE (SELECT COUNT(*) FROM areas)=2 AND (SELECT COUNT(*) FROM areas WHERE sort<2 AND name IN ('Study', 'Health'))=2;
INSERT INTO areas(name, sort) SELECT 'People', 3 WHERE (SELECT COUNT(*) FROM areas)=3 AND (SELECT COUNT(*) FROM areas WHERE sort<3 AND name IN ('Study', 'Health', 'Money'))=3;
INSERT INTO areas(name, sort) SELECT 'Self', 4 WHERE (SELECT COUNT(*) FROM areas)=4 AND (SELECT COUNT(*) FROM areas WHERE sort<4 AND name IN ('Study', 'Health', 'Money', 'People'))=4;
INSERT INTO areas(name, sort) SELECT 'Home', 5 WHERE (SELECT COUNT(*) FROM areas)=5 AND (SELECT COUNT(*) FROM areas WHERE sort<5 AND name IN ('Study', 'Health', 'Money', 'People', 'Self'))=5;
