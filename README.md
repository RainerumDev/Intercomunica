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

## Deploy produzione con Docker

Sul VPS, clona il repository alla revisione da distribuire. Nginx Proxy Manager deve essere già collegato a una rete Docker bridge condivisa: imposta `PROXY_NETWORK` nel file di configurazione al nome di quella rete (il template usa l'esempio `nginx-proxy-manager_default`). La rete deve esistere prima dell'avvio; questo stack non la crea. Inserisci poi valori reali per tutte le credenziali e per `PUBLIC_URL` (l'hostname HTTPS pubblico):

```bash
cp .env.production.example .env.production
chmod 600 .env.production
docker compose --env-file .env.production up --build -d --wait
docker compose --env-file .env.production ps
curl --fail http://127.0.0.1:3000/api/health
```

Il comando `ps` deve riportare `app` e `db` come `healthy`; l'health check deve confermare anche il database. PostgreSQL non espone porte sul VPS. Configura Nginx Proxy Manager con schema `http`, host di inoltro `intercomunica` e porta `3000` per l'hostname pubblico. L'app mantiene `127.0.0.1:3000` solo per la diagnostica locale sul VPS. Il supporto WebSocket non è richiesto. Mantieni HTTPS attivo nel proxy e registra in Google Cloud Console questi redirect URI, sostituendo `${PUBLIC_URL}` con il valore HTTPS configurato:

```text
${PUBLIC_URL}/api/auth/google/callback
${PUBLIC_URL}/api/admin/master/callback
```

### Aggiornamenti e log

Prima di aggiornare, verifica di essere sulla revisione prevista. Le migrazioni Prisma vengono applicate all'avvio dell'applicazione:

```bash
git pull --ff-only
docker compose --env-file .env.production up --build -d --wait
docker compose --env-file .env.production logs --tail=200 app
```

Controlla poi `docker compose --env-file .env.production ps` e `curl --fail http://127.0.0.1:3000/api/health`.

### Backup e ripristino del database

Esegui un backup logico prima di ogni aggiornamento che coinvolga dati o migrazioni. Le variabili PostgreSQL sono risolte **all'interno** del container `db`, perché `--env-file` non le esporta alla shell dell'host:

```bash
docker compose --env-file .env.production exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "intercomunica-$(date +%F).dump"
```

**Non eseguire un ripristino finché non hai:** fermato `app`, verificato che il database di destinazione sia esplicitamente quello previsto e sia vuoto/scartabile, e creato un backup corrente. Il ripristino sostituisce gli oggetti esistenti; usa questi comandi solo dopo tali verifiche:

```bash
docker compose --env-file .env.production stop app
docker compose --env-file .env.production exec -T db \
  sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < intercomunica-YYYY-MM-DD.dump
docker compose --env-file .env.production start app
```

### Rollback applicazione

Per tornare indietro con l'applicazione, passa a un tag o commit Git precedente e ricostruisci lo stack:

```bash
git checkout <tag-o-commit-precedente>
docker compose --env-file .env.production up --build -d --wait
```

Il rollback del database non è automatico. Una release con una migrazione distruttiva richiede un piano di ripristino del database verificato **prima** del deploy.

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
