// Yeni sohbet: telefon + ilk mesaj → POST /api/numbers/:id/chats
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { post, UnauthorizedError } from "../../api/client";
import { upsertChat } from "../../api/cache";
import type { ChatRow, NumberView } from "../../api/types";
import { Dialog } from "../../components/overlays";
import { Button, Field } from "../../components/ui";
import { useSession } from "../app/session";
import { chatPath } from "./current";

export function NewChatDialog({ number, onClose }: { number: NumberView; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useSession();
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!phone.trim() || !text.trim()) {
      setError("Telefon numarası ve mesaj gerekli.");
      return;
    }
    setBusy(true);
    try {
      const { chat } = await post<{ chat: ChatRow }>(`/api/numbers/${number.id}/chats`, { phone: phone.trim(), text: text.trim() });
      onClose();
      if (chat) {
        upsertChat(qc, chat, { moveTop: true, meId: user.id });
        navigate(chatPath(chat.number_id, chat.id), { state: { fromList: true } });
      }
    } catch (err) {
      // Örn. "Bu numara WhatsApp kullanmıyor"
      if (!(err instanceof UnauthorizedError)) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Yeni sohbet · ${number.label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="new-chat-form" variant="primary" icon="send" disabled={busy}>Gönder ve sohbeti aç</Button>
        </>
      }
    >
      <form id="new-chat-form" className="form-stack" onSubmit={submit}>
        <Field label="Telefon numarası" hint="Ülke koduyla, boşluksuz. Örnek: 905551234567">
          {(id) => <input id={id} className="input" inputMode="tel" autoComplete="off" placeholder="905551234567" autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
        <Field label="İlk mesaj">
          {(id) => <textarea id={id} className="input textarea" rows={4} placeholder="Merhaba, …" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
