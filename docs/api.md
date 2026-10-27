# API sözleşmesi

Tüm yanıtlar JSON. Hata: `{ "error": "<Türkçe mesaj>" }` ve uygun durum kodu (400, 401, 403, 404, 502).
Kimlik: `POST /api/auth/login` httpOnly `session` çerezi koyar; sonraki istekler çerezle gelir.
Roller: `patron` (her şey), `temsilci` (atandığı numaralar, yazabilir), `salt_okunur` (atandığı numaralar, sadece okur).

| Yöntem | Yol | Kim | Gövde | Yanıt |
| --- | --- | --- | --- | --- |
| POST | /api/auth/login | herkes | `{username,password}` | `{user}` |
| POST | /api/auth/logout | giriş yapmış | — | `{ok:true}` |
| GET | /api/auth/me | giriş yapmış | — | `{user}` (`user = {id,username,name,role}`) |
| GET | /api/numbers | giriş yapmış | — | `{numbers:[{id,label,phone,status,me_id}]}` (görebildikleri) |
| POST | /api/numbers | patron | `{label,phone}` | `{number}` (WAHA oturumu da açılır) |
| POST | /api/numbers/:id/pair | patron | — | `{code}` (8 haneli eşleştirme kodu) |
| GET | /api/numbers/:id/qr | patron | — | PNG resim (yedek bağlanma yolu) |
| POST | /api/numbers/:id/refresh | patron | — | `{number}` (durum sağlayıcıdan tazelenir) |
| DELETE | /api/numbers/:id | patron | — | `{ok:true}` |
| GET | /api/numbers/:id/chats | numarayı gören | — | `{chats:[ChatRow]}` son mesaja göre yeni→eski |
| POST | /api/numbers/:id/chats | yazabilen | `{phone,text}` | `{chat}` yeni sohbet başlatır ve ilk mesajı gönderir |
| GET | /api/chats/:id/messages | sohbeti gören | `?before=<ts>` ops. | `{messages:[MessageRow & {sent_by_name}]}` eski→yeni, en fazla 100 |
| POST | /api/chats/:id/messages | yazabilen | `{text}` | `{ok:true}` |
| POST | /api/chats/:id/read | sohbeti gören | — | `{ok:true}` okunmamış sayısı sıfırlanır |
| GET | /api/users | patron | — | `{users:[{id,username,name,role,numberIds:[]}]}` |
| POST | /api/users | patron | `{username,name,password,role,numberIds}` | `{user}` |
| PUT | /api/users/:id | patron | `{name?,password?,role?,numberIds?}` | `{user}` |
| DELETE | /api/users/:id | patron | — | `{ok:true}` (kendini silemez) |
| GET | /api/events | giriş yapmış | — | SSE akışı; her olay `data: <LiveEvent JSON>` |
| GET | /api/push/key | giriş yapmış | — | `{publicKey}` (boşsa push kapalı) |
| POST | /api/push/subscribe | giriş yapmış | PushSubscription JSON | `{ok:true}` |
| POST | /api/push/unsubscribe | giriş yapmış | `{endpoint}` | `{ok:true}` |
| POST | /api/dev/inbound | patron, sadece PROVIDER=mock | `{numberId,from,name,text}` | `{ok:true}` sahte gelen mesaj |
| POST | /webhooks/waha | WAHA | WAHA olayı | `{ok:true}` (HMAC: `X-Webhook-Hmac`, sha512) |

`LiveEvent` (src/shared/types.ts):

- `{type:"message", numberId, chat, message}`: `message.source` = `contact` (müşteri), `phone` (telefondan), `panel` (panelden; `sent_by_name` dolu).
- `{type:"number_status", numberId, status}`: `WORKING`, `SCAN_QR_CODE`, `FAILED`, `STOPPED`, `STARTING`.

Push bildirimi: `{title, body, url}`; `url` = `/?chat=<chatId>`.
