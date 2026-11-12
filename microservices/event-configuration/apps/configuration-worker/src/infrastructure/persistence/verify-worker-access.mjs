export async function verifyWorkerAccess(pool) {
  const result = await pool.query(`SELECT current_schema() AS schema, r.rolsuper, r.rolbypassrls,
    pg_has_role(current_user, c.relowner, 'MEMBER') AS owns_outbox,
    has_table_privilege(current_user, c.oid, 'SELECT,UPDATE') AS can_use_outbox
    FROM pg_roles r JOIN pg_class c ON c.oid = to_regclass('events.outbox')
    WHERE r.rolname = current_user`);
  const role = result.rows[0];
  if (!role || role.schema !== 'events' || role.rolsuper || role.rolbypassrls || role.owns_outbox || !role.can_use_outbox) {
    throw new Error('Invalid events schema or worker runtime role.');
  }
}
