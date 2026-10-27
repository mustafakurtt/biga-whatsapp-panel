// Yönetim › Etiketler: ad + 9 renkten biri. Sohbete takmak için yazma erişimi yeter; burası tanımları yönetir.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { del, errorMessage, post, put } from "../../api/client";
import { qk, useTags } from "../../api/queries";
import type { Tag, TagColor } from "../../api/types";
import { confirmDialog, Dialog, showError, toast } from "../../components/overlays";
import { BlockError, Button, EmptyBlock, Field, IconButton, PageHead, TagChip, cx } from "../../components/ui";

export const TAG_COLOR_LABELS: { id: TagColor; label: string }[] = [
  { id: "gray", label: "Gri" },
  { id: "red", label: "Kırmızı" },
  { id: "orange", label: "Turuncu" },
  { id: "yellow", label: "Sarı" },
  { id: "green", label: "Yeşil" },
  { id: "teal", label: "Camgöbeği" },
  { id: "blue", label: "Mavi" },
  { id: "purple", label: "Mor" },
  { id: "pink", label: "Pembe" },
];

export function TagsAdmin() {
  const qc = useQueryClient();
  const q = useTags();
  const tags = q.data ?? [];
  const [editing, setEditing] = useState<Tag | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.tags });

  const remove = async (t: Tag) => {
    const ok = await confirmDialog({ title: `"${t.name}" silinsin mi?`, message: "Etiket, takılı olduğu tüm sohbetlerden de kalkar.", confirmText: "Etiketi sil", danger: true });
    if (!ok) return;
    try {
      await del(`/api/tags/${t.id}`);
      toast("Etiket silindi", "ok");
      await refresh();
      void qc.invalidateQueries({ queryKey: qk.chatsAll });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <PageHead
        title="Etiketler"
        sub={q.isLoading ? "Yükleniyor…" : `${tags.length} etiket · sohbet listesinde filtre olarak da kullanılır`}
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Etiket ekle</Button>}
      />
      <div className="panel panel-flush">
        {q.isError ? (
          <BlockError message={`Etiketler yüklenemedi: ${errorMessage(q.error)}`} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <p className="pad muted">Yükleniyor…</p>
        ) : !tags.length ? (
          <EmptyBlock title="Sohbetleri etiketle gruplayın" action={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Etiket ekle</Button>}>
            Örnek: Sipariş, İade, Teklif bekliyor, VIP. Ekip sohbet başlığından etiket takar, listeyi etikete göre süzer.
          </EmptyBlock>
        ) : (
          <ul className="tag-admin-list" role="list">
            {tags.map((t) => (
              <li key={t.id}>
                <div
                  className="tag-admin-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditing(t);
                  }}
                >
                  <TagChip tag={t} />
                  <span className="muted small tag-admin-color">{TAG_COLOR_LABELS.find((c) => c.id === t.color)?.label ?? t.color}</span>
                  <div className="qr-admin-actions">
                    <Button size="sm" variant="ghost">Düzenle</Button>
                    <IconButton
                      icon="trash"
                      size={16}
                      label={`${t.name} etiketini sil`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(t);
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <TagEditor tag={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function TagEditor({ tag, onClose, onSaved }: { tag: Tag | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const isNew = !tag;
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState<TagColor>(tag?.color ?? "blue");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const swatchesRef = useRef<HTMLDivElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const onSwatchKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TAG_COLOR_LABELS.findIndex((c) => c.id === color);
    const next = TAG_COLOR_LABELS[(i + (e.key === "ArrowRight" ? 1 : -1) + TAG_COLOR_LABELS.length) % TAG_COLOR_LABELS.length];
    if (!next) return;
    setColor(next.id);
    requestAnimationFrame(() => swatchesRef.current?.querySelector<HTMLButtonElement>(`[data-color="${next.id}"]`)?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("Ad gerekli.");
      return;
    }
    const payload = { name: name.trim(), color };
    setBusy(true);
    try {
      if (isNew) await post("/api/tags", payload);
      else await put(`/api/tags/${tag.id}`, payload);
    } catch (ex) {
      setErr(errorMessage(ex));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    toast(isNew ? "Etiket eklendi" : "Etiket güncellendi", "ok");
    await onSaved();
  };

  return (
    <Dialog
      title={isNew ? "Yeni etiket" : "Etiketi düzenle"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="tag-form" variant="primary" disabled={busy}>{isNew ? "Ekle" : "Kaydet"}</Button>
        </>
      }
    >
      <form id="tag-form" className="form-stack" onSubmit={(e) => void submit(e)}>
        <Field label="Ad">
          {(id) => <input ref={nameRef} id={id} className="input" required maxLength={40} autoComplete="off" placeholder="Teklif bekliyor" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="field">
          <span className="field-label">Renk</span>
          <div ref={swatchesRef} className="swatches" role="radiogroup" aria-label="Renk" onKeyDown={onSwatchKey}>
            {TAG_COLOR_LABELS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                className={cx("swatch-btn", `tag-${c.id}`)}
                aria-label={c.label}
                title={c.label}
                data-color={c.id}
                aria-checked={c.id === color}
                tabIndex={c.id === color ? 0 : -1}
                onClick={() => setColor(c.id)}
              >
                <span className="tag-dot" />
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Önizleme</span>
          <div className="tag-preview"><TagChip tag={{ name: name.trim() || "Örnek etiket", color }} /></div>
        </div>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </Dialog>
  );
}
