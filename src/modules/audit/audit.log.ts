// Etkinlik kaydı: kim, kimin adına, ne yaptı. Adlar da yazılır; kullanıcı silinse de kayıt okunur kalır.
// Numarayla ilgili kayıtlar numara kimliğini taşır: "tüm numaraları gör" izni olmayan kişi yalnızca
// görebildiği numaraların kayıtlarını (ve numarasız kayıtları) görür.
import type { Context } from "hono";
import type { Database } from "../../db/client";
import type { AppEnv, AuditAction, AuditLog } from "../../shared/contracts";
import type { SessionUser } from "../../shared/types";

export const createAuditLog = (db: Database): AuditLog => {
  const insert = db.query(
    `INSERT INTO audit_log (ts, actor_id, actor_name, as_user_id, as_user_name, action, target, detail, number_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return {
    record({ actor, asUser = null, action, target = "", detail = null, numberId = null }) {
      insert.run(
        Date.now(),
        actor?.id ?? null,
        actor?.name ?? null,
        asUser?.id ?? null,
        asUser?.name ?? null,
        action,
        target,
        detail,
        numberId,
      );
    },
  };
};

// İstekteki gerçek kişi ve (ekranına geçilmişse) adına işlem yapılan kullanıcı.
export const whoFrom = (c: Context<AppEnv>): { actor: SessionUser; asUser: SessionUser | null } => {
  const actor = c.get("actor");
  return actor ? { actor, asUser: c.get("user") } : { actor: c.get("user"), asUser: null };
};

export const audit = (
  c: Context<AppEnv>,
  deps: { audit: AuditLog },
  action: AuditAction,
  target = "",
  detail: string | null = null,
  numberId: number | null = null,
) => deps.audit.record({ ...whoFrom(c), action, target, detail, numberId });
