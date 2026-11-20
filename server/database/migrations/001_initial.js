const pk = (t) => t.increments('id');
const times = (t) => t.timestamps(true, true);
const fk = (t, name, table, nullable = false) => {
  const c = t.integer(name).unsigned();
  if (!nullable) c.notNullable();
  c.references('id').inTable(table).onDelete('RESTRICT');
  return c;
};
export async function up(k) {
  await k.schema.createTable('users', (t) => {
    pk(t);
    t.string('username', 60).notNullable().unique();
    t.string('email', 254).nullable().unique();
    t.string('password_hash').notNullable();
    t.enum('account_role', ['ADMIN', 'CREW']).notNullable();
    t.enum('approval_state', ['PENDING', 'APPROVED', 'REJECTED']).notNullable();
    t.timestamp('approved_at').nullable();
    t.integer('approved_by').unsigned().nullable();
    t.integer('session_version').notNullable().defaultTo(1);
    times(t);
    t.timestamp('deleted_at').nullable();
    t.index(['account_role', 'approval_state', 'deleted_at']);
  });
  await k.schema.alterTable('users', (t) => t.foreign('approved_by').references('users.id'));
  await k.schema.createTable('crew_profiles', (t) => {
    pk(t);
    fk(t, 'user_id', 'users').unique();
    t.string('full_name', 200).notNullable();
    t.string('phone', 40);
    t.string('profile_photo_path');
    times(t);
  });
  await k.schema.createTable('skills', (t) => {
    pk(t);
    t.string('name', 200).notNullable().unique();
    t.string('slug', 200).notNullable().unique();
    times(t);
  });
  await k.schema.createTable('crew_skills', (t) => {
    pk(t);
    fk(t, 'crew_id', 'users');
    fk(t, 'skill_id', 'skills');
    t.timestamp('created_at').defaultTo(k.fn.now());
    t.unique(['crew_id', 'skill_id']);
  });
  await k.schema.createTable('events', (t) => {
    pk(t);
    t.string('name', 200).notNullable();
    t.string('client_name', 200);
    t.string('location', 200).notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.text('description');
    t.enum('status', ['DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']).notNullable();
    fk(t, 'created_by', 'users');
    times(t);
    t.timestamp('deleted_at').nullable();
    t.index(['status', 'start_date', 'deleted_at']);
  });
  await k.schema.createTable('event_assignments', (t) => {
    pk(t);
    fk(t, 'event_id', 'events');
    fk(t, 'crew_id', 'users');
    t.enum('assignment_source', ['MANUAL', 'REGISTRATION']).notNullable();
    fk(t, 'assigned_by', 'users');
    t.timestamp('assigned_at').defaultTo(k.fn.now());
    times(t);
    t.unique(['event_id', 'crew_id']);
  });
  await k.schema.createTable('event_registration_settings', (t) => {
    pk(t);
    fk(t, 'event_id', 'events').unique();
    t.boolean('is_enabled').defaultTo(false);
    t.string('token_hash', 64).nullable().unique();
    t.timestamp('deadline').nullable();
    t.integer('quota').unsigned().nullable();
    t.text('public_description');
    t.text('instructions');
    t.boolean('show_client').defaultTo(false);
    t.boolean('show_slots').defaultTo(true);
    times(t);
  });
  await k.schema.createTable('event_registrations', (t) => {
    pk(t);
    fk(t, 'event_id', 'events');
    fk(t, 'crew_id', 'users');
    t.enum('application_status', ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'])
      .notNullable()
      .defaultTo('PENDING');
    t.timestamp('applied_at').defaultTo(k.fn.now());
    t.timestamp('reviewed_at').nullable();
    fk(t, 'reviewed_by', 'users', true);
    t.text('rejection_reason');
    times(t);
    t.unique(['event_id', 'crew_id']);
    t.index(['application_status', 'event_id']);
  });
  await k.schema.createTable('event_evaluation_links', (t) => {
    pk(t);
    fk(t, 'event_id', 'events').unique();
    t.string('token_hash', 64).notNullable().unique();
    t.boolean('is_active').defaultTo(true);
    t.timestamp('expires_at').nullable();
    fk(t, 'created_by', 'users');
    t.timestamp('created_at').defaultTo(k.fn.now());
    t.timestamp('revoked_at').nullable();
  });
  await k.schema.createTable('external_evaluator_sessions', (t) => {
    pk(t);
    fk(t, 'event_id', 'events');
    fk(t, 'evaluation_link_id', 'event_evaluation_links');
    t.string('evaluator_name', 200).notNullable();
    t.string('evaluator_description', 200).notNullable();
    t.string('session_token_hash', 64).notNullable().unique();
    t.timestamp('created_at').defaultTo(k.fn.now());
    t.timestamp('last_active_at').defaultTo(k.fn.now());
    t.timestamp('revoked_at').nullable();
  });
  await k.schema.createTable('evaluation_criteria', (t) => {
    pk(t);
    t.string('name', 200).notNullable();
    t.text('description');
    t.boolean('is_active').defaultTo(true);
    times(t);
  });
  await k.schema.createTable('event_evaluation_criteria', (t) => {
    pk(t);
    fk(t, 'event_id', 'events');
    fk(t, 'criterion_id', 'evaluation_criteria');
    t.string('criterion_name_snapshot', 200).notNullable();
    t.text('criterion_description_snapshot');
    t.integer('display_order').defaultTo(0);
    t.timestamp('created_at').defaultTo(k.fn.now());
    t.unique(['event_id', 'criterion_id']);
  });
  await k.schema.createTable('evaluations', (t) => {
    pk(t);
    fk(t, 'event_id', 'events');
    fk(t, 'crew_id', 'users');
    t.enum('evaluator_type', ['ADMIN', 'EXTERNAL']).notNullable();
    fk(t, 'admin_evaluator_id', 'users', true);
    fk(t, 'external_session_id', 'external_evaluator_sessions', true);
    t.enum('status', ['DRAFT', 'SUBMITTED', 'PUBLISHED']).defaultTo('DRAFT');
    t.text('feedback_original');
    t.text('feedback_public');
    t.timestamp('submitted_at').nullable();
    t.timestamp('published_at').nullable();
    fk(t, 'published_by', 'users', true);
    times(t);
    t.unique(['event_id', 'crew_id', 'external_session_id']);
    t.unique(['event_id', 'crew_id', 'admin_evaluator_id']);
    t.index(['crew_id', 'status', 'event_id']);
  });
  await k.raw(
    "ALTER TABLE evaluations ADD CONSTRAINT evaluation_actor CHECK ((evaluator_type = 'ADMIN' AND admin_evaluator_id IS NOT NULL AND external_session_id IS NULL) OR (evaluator_type = 'EXTERNAL' AND external_session_id IS NOT NULL AND admin_evaluator_id IS NULL))",
  );
  await k.schema.createTable('evaluation_scores', (t) => {
    pk(t);
    fk(t, 'evaluation_id', 'evaluations');
    fk(t, 'event_criterion_id', 'event_evaluation_criteria');
    t.integer('score').notNullable();
    times(t);
    t.unique(['evaluation_id', 'event_criterion_id']);
  });
  await k.raw(
    'ALTER TABLE evaluation_scores ADD CONSTRAINT valid_score CHECK (score BETWEEN 1 AND 5)',
  );
  await k.schema.createTable('audit_logs', (t) => {
    pk(t);
    fk(t, 'actor_user_id', 'users', true);
    t.string('actor_type', 20).notNullable();
    t.string('action', 100).notNullable();
    t.string('entity_type', 100).notNullable();
    t.integer('entity_id').unsigned().nullable();
    t.json('metadata_json');
    t.string('ip_address', 64);
    t.timestamp('created_at').defaultTo(k.fn.now());
    t.index(['action', 'created_at']);
  });
  await k.schema.createTable('system_settings', (t) => {
    t.string('key', 80).primary();
    t.json('value');
    times(t);
  });
  await k.schema.createTable('sessions', (t) => {
    t.string('session_id', 128).collate('utf8mb4_bin').primary();
    t.integer('expires').unsigned().notNullable().index();
    t.text('data', 'medium').collate('utf8mb4_bin');
  });
  const names = [
    'Communication',
    'Technical Skills',
    'Discipline',
    'Punctuality',
    'Teamwork',
    'Problem Solving',
    'Initiative',
    'Professionalism',
  ];
  await k('evaluation_criteria').insert(
    names.map((name) => ({
      name,
      description: 'Rate from 1 (Poor) to 5 (Excellent)',
      is_active: true,
    })),
  );
}
export async function down(k) {
  for (const table of [
    'sessions',
    'system_settings',
    'audit_logs',
    'evaluation_scores',
    'evaluations',
    'event_evaluation_criteria',
    'evaluation_criteria',
    'external_evaluator_sessions',
    'event_evaluation_links',
    'event_registrations',
    'event_registration_settings',
    'event_assignments',
    'events',
    'crew_skills',
    'skills',
    'crew_profiles',
    'users',
  ])
    await k.schema.dropTableIfExists(table);
}
