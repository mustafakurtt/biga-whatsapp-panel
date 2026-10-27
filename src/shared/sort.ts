// Türkçe alfabeye göre sıralama (SQLite ORDER BY "İ", "Ş", "Ç" gibi harfleri sona atar).
const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

export const sortTr = <T>(items: T[], key: (item: T) => string): T[] =>
  [...items].sort((a, b) => collator.compare(key(a), key(b)));
