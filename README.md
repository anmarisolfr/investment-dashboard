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

## Cómo correr el servidor localmente (opcional)

```bash
node server.js
```

Verás:
```
Servidor corriendo en http://localhost:3001
```

Prueba: `http://localhost:3001/quote?ticker=VOO`

---

## Despliegue en producción

### Backend — Railway
1. Sube `server.js` y `package.json` a GitHub
2. Railway detecta los cambios y despliega automático
3. URL del servidor: `https://investment-dashboard-production-4493.up.railway.app`

### Frontend — Vercel
1. Sube `dashboard.html` a GitHub
2. Vercel despliega automático en ~30 segundos

---

## Servicios conectados

| Servicio | Para qué se usa |
|----------|----------------|
| Yahoo Finance | Precios, RSI, medias móviles en tiempo real |
| Supabase | Autenticación de usuarios, perfiles, watchlist, historial |
| Resend | Envío de emails (confirmación y recuperar contraseña) |
| Railway | Servidor Node.js en la nube |
| Vercel | Hosting del dashboard HTML |

---

## Qué calcula el servidor

| Indicador | Descripción |
|-----------|-------------|
| Precio actual | Dato en tiempo real de Yahoo Finance |
| Cambio % diario | Comparado con el cierre anterior |
| RSI (14 días) | Índice de fuerza relativa estándar |
| MA50 | Media móvil simple de 50 días |
| MA100 | Media móvil simple de 100 días |
| MA200 | Media móvil simple de 200 días |
| Señal | Calculada combinando las medias y el RSI |

## Lógica de señales

- **Momento favorable**: precio sobre MA50, MA100 y MA200 + RSI entre 40 y 69
- **Alta precaución**: RSI mayor o igual a 70 O precio bajo MA200
- **Esperar señal**: cualquier otro caso

---

## Notas
- El servidor no requiere `npm install` — usa solo módulos nativos de Node.js.
- Los datos de usuario se guardan en Supabase y persisten entre sesiones desde cualquier dispositivo.
- Para recuperar contraseña y confirmación de registro funcionen, Resend debe estar configurado en Supabase.
