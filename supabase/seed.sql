-- =============================================================================
-- Seed data: global exercise library
-- =============================================================================
-- These rows have owner_id = NULL, so RLS makes them readable by every user
-- while staying read-only to clients (only the owner could modify, and there
-- is no owner). Applied by `supabase db reset` after the migrations run.
-- =============================================================================

insert into exercises (name, primary_muscle, secondary_muscles, equipment, category)
values
  ('Back Squat',          'quads',     '{glutes,hamstrings,core}', 'barbell',    'compound'),
  ('Front Squat',         'quads',     '{glutes,core}',            'barbell',    'compound'),
  ('Bench Press',         'chest',     '{triceps,shoulders}',      'barbell',    'compound'),
  ('Incline Bench Press', 'chest',     '{shoulders,triceps}',      'barbell',    'compound'),
  ('Deadlift',            'back',      '{glutes,hamstrings,core}', 'barbell',    'compound'),
  ('Romanian Deadlift',   'hamstrings','{glutes,back}',            'barbell',    'compound'),
  ('Overhead Press',      'shoulders', '{triceps,core}',           'barbell',    'compound'),
  ('Barbell Row',         'back',      '{biceps,forearms}',        'barbell',    'compound'),
  ('Pull-Up',             'back',      '{biceps,forearms}',        'bodyweight', 'compound'),
  ('Chin-Up',             'back',      '{biceps,forearms}',        'bodyweight', 'compound'),
  ('Lat Pulldown',        'back',      '{biceps}',                 'cable',      'compound'),
  ('Dumbbell Curl',       'biceps',    '{forearms}',               'dumbbell',   'isolation'),
  ('Triceps Pushdown',    'triceps',   '{}',                       'cable',      'isolation'),
  ('Leg Press',           'quads',     '{glutes,hamstrings}',      'machine',    'compound'),
  ('Leg Curl',            'hamstrings','{}',                       'machine',    'isolation'),
  ('Leg Extension',       'quads',     '{}',                       'machine',    'isolation'),
  ('Lateral Raise',       'shoulders', '{}',                       'dumbbell',   'isolation'),
  ('Plank',               'core',      '{full_body}',              'bodyweight', 'isolation');
