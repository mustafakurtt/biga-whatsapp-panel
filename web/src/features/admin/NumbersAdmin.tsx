// Yönetim › Numaralar: ekle (gerçek / test), eşleştirme kodu (8 hane), QR yedeği, durum yenile, test mesajı, sil.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { del, errorMessage, post } from "../../api/client";
import { qk, useConfig, useNumbers } from "../../api/queries";
import type { NumberView, ProviderKind } from "../../api/types";
import { Icon } from "../../components/Icon";
import { confirmDialog, Dialog, openMenu, showError, toast } from "../../components/overlays";
import { BlockError, Button, EmptyBlock, Field, IconButton, PageHead, Segmented, StatusDot, StatusPill, TestBadge, cx } from "../../components/ui";
import { fmtPhone } from "../../lib/format";

const isConnected = (n: NumberView) => n.status === "WORKING" || n.status === "RESTRICTED";

export function NumbersAdmin() {
  const qc = useQueryClient();
  const numbersQ = useNumbers();
  const nums = numbersQ.data ?? [];
  const [adding, setAdding] = useState(false);
  const [pair, setPair] = useState<Record<number, string>>({});
  const [qr, setQr] = useState<Record<number, number>>({});
  const [connected, setConnected] = useState<Record<number, true>>({});
  const [simulate, setSimulate] = useState<NumberView | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Canlı akış qk.numbers'ı günceller: eşleştirilen numara WORKING olunca başarı paneli
  useEffect(() => {
    const done = nums.filter((n) => n.status === "WORKING" && (pair[n.id] !== undefined || qr[n.id] !== undefined));
    if (!done.length) return;
    setPair((p) => {
      const next = { ...p };
      for (const n of done) delete next[n.id];
      return next;
    });
    setQr((p) => {
      const next = { ...p };
      for (const n of done) delete next[n.id];
      return next;
    });
    setConnected((c) => {
      const next = { ...c };
      for (const n of done) next[n.id] = true;
      return next;
    });
    for (const n of done) {
      toast(`${n.label} bağlandı`, "ok");
      timers.current.push(
        setTimeout(() => setConnected((c) => {
          const next = { ...c };
          delete next[n.id];
          return next;
        }), 8000),
      );
    }
  }, [nums, pair, qr]);

  const requestPair = async (id: number) => {
    try {
      const { code } = await post<{ code: string }>(`/api/numbers/${id}/pair`);
      setPair((p) => ({ ...p, [id]: code }));
      setConnected((c) => {
        const next = { ...c };
        delete next[id];
        return next;
      });
    } catch (err) {
      showError(err);
    }
  };

  const refresh = async (n: NumberView) => {
    try {
      const { number } = await post<{ number: NumberView }>(`/api/numbers/${n.id}/refresh`);
      if (number) qc.setQueryData<NumberView[]>(qk.numbers, (list) => list?.map((x) => (x.id === n.id ? { ...x, ...number } : x)));
      if (qr[n.id] !== undefined) setQr((p) => ({ ...p, [n.id]: Date.now() }));
    } catch (err) {
      showError(err);
    }
  };

  const remove = async (n: NumberView) => {
    const ok = await confirmDialog({
      title: `"${n.label}" silinsin mi?`,
      message: `${fmtPhone(n.phone)} numarasının panel bağlantısı kaldırılır; sohbetleri panelden silinir ve telefondaki "Bağlı cihazlar" listesinden de çıkarılır. Telefondaki mesajlar etkilenmez.`,
      confirmText: "Numarayı sil",
      danger: true,
    });
    if (!ok) return;
    try {
      await del(`/api/numbers/${n.id}`);
      setPair((p) => {
        const next = { ...p };
        delete next[n.id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: qk.numbers });
      toast("Numara silindi", "ok");
    } catch (err) {
      showError(err);
    }
  };

  const openMore = (anchor: HTMLElement, n: NumberView) => {
    openMenu(anchor, [
      { label: qr[n.id] !== undefined ? "QR kodunu gizle" : "QR koduyla bağla", icon: "qr", disabled: isConnected(n), onSelect: () => setQr((p) => {
        const next = { ...p };
        if (next[n.id] !== undefined) delete next[n.id];
        else next[n.id] = Date.now();
        return next;
      }) },
      ...(n.provider === "mock" ? [{ label: "Gelen mesaj simüle et", icon: "message" as const, onSelect: () => setSimulate(n) }] : []),
      "sep",
      { label: "Numarayı sil", icon: "trash", danger: true, onSelect: () => void remove(n) },
    ], { align: "end", width: 230 });
  };

  const working = nums.filter(isConnected).length;
  return (
    <>
      <PageHead
        title="Numaralar"
        sub={numbersQ.isLoading ? "Yükleniyor…" : nums.length ? `${nums.length} numara · ${working} bağlı` : "Henüz numara yok"}
        actions={!adding && <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Numara ekle</Button>}
      />
      {adding && (
        <AddNumberForm
          onCancel={() => setAdding(false)}
          onCreated={async (number) => {
            setAdding(false);
            await qc.invalidateQueries({ queryKey: qk.numbers });
            if (number) await requestPair(number.id);
            toast("Numara eklendi", "ok");
          }}
        />
      )}
      {numbersQ.isError ? (
        <div className="panel"><BlockError message={`Numaralar yüklenemedi: ${errorMessage(numbersQ.error)}`} onRetry={() => void numbersQ.refetch()} /></div>
      ) : !numbersQ.isLoading && !nums.length ? (
        <div className="num-list">
          <EmptyBlock
            title="İlk WhatsApp numaranızı ekleyin"
            action={<Button variant="primary" icon="plus" onClick={() => setAdding(true)}>Numara ekle</Button>}
          >
            Eklediğiniz numaraya gelen mesajlar ekibin gelen kutusuna düşer. Kimin hangi numarayı göreceğini Kullanıcılar'dan ayarlarsınız.
          </EmptyBlock>
        </div>
      ) : (
        <div className="num-list">
          {nums.map((n) => (
            <NumberCard
              key={n.id}
              n={n}
              code={pair[n.id]}
              qrStamp={qr[n.id]}
              justConnected={Boolean(connected[n.id])}
              onPair={() => requestPair(n.id)}
              onRefresh={() => refresh(n)}
              onMore={(el) => openMore(el, n)}
            />
          ))}
        </div>
      )}
      {simulate && <SimulateDialog number={simulate} onClose={() => setSimulate(null)} />}
    </>
  );
}

function NumberCard({ n, code, qrStamp, justConnected, onPair, onRefresh, onMore }: {
  n: NumberView;
  code: string | undefined;
  qrStamp: number | undefined;
  justConnected: boolean;
  onPair: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onMore: (el: HTMLElement) => void;
}) {
  const connected = isConnected(n);
  const [busy, setBusy] = useState<"pair" | "refresh" | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => setQrFailed(false), [qrStamp]);
  const run = async (kind: "pair" | "refresh", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  return (
    <article className={cx("panel num-card", !connected && "needs-action")}>
      <div className="num-row">
        <StatusDot status={n.status} />
        <div className="num-ident">
          <h2 className="h3">{n.label} {n.provider === "mock" && <TestBadge />}</h2>
          <p className="muted num">{fmtPhone(n.phone)}</p>
        </div>
        <StatusPill status={n.status} />
        <div className="num-actions">
          {!connected && (
            <Button size="sm" icon="key" disabled={busy === "pair"} onClick={() => void run("pair", onPair)}>
              {code ? "Yeni kod al" : "Eşleştirme kodu al"}
            </Button>
          )}
          <IconButton icon="refresh" label="Durumu yenile" disabled={busy === "refresh"} onClick={() => void run("refresh", onRefresh)} />
          <IconButton icon="more" label="Diğer işlemler" aria-haspopup="menu" onClick={(e) => onMore(e.currentTarget)} />
        </div>
      </div>
      {n.status === "RESTRICTED" && (
        <div className="num-notice">
          <Icon name="lock" size={16} />
          <p>WhatsApp bu numarayı geçici olarak kısıtladı. Gelen mesajlar akmaya devam ediyor; panelden gönderim 24 saat durduruldu.</p>
        </div>
      )}
      {justConnected ? (
        <div className="pair-done">
          <Icon name="check" size={18} />
          <div>
            <p className="pair-done-title">Bağlandı</p>
            <p className="muted">Bu numaraya gelen mesajlar artık gelen kutusuna düşüyor.</p>
          </div>
        </div>
      ) : code && !connected ? (
        <PairPanel code={code} />
      ) : null}
      {qrStamp !== undefined && !connected && (
        <div className="qr-panel">
          {qrFailed ? (
            <p className="muted">QR kodu alınamadı. Numara zaten bağlı olabilir; durumu yenileyin.</p>
          ) : (
            <img className="qr-img" alt={`${n.label} için QR kodu`} src={`/api/numbers/${n.id}/qr?t=${qrStamp}`} width={220} height={220} onError={() => setQrFailed(true)} />
          )}
          <div>
            <p className="h3">QR koduyla bağlama</p>
            <p className="muted">Telefonda WhatsApp › Ayarlar › Bağlı cihazlar › Cihaz bağla, sonra bu kodu okutun. Kod kısa sürede yenilenir; okunmazsa yenile düğmesine basın.</p>
          </div>
        </div>
      )}
    </article>
  );
}

function PairPanel({ code }: { code: string }) {
  const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast("Kod kopyalandı", "ok");
    } catch {
      toast("Kopyalanamadı; kodu elle girin", "error");
    }
  };
  return (
    <div className="pair">
      <div className="pair-code-wrap">
        <p className="pair-label">Eşleştirme kodu</p>
        <p className="pair-code" aria-label={`Eşleştirme kodu ${code.split("").join(" ")}`}>{pretty}</p>
        <div className="pair-wait">
          <span className="spinner" aria-hidden="true" />
          <span>Telefonda girilmesi bekleniyor…</span>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>Kopyala</Button>
        </div>
      </div>
      <ol className="pair-steps">
        <li>Telefonda WhatsApp'ı açın.</li>
        <li>Ayarlar › Bağlı cihazlar'a girin.</li>
        <li>Cihaz bağla'ya dokunun.</li>
        <li>Alttaki "Bunun yerine telefon numarasıyla bağlan" bağlantısına dokunun.</li>
        <li>Bu kodu girin: <strong className="num">{pretty}</strong>. Bağlanınca bu ekran kendiliğinden güncellenir.</li>
      </ol>
    </div>
  );
}

function AddNumberForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (n: NumberView | undefined) => Promise<void> }) {
  const config = useConfig().data;
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<ProviderKind | null>(null);
  const [busy, setBusy] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => labelRef.current?.focus(), []);
  const chosen: ProviderKind = provider ?? config?.defaultProvider ?? "baileys";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !phone.trim()) {
      toast("Etiket ve telefon gerekli", "error");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, string> = { label: label.trim(), phone: phone.trim() };
      if (config?.mockAllowed) body.provider = chosen;
      const { number } = await post<{ number: NumberView }>("/api/numbers", body);
      await onCreated(number);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel add-number" onSubmit={(e) => void submit(e)}>
      <div className="panel-head">
        <h2 className="h2">Yeni numara</h2>
        <p className="panel-sub">Numara sunucuya bağlı cihaz olarak eklenir. Telefon yanınızda olsun; sonraki adımda eşleştirme kodu çıkar.</p>
      </div>
      {config?.mockAllowed && (
        <div className="form-row add-provider">
          <div className="field">
            <span className="field-label">Tür</span>
            <Segmented
              label="Numara türü"
              value={chosen}
              onChange={setProvider}
              options={[{ value: "baileys", label: "Gerçek WhatsApp" }, { value: "mock", label: "Test numarası" }]}
            />
            <p className="field-hint">{chosen === "mock" ? "Test numarasının mesajları WhatsApp'a gitmez; denemek içindir." : "Telefondaki WhatsApp hesabı bağlı cihaz olarak eklenir."}</p>
          </div>
        </div>
      )}
      <div className="form-row">
        <Field label="Etiket" hint="Ekipte görünen ad, örn. Satış, Destek">
          {(id) => <input ref={labelRef} id={id} className="input" required placeholder="Satış" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />}
        </Field>
        <Field label="Telefon" hint="Ülke koduyla, boşluksuz">
          {(id) => <input id={id} className="input" required inputMode="tel" placeholder="905551234567" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />}
        </Field>
      </div>
      <div className="form-actions">
        <Button onClick={onCancel}>Vazgeç</Button>
        <Button type="submit" variant="primary" disabled={busy}>{chosen === "mock" && config?.mockAllowed ? "Ekle" : "Ekle ve eşleştir"}</Button>
      </div>
    </form>
  );
}

