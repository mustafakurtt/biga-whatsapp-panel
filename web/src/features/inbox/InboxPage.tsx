// Gelen kutusu: seçili numaranın sohbet listesi ve sağda açık sohbet.
// Masaüstünde iki sütun; telefonda tek bölge (liste ↔ sohbet, geri düğmesiyle).
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { get } from "../../api/client";
import { qk, useNumbers } from "../../api/queries";
import type { ChatQuery, ChatRow } from "../../api/types";
import { Icon } from "../../components/Icon";
import { toast } from "../../components/overlays";
import { ChatList } from "./ChatList";
import { Conversation } from "./Conversation";
import { chatPath, lastNumberId, numberPath, rememberNumber } from "./current";

const DEFAULT_QUERY: ChatQuery = { filter: "all", status: "open", tag: null, q: "" };

export function InboxPage() {
  const params = useParams<{ numberId?: string; chatId?: string }>();
  const [search] = useSearchParams();
  const numbers = useNumbers();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState<ChatQuery>(DEFAULT_QUERY);

  const routeNumberId = params.numberId ? Number(params.numberId) : null;
  const chatId = params.chatId ? Number(params.chatId) : null;
  const list = numbers.data ?? [];
  const fallbackId = [lastNumberId(), list[0]?.id].find((id) => id && list.some((n) => n.id === id)) ?? null;
  const number = list.find((n) => n.id === routeNumberId) ?? null;

  // Numara değişince arama sıfırlanır (filtreler kalır)
  useEffect(() => {
    if (routeNumberId) rememberNumber(routeNumberId);
    setQuery((q) => (q.q ? { ...q, q: "" } : q));
  }, [routeNumberId]);

  // Bildirimden derin bağlantı: /?chat=<id> → sohbetin numarasına git
  const deepChat = Number(search.get("chat")) || null;
  useEffect(() => {
    if (!deepChat) return;
    let cancelled = false;
    (async () => {
      try {
        const { chat } = await get<{ chat: ChatRow }>(`/api/chats/${deepChat}`);
        if (cancelled) return;
        qc.setQueryData(qk.chat(chat.id), chat);
        navigate(chatPath(chat.number_id, chat.id), { replace: true });
      } catch {
        if (cancelled) return;
        toast("Sohbet bulunamadı veya erişim yetkiniz yok", "error");
        navigate("/", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepChat, navigate, qc]);

  if (deepChat) return <div className="inbox" aria-busy="true" />;
  if (numbers.isPending) return <div className="inbox" aria-busy="true" />;
  // Kök adreste ya da artık görülemeyen numarada: son/ilk numaraya yönlendir
  if (!number && fallbackId) return <Navigate to={numberPath(fallbackId)} replace />;

  return (
    <div className="inbox">
      <ChatList number={number} query={query} setQuery={setQuery} activeChatId={chatId} />
      <section className="conv-col" aria-label="Sohbet">
        {number && chatId ? (
          <Conversation key={chatId} chatId={chatId} number={number} />
        ) : (
          <ConvEmpty hasNumber={Boolean(number)} />
        )}
      </section>
    </div>
  );
}

function ConvEmpty({ hasNumber }: { hasNumber: boolean }) {
  return (
    <div className="conv-empty">
      <div className="conv-empty-inner">
        <Icon name="message" size={28} className="conv-empty-ico" />
        <p className="conv-empty-title">{hasNumber ? "Bir sohbet seçin" : "Numara seçilmedi"}</p>
        <p className="conv-empty-sub">
          {hasNumber ? "Soldaki listeden bir sohbet açın. Ctrl K ile tüm numaralardaki mesajlarda arayabilirsiniz." : "Soldaki menüden bir numara seçin."}
        </p>
      </div>
    </div>
  );
}
