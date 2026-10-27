// Yönetim › Hazır yanıtlar: başlık + metin; yazma kutusunda "/" ile çağrılır.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { del, errorMessage, post, put } from "../../api/client";
import { qk, useQuickReplies } from "../../api/queries";
import type { QuickReply } from "../../api/types";
import { confirmDialog, Dialog, showError, toast } from "../../components/overlays";
import { BlockError, Button, EmptyBlock, Field, IconButton, PageHead } from "../../components/ui";

export function QuickRepliesAdmin() {
  const qc = useQueryClient();
  const q = useQuickReplies();
  const items = q.data ?? [];
  const [editing, setEditing] = useState<QuickReply | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.quickReplies });

  const remove = async (it: QuickReply) => {
    const ok = await confirmDialog({ title: `"${it.title}" silinsin mi?`, message: "Ekip bu yanıtı artık listede göremez.", confirmText: "Sil", danger: true });
    if (!ok) return;
    try {
      await del(`/api/quick-replies/${it.id}`);
      toast("Hazır yanıt silindi", "ok");
      await refresh();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <PageHead
        title="Hazır yanıtlar"
        sub={q.isLoading ? "Yükleniyor…" : `${items.length} yanıt · sohbette / yazınca listelenir`}
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Hazır yanıt ekle</Button>}
      />
      <div className="panel panel-flush">
        {q.isError ? (
          <BlockError message={`Hazır yanıtlar yüklenemedi: ${errorMessage(q.error)}`} onRetry={() => void q.refetch()} />
        ) : q.isLoading ? (
          <p className="pad muted">Yükleniyor…</p>
        ) : !items.length ? (
          <EmptyBlock
            title="Sık yazdığınız yanıtları bir kez kaydedin"
            action={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Hazır yanıt ekle</Button>}
          >
            Örnek: çalışma saatleri, kargo bilgisi, IBAN. Ekip yazma kutusunda / yazınca listeden seçer.
          </EmptyBlock>
        ) : (
          <ul className="qr-admin-list" role="list">
            {items.map((it) => (
              <li key={it.id}>
                <div
                  className="qr-admin-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setEditing(it)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditing(it);
                  }}
                >
                  <div className="qr-admin-text">
                    <p className="qr-admin-title">{it.title}</p>
                    <p className="qr-admin-body">{it.body}</p>
                  </div>
                  <div className="qr-admin-actions">
                    <Button size="sm" variant="ghost">Düzenle</Button>
                    <IconButton
                      icon="trash"
                      size={16}
                      label={`${it.title} sil`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(it);
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <QuickReplyDrawer item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}

function QuickReplyDrawer({ item, onClose, onSaved }: { item: QuickReply | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const isNew = !item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!title.trim() || !body.trim()) {
      setErr("Başlık ve metin gerekli.");
      return;
    }
    const payload = { title: title.trim(), body: body.trim() };
    setBusy(true);
    try {
      if (isNew) await post("/api/quick-replies", payload);
      else await put(`/api/quick-replies/${item.id}`, payload);
    } catch (ex) {
      setErr(errorMessage(ex));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    toast(isNew ? "Hazır yanıt eklendi" : "Hazır yanıt güncellendi", "ok");
    await onSaved();
  };

  return (
    <Dialog
      title={isNew ? "Yeni hazır yanıt" : "Hazır yanıtı düzenle"}
      kind="drawer"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="qr-form" variant="primary" disabled={busy}>{isNew ? "Ekle" : "Kaydet"}</Button>
        </>
      }
    >
      <form id="qr-form" className="form-stack" onSubmit={(e) => void submit(e)}>
        <Field label="Başlık" hint="Listede görünen kısa ad; / yazınca bununla da aranır.">
          {(id) => <input ref={titleRef} id={id} className="input" required maxLength={80} autoComplete="off" placeholder="Çalışma saatleri" value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Metin">
          {(id) => <textarea id={id} className="input textarea" rows={6} required placeholder="Hafta içi 09:00–18:00, cumartesi 10:00–14:00 arası açığız." value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </Dialog>
  );
}
