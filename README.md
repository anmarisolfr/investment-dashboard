# Dashboard de inversión — Instrucciones

## Requisitos
- Node.js instalado (https://nodejs.org)
- No necesitas instalar ningún paquete adicional

## Cómo arrancar

### 1. Inicia el servidor
Abre una terminal en la carpeta donde guardaste los archivos y ejecuta:

```bash
node server.js
```

Verás este mensaje:
```
Servidor corriendo en http://localhost:3001
Prueba: http://localhost:3001/quote?ticker=VOO
```

### 2. Abre el dashboard
Abre el archivo `dashboard.html` directamente en tu navegador.
(doble clic o arrástralo al navegador)

### 3. Busca cualquier ticker
Escribe VOO, SPY, AAPL o cualquier ticker de Yahoo Finance y presiona Buscar.

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

- **Comprar**: precio sobre MA50, MA100 y MA200 + RSI entre 40 y 69
- **Precaución**: RSI mayor o igual a 70 (sobrecompra) O precio bajo MA200
- **Esperar**: cualquier otro caso

## Notas
- Yahoo Finance puede limitar peticiones muy frecuentes. Uso normal (pocas búsquedas por minuto) funciona sin problema.
- El servidor solo usa módulos nativos de Node.js, sin npm install.
- Para usarlo en red local, cambia `localhost` por la IP de tu máquina en `dashboard.html`.