function SimulateDialog({ number, onClose }: { number: NumberView; onClose: () => void }) {
  const [from, setFrom] = useState("905551234567");
  const [name, setName] = useState("Test Müşteri");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!from.trim() || !text.trim()) {
      setErr("Numara ve mesaj gerekli.");
      return;
    }
    setBusy(true);
    try {
      await post("/api/dev/inbound", { numberId: number.id, from: from.trim(), name: name.trim(), text: text.trim() });
      toast("Test mesajı gelen kutusuna düştü", "ok");
      onClose();
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`Gelen mesaj simüle et · ${number.label}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Vazgeç</Button>
          <Button type="submit" form="simulate-form" variant="primary" icon="send" disabled={busy}>Gönder</Button>
        </>
      }
    >
      <form id="simulate-form" className="form-stack" onSubmit={(e) => void submit(e)}>
        <p className="dlg-lead">Test numarasına müşteriden mesaj gelmiş gibi davranır; WhatsApp'a hiçbir şey gitmez.</p>
        <Field label="Kimden (numara)" hint="Ülke koduyla, boşluksuz">
          {(id) => <input id={id} className="input" inputMode="tel" autoComplete="off" value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label="Ad">
          {(id) => <input id={id} className="input" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Mesaj">
          {(id) => <textarea id={id} className="input textarea" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        {err && <p className="form-error" role="alert">{err}</p>}
      </form>
    </Dialog>
  );
}
