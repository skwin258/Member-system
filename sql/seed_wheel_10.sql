DELETE FROM wheel_prizes WHERE activity_key='wheel';

INSERT INTO wheel_prizes (name, prize_type, prize_value, prize_text, probability, sort_order, enabled)
VALUES
('參加獎', 'none', 0, '再接再厲', 45, 1, 1),
('66元',   'money', 66, NULL,      20, 2, 1),
('188元',  'money', 188, NULL,     15, 3, 1),
('金子',   'item',  0,  '金子',    10, 4, 1),
('666元',  'money', 666, NULL,     10, 5, 1),

('參加獎2', 'none', 0, '祝你好運', 0,  6, 1),
('參加獎3', 'none', 0, '下次一定', 0,  7, 1),
('參加獎4', 'none', 0, '再來一次', 0,  8, 1),
('參加獎5', 'none', 0, '差一點',   0,  9, 1),
('參加獎6', 'none', 0, 'Keep going',0, 10, 1);