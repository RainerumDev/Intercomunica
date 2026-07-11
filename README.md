# Intercomunica — Rainerum

Applicazione web per l'orchestrazione di Google Calendar, la gestione di sottogruppi di docenti, l'invio mirato di comunicazioni email e una bacheca eventi dinamica.

## Stack

| Livello | Tecnologia |
|---|---|
| Backend | Node.js 22 · TypeScript · Express · Prisma |
| Frontend | React 18 · Vite · Tailwind CSS 4 · FullCalendar |
| Database | PostgreSQL 16 |
| Google | OAuth 2.0 · Directory API · Calendar API · Gmail API |

## Architettura in breve

- L'app collega un **account master** (es. `comunicazione@rainerum.it`) via OAuth offline; il refresh token è cifrato (AES-256-GCM) nel database.
- Per ogni docente del Google Group principale (es. `docenti@rainerum.it`) l'app crea un **calendario dedicato** nell'account master e lo condivide in **sola lettura** con il docente. L'app è l'unico orchestratore con permessi di scrittura.
- Gli eventi creati dalla presidenza vengono **iniettati** nei calendari dei docenti appartenenti ai sottogruppi selezionati, con `extendedProperties.private` che trasporta i metadati (ID evento app, sottogruppi, TAG).
- Gli eventi con flag **«Visibile a tutti»** non vengono iniettati nei calendari: vivono solo nel database e compaiono in bacheca per tutti.
- La **bacheca** mostra, per ogni TAG, i primi 3 impegni imminenti visibili al docente (eventi dei suoi sottogruppi + eventi globali).
- Le **email** ai sottogruppi partono dall'account master via Gmail API, con `Reply-To` impostato al docente che scrive; selettore A:/CCN: (default A:).

## Setup sviluppo

### 1. Prerequisiti
- Node.js ≥ 22, Docker (per PostgreSQL)
- Un progetto su [Google Cloud Console](https://console.cloud.google.com) del workspace dell'istituto

### 2. Google Cloud Console
1. Abilita le API: **Google Calendar API**, **Cloud Identity API**, **Gmail API** (opz. **Admin SDK API**, vedi sotto).
2. Crea credenziali **OAuth client ID** (tipo *Web application*) con redirect URI:
   - `http://localhost:3000/api/auth/google/callback`
   - `http://localhost:3000/api/admin/master/callback`
3. **Lettura membri del gruppo — senza ruolo admin.** L'app usa la **Cloud Identity API**: basta che l'account master possa vedere i membri del gruppo (impostazione del gruppo *«Chi può visualizzare i membri»*, es. tutta l'organizzazione). Non serve che sia membro né amministratore.
4. **Elenco gruppi del dominio (opzionale).** Il menu a tendina "Carica gruppi del dominio" usa l'Admin SDK e richiede un ruolo delegato con privilegio **Admin API → Gruppi → Lettura**. Senza ruolo si usa l'inserimento manuale dell'email del gruppo nelle Impostazioni (equivalente).

### 3. Configurazione
```bash
cp server/.env.example server/.env
# compila GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET
# ENCRYPTION_KEY: openssl rand -hex 32
# ADMIN_EMAILS: email di presidenza/direzione separate da virgola
# ALLOWED_EMAIL_DOMAIN: limita il login al dominio della scuola (consigliato)
```

### 4. Avvio
```bash
docker compose up -d          # PostgreSQL
npm install
npm run prisma:push --workspace server   # crea lo schema DB
npm run dev                   # server :3000 + web :5173
```

Apri <http://localhost:5173>, accedi con un account presente in `ADMIN_EMAILS`, poi da **Impostazioni**: collega l'account master → seleziona il gruppo docenti → **Sincronizza / Refresh**.

## Comandi utili

```bash
npm run typecheck   # entrambi i workspace
npm test            # unit test server (vitest)
npm run build       # build produzione
```

## Struttura

```
server/
  prisma/schema.prisma   # dominio completo (incl. modelli WIP)
  src/
    auth/                # sessione JWT, ruoli
    google/              # oauth, directory, calendar, gmail
    services/            # sync, eventi, bacheca
    routes/              # REST API
web/
  src/pages/             # Bacheca, Directory, Calendario, Impostazioni, Login
  src/components/        # EventModal, EmailComposer
```

## Sezioni future (predisposte, non attive)

- **WIP A** — Anagrafica studenti/famiglie: modelli `Student`/`Guardian`, endpoint `/api/wip/students`. Invio massivo con default **CCN:** per privacy.
- **WIP B** — Compleanni/onomastici: campi `birthDate`/`nameDay`, widget `/api/wip/birthdays/today`, feed RSS protetto `/api/wip/birthdays/rss?token=…` per digital signage.
- **WIP C** — Import orario: endpoint `POST /api/wip/timetable/import` (JSON/CSV da Untis/EDT), modello `TimetableImport`.
