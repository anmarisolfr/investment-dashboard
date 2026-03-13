# AD Market Signal — Instrucciones

## Requisitos
- Node.js instalado (https://nodejs.org)
- Cuenta en Railway (servidor backend) — railway.app
- Cuenta en Vercel (frontend) — vercel.com
- Cuenta en Supabase (base de datos y autenticación) — supabase.com
- Cuenta en Resend (envío de emails) — resend.com

## Archivos del proyecto

| Archivo | Descripción |
|---------|-------------|
| `server.js` | Servidor backend — corre en Railway |
| `dashboard.html` | Frontend — corre en Vercel |
| `package.json` | Configuración de Node.js para Railway |

---

## Despliegue en producción

### Backend — Railway
1. Sube `server.js` y `package.json` a GitHub
2. Railway detecta cambios y despliega automático
3. URL: `https://investment-dashboard-production-4493.up.railway.app`

### Frontend — Vercel
1. Sube `dashboard.html` a GitHub
2. Vercel despliega automático en ~30 segundos

---

## Servicios conectados

| Servicio | Para qué se usa |
|----------|----------------|
| Yahoo Finance | Precios, RSI, medias móviles, soporte/resistencia en tiempo real |
| Supabase | Autenticación, perfiles, watchlist e historial |
| Resend | Emails de confirmación y recuperación de contraseña |
| Railway | Servidor Node.js en la nube |
| Vercel | Hosting del dashboard HTML |

---

## Qué calcula el servidor

Todos los cálculos usan `interval=1d&range=1y` — un año de datos con velas diarias.

| Indicador | Descripción |
|-----------|-------------|
| Precio actual | Tiempo real de Yahoo Finance (`regularMarketPrice`) |
| Cambio % diario | `regularMarketChangePercent` de Yahoo Finance |
| RSI (14 días) | Índice de fuerza relativa estándar |
| MA50 / MA100 / MA200 | Medias móviles simples |
| Score (0-100) | Tendencia + Momentum + Riesgo + Dividendos |
| Dividend Yield | Extraído de Yahoo Finance v11 |
| Soporte | Zona donde el precio ha rebotado históricamente |
| Resistencia | Zona donde el precio se ha frenado históricamente |

---

## Lógica de señales (frontend)

Basada en estrategia de compras escalonadas en medias móviles:

- 🟢 **Zona de entrada fuerte** — precio cerca de MA200 (±3%) → usar 50% del capital
- 🟢 **Zona de entrada media** — precio cerca de MA100 (±3%) → usar 30% del capital
- 🟡 **Posible entrada inicial** — precio cerca de MA50 (±3%) → usar 20% del capital
- 🟡 **Observar** — precio por encima de las 3 medias, esperar corrección
- 🔴 **Precaución** — RSI ≥ 70 (sobrecomprado) o precio bajo MA200

---

## Lógica del Score (0-100)

| Componente | Puntos | Regla |
|------------|--------|-------|
| Tendencia | 40 pts | Precio > MA200 = +20, > MA100 = +10, > MA50 = +10 |
| Momentum RSI | 25 pts | RSI 40-60 = +15, RSI 30-40 = +10, RSI <30 = +8, RSI >70 = +5 |
| Riesgo vs MA200 | 20 pts | ±5% = +20, 5-10% sobre = +15, 10-15% = +12, >15% = +10, bajo = +5 |
| Dividendos | 15 pts | Yield ≥3% = +15, ≥2% = +10, ≥1% = +5 |

**Interpretación:**
- Score 70+ → precio subiendo, aún no es zona de entrada
- Score 50-70 → zona media, puede estar acercándose a una media
- Score 40-50 → precio bajando hacia promedios, posible zona de entrada
- Score -40 → muy por debajo de promedios, entrada agresiva o esperar confirmación

---

## Plan de entrada escalonado

El usuario ingresa su capital y la app calcula cuánto invertir en cada nivel:

- MA50 → 20% del capital (entrada inicial)
- MA100 → 30% del capital (entrada media)
- MA200 → 50% del capital (entrada principal)

---

## Lógica de Soporte y Resistencia

Usa historial completo de 365 días (highs y lows de Yahoo Finance).

- **Dónde comprar**: mínimos locales donde el precio rebotó al menos 2.5%, respetado mínimo 2 veces. Zona de ±1.5%.
- **Dónde tener cuidado**: máximos locales donde el precio cayó al menos 2.5%, respetado mínimo 2 veces. Zona de ±1.5%.

---

## Portafolios — 9 combinaciones (6 ETFs + 2 Stocks)

| Perfil | Horizonte | ETFs | Stocks |
|--------|-----------|------|--------|
| Conservador | Corto | SPY, SCHD, VYM, IEF, GLD, BSV | KO, JNJ |
| Conservador | Medio | VOO, SCHD, VYM, SPMO, GLD, VIG | PG, KO |
| Conservador | Largo | VOO, VTI, SCHD, VEA, SPMO, VIG | AAPL, JNJ |
| Moderado | Corto | SPY, QQQM, SCHD, SPMO, GLD, RSP | AAPL, MSFT |
| Moderado | Medio | VOO, QQQM, SCHG, VEA, SPMO, VNQ | AAPL, MSFT |
| Moderado | Largo | VOO, VTI, QQQM, VEA, VNQ, SCHG | AAPL, MSFT |
| Agresivo | Corto | QQQM, SCHG, SPMO, SOXX, VGT, ARKK | NVDA, AAPL |
| Agresivo | Medio | QQQ, QQQM, SOXX, SCHG, VWO, IWF | NVDA, META |
| Agresivo | Largo | QQQ, VGT, SOXX, IWF, VWO, ARKK | NVDA, META |

---

## Base de datos Supabase

### SQL inicial
```sql
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text, age_range text, investor_profile text, horizon text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  ticker text not null, name text,
  source text default 'watchlist',
  ticker_slot text,
  added_at timestamptz default now()
);

create table search_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  ticker text not null, name text, price numeric, signal text,
  searched_at timestamptz default now()
);

alter table profiles enable row level security;
alter table watchlist enable row level security;
alter table search_history enable row level security;

create policy "Usuario ve su perfil" on profiles for all using (auth.uid() = id);
create policy "Usuario ve su watchlist" on watchlist for all using (auth.uid() = user_id);
create policy "Usuario ve su historial" on search_history for all using (auth.uid() = user_id);

-- Índices únicos para watchlist
ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_user_id_ticker_key;
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_slot_unique
  ON watchlist(user_id, ticker_slot) WHERE ticker_slot IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_ticker_source_unique
  ON watchlist(user_id, ticker, source) WHERE ticker_slot IS NULL;
```

---

## Funcionalidades completas

### Buscar
- Precio actual y % de cambio del día
- Decisión principal 🟢🟡🔴 con descripción en español y barra de confianza
- Zonas históricas del precio: dónde comprar y dónde tener cuidado
- Tendencia del precio: largo plazo y movimiento reciente
- Impulso del precio: barra RSI con texto simple
- Gráfico de 60 días con MA50/MA100/MA200
- Botón para abrir gráfica en Yahoo Finance
- Plan de entrada escalonado con capital personalizado
- Guardar en watchlist

### Watchlist
- Tabla: Activo, Score, RSI, Señal, Precio, Posición SMA
- Leyenda explicativa de Score y RSI
- Clic en fila abre Yahoo Finance
- Botón actualizar, alertas automáticas, eliminar por activo

### Historial
- Últimas 30 búsquedas con fecha, hora, precio y señal
- Botón 🗑 Borrar historial

### Mi perfil
- Wizard 3 preguntas: edad, horizonte, tolerancia al riesgo
- Portafolio de 6 ETFs + 2 stocks según perfil
- Botón ✏️ Cambiar por activo (verifica en Yahoo Finance)
- Botón + Agregar por activo
- Análisis del portafolio: estado general, lista individual con precio/señal/score, oportunidades de entrada, alertas

### General
- Modo oscuro / claro
- Barra de estado del mercado americano
- Autenticación: registro, login, recuperación de contraseña
- Todo persiste en Supabase entre sesiones y dispositivos
- Íconos ? con explicaciones en español en todos los indicadores

---

## Notas
- El servidor no requiere `npm install` — usa solo módulos nativos de Node.js.
- Para emails: Supabase → Settings → Authentication → SMTP → Resend (host: smtp.resend.com, port: 465, user: resend).
