// Numara tablosu.
import type { Database } from "../../db/client";
import { sortTr } from "../../shared/sort";
import type { NumberRow, NumberStatus, ProviderKind } from "../../shared/types";

export const createNumbersRepository = (db: Database) => ({
  all: (): NumberRow[] => db.query<NumberRow, []>("SELECT * FROM numbers ORDER BY label").all(),
  byPhone: (phone: string): NumberRow | null =>
    db.query<NumberRow, [string]>("SELECT * FROM numbers WHERE phone = ?").get(phone),
  get: (id: number): NumberRow | null => db.query<NumberRow, [number]>("SELECT * FROM numbers WHERE id = ?").get(id),
  bySession: (session: string): NumberRow | null =>
    db.query<NumberRow, [string]>("SELECT * FROM numbers WHERE session = ?").get(session),
  listByIds: (ids: number[]): NumberRow[] => {
    if (ids.length === 0) return [];
    const marks = ids.map(() => "?").join(",");
    return sortTr(db.query<NumberRow, number[]>(`SELECT * FROM numbers WHERE id IN (${marks})`).all(...ids), (n) => n.label);
  },
  // Oturum adı numaranın kimliği + rastgele bir ek (n2-1a2b3c): SQLite silinen numaranın kimliğini yeniden
  // verebilir; ek olmazsa yeni numara silinenin oturum klasörünü (BAILEYS_AUTH_DIR/n2) devralırdı.
  create: (label: string, phone: string, provider: ProviderKind): NumberRow =>
    db.transaction(() => {
      const temp = `tmp_${crypto.randomUUID()}`;
      const row = db
        .query<{ id: number }, [string, string, ProviderKind, string, number]>(
          "INSERT INTO numbers (label, phone, provider, session, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
        )
        .get(label, phone, provider, temp, Date.now())!;
      db.query("UPDATE numbers SET session = ? WHERE id = ?").run(`n${row.id}-${crypto.randomUUID().slice(0, 6)}`, row.id);
      return db.query<NumberRow, [number]>("SELECT * FROM numbers WHERE id = ?").get(row.id)!;
    })(),
  setStatus: (id: number, status: NumberStatus, meId: string | null) =>
    db.query("UPDATE numbers SET status = ?, me_id = COALESCE(?, me_id) WHERE id = ?").run(status, meId, id),
  remove: (id: number) => db.query("DELETE FROM numbers WHERE id = ?").run(id),
});

export type NumbersRepository = ReturnType<typeof createNumbersRepository>;
