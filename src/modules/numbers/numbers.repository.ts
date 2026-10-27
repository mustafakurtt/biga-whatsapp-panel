// Numara tablosu.
import type { Database } from "../../db/client";
import type { NumberRow } from "../../shared/types";

export const createNumbersRepository = (db: Database) => ({
  get: (id: number): NumberRow | null => db.query<NumberRow, [number]>("SELECT * FROM numbers WHERE id = ?").get(id),
  bySession: (session: string): NumberRow | null =>
    db.query<NumberRow, [string]>("SELECT * FROM numbers WHERE session = ?").get(session),
  listByIds: (ids: number[]): NumberRow[] => {
    if (ids.length === 0) return [];
    const marks = ids.map(() => "?").join(",");
    return db.query<NumberRow, number[]>(`SELECT * FROM numbers WHERE id IN (${marks}) ORDER BY label`).all(...ids);
  },
  // Oturum adı numaranın kimliğinden türetilir (n1, n2…), böylece tekil ve sabittir.
  create: (label: string, phone: string): NumberRow =>
    db.transaction(() => {
      const temp = `tmp_${crypto.randomUUID()}`;
      const row = db
        .query<{ id: number }, [string, string, string, number]>(
          "INSERT INTO numbers (label, phone, session, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        )
        .get(label, phone, temp, Date.now())!;
      db.query("UPDATE numbers SET session = ? WHERE id = ?").run(`n${row.id}`, row.id);
      return db.query<NumberRow, [number]>("SELECT * FROM numbers WHERE id = ?").get(row.id)!;
    })(),
  setStatus: (id: number, status: string, meId: string | null) =>
    db.query("UPDATE numbers SET status = ?, me_id = COALESCE(?, me_id) WHERE id = ?").run(status, meId, id),
  remove: (id: number) => db.query("DELETE FROM numbers WHERE id = ?").run(id),
});

export type NumbersRepository = ReturnType<typeof createNumbersRepository>;
