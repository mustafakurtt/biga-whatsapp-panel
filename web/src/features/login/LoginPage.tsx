// Giriş ekranı: solda form, sağda ürünün kendi ekranından statik bir kesit.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { post } from "../../api/client";
import type { Me } from "../../api/types";
import { BrandMark, Icon, Wordmark } from "../../components/Icon";
import { cx } from "../../components/ui";

export function LoginPage({ onLoggedIn, message }: { onLoggedIn: (me: Me) => void; message?: string | null }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(message ?? "");
  const [busy, setBusy] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Giriş · Biga Panel";
    userRef.current?.focus();
  }, []);
  useEffect(() => setError(message ?? ""), [message]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("Kullanıcı adı ve şifre gerekli");
      (username.trim() ? passRef : userRef).current?.focus();
      return;
    }
    setBusy(true);
    try {
      const me = await post<Me>("/api/auth/login", { username: username.trim(), password });
      setPassword("");
      onLoggedIn(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      passRef.current?.select();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <main className="login-card">
        <div className="login-brand">
          <BrandMark size={36} />
          <Wordmark className="wordmark login-wordmark" />
        </div>
        <h1 className="login-title">Ekip gelen kutusuna giriş</h1>
        <p className="login-sub">Şirketin WhatsApp numaralarına gelen müşteri mesajları tek yerde.</p>
        <form className="login-form" noValidate onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="login-user">Kullanıcı adı</label>
            <input ref={userRef} id="login-user" className="input" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="login-pass">Şifre</label>
            <input ref={passRef} id="login-pass" className="input" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className={cx("btn btn-primary btn-lg login-submit", busy && "is-busy")} disabled={busy}>
            <span>Giriş yap</span>
          </button>
        </form>
      </main>
      <aside className="login-side" aria-hidden="true">
        <LoginPreview />
      </aside>
    </div>
  );
}

// Statik örnek: gerçek veri değildir.
function LoginPreview() {
  const Row = ({ name, text, time, unread, who }: { name: string; text: string; time: string; unread?: number; who?: [string, number] }) => (
    <div className="lp-row">
      <span className="avatar avatar-md avatar-neutral">{name.split(" ").map((p) => p[0]).join("")}</span>
      <div className="lp-main">
        <div className="lp-line"><strong>{name}</strong><span className="lp-time">{time}</span></div>
        <div className="lp-line">
          <span className="lp-text">{text}</span>
          {unread ? <span className="count">{unread}</span> : null}
          {who ? <span className={`avatar avatar-xs avatar-h${who[1]}`}>{who[0]}</span> : null}
        </div>
      </div>
    </div>
  );
  return (
    <div className="lp" data-ui="">
      <div className="lp-head"><Icon name="inbox" size={16} /><span>Satış hattı</span><span className="pill pill-ok">Bağlı</span></div>
      <Row name="Elif Yıldız" text="Siparişim kargoya verildi mi?" time="14:32" unread={2} />
      <Row name="Kemal Arslan" text="Fiyat teklifini aldım, teşekkürler" time="13:05" who={["AY", 1]} />
      <Row name="Derya Koç" text="Cumartesi açık mısınız?" time="Dün" unread={1} who={["MK", 3]} />
      <div className="lp-bubble lp-in">Merhaba, 42 numara stokta var mı?</div>
      <div className="lp-bubble lp-out"><span className="lp-who">Ayşe</span><span>Var, bugün kargoya verebiliriz.</span></div>
    </div>
  );
}
