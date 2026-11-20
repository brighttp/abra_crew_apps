import bcrypt from 'bcryptjs';
import { db } from './config/database.js';
import { username, password, text } from './utils/validation.js';
try {
  const name = username.parse(process.env.ADMIN_USERNAME),
    secret = password.parse(process.env.ADMIN_PASSWORD),
    full_name = text.parse(process.env.ADMIN_NAME);
  await db.transaction(async (trx) => {
    if (await trx('users').where({ account_role: 'ADMIN' }).first())
      throw new Error('An admin already exists; bootstrap is disabled');
    const [id] = await trx('users').insert({
      username: name,
      password_hash: await bcrypt.hash(secret, 12),
      account_role: 'ADMIN',
      approval_state: 'APPROVED',
      approved_at: new Date(),
    });
    await trx('crew_profiles').insert({ user_id: id, full_name });
  });
  console.log('Initial administrator created. Remove bootstrap credentials from your environment.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
