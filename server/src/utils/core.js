import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function assert(condition, status, message) {
  if (!condition) throw new HttpError(status, message);
}
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export const now = () => new Date();
export const pageOf = (q) => ({
  page: Math.max(1, Math.min(100000, Number.parseInt(q.page) || 1)),
  limit: Math.max(1, Math.min(100, Number.parseInt(q.limit) || 20)),
});
export async function paginate(query, q) {
  const { page, limit } = pageOf(q);
  const [{ total }] = await query
    .clone()
    .clearSelect()
    .clearOrder()
    .countDistinct({ total: `${q._table || 'users'}.id` });
  const items = await query.limit(limit).offset((page - 1) * limit);
  return { items, total: Number(total), page, limit };
}
export async function audit(trx, actor, action, entityType, entityId, metadata = {}) {
  await trx('audit_logs').insert({
    actor_user_id: actor?.user?.id || null,
    actor_type: actor?.user ? 'USER' : actor?.external ? 'EXTERNAL' : 'SYSTEM',
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: JSON.stringify(metadata),
    ip_address: actor?.ip || null,
  });
}
export function safeCell(v) {
  const s = v == null ? '' : String(v);
  return /^(?:[=+\-@\t\r\n]|\s+[=+\-@])/.test(s) ? `'${s}` : s;
}
