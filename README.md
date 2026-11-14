# ⚔️ Tierras Sin Fin Online

RPG de exploración infinita para jugar desde el celular con amigos (pensado para 2, soporta hasta 4 por sala).
Cada jugador explora por su cuenta dentro del **mismo mundo**: se ven en el mapa, saben dónde está el otro,
se mandan mensajes rápidos y marcan lugares. Cada uno pelea sus propios combates.

- **Servidor:** Node.js 20+ con Express + Socket.io (un solo proceso; sirve los archivos y el websocket).
- **Cliente:** HTML + CSS + JavaScript con ES modules nativos, sin frameworks ni build.
- **Guardado:** siempre en el celular (`localStorage`). Si se configura `DATABASE_URL` (Neon), además se
  guarda en el servidor y se puede seguir jugando desde otro celular (ver "Guardado en servidor con Neon").

## Cómo correrlo localmente

```bash
npm install
npm start
```

Abre <http://localhost:3000>. El puerto se puede cambiar con la variable `PORT`.

## Cómo probar con 2 pestañas

1. Abre <http://localhost:3000> en dos pestañas (o en una normal y una de incógnito, para que no compartan el guardado).
2. En la primera: escribe un nombre → **Crear sala nueva**. Aparece un código de 4 letras (ej. `KTRX`).
3. En la segunda: otro nombre → escribe el código → **Unirse**.
4. Elijan héroes y **Comenzar aventura** en las dos.
5. Muévete en una pestaña (WASD o flechas) y mira la otra: el personaje del amigo se mueve suavizado.
   Si se aleja, aparece una **flecha en el borde** con su nombre y distancia.
6. Botón **💬 Sala** (o tecla `C`): lista de jugadores, mensajes rápidos y **📍 Marcar aquí**.
7. Para probar la reconexión: detén el servidor (`Ctrl+C`) — el indicador pasa a 🟡 y el juego sigue —
   y vuelve a levantarlo con `npm start`: en unos segundos vuelve a 🟢 y se reencuentran.

## Cómo probar desde el celular (misma red wifi)

1. Busca la IP del computador:
   - Windows: `ipconfig` → "Dirección IPv4" (ej. `192.168.1.50`).
   - macOS / Linux: `ipconfig getifaddr en0` o `hostname -I`.
2. Con `npm start` corriendo, abre en el celular `http://192.168.1.50:3000` (con tu IP).
3. Si no carga, permite Node.js en el firewall de Windows (red privada).
4. Opcional: en el navegador del celular, menú → **Agregar a pantalla de inicio** para abrirlo a pantalla completa.

## Deploy en Render (gratis)

1. Sube este repositorio a GitHub.
2. En <https://render.com>: **New → Web Service** → conecta el repositorio `tierras-sin-fin`.
3. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - **Variables de entorno:** ninguna obligatoria (Render pone `PORT` solo).
   - (Opcional) **Health Check Path:** `/healthz`
4. **Create Web Service**. Cuando termine, comparte la URL `https://<tu-servicio>.onrender.com` con tu amigo.

> En el plan gratis el servicio se "duerme" tras ~15 minutos sin uso; la primera visita puede tardar ~1 minuto
> en despertar. Las salas en memoria se pierden al dormir o reiniciar, **pero el mundo no**: la semilla sale del
> código de sala y cada jugador tiene su progreso guardado en su celular. Al volver a entrar con el mismo código
> y nombre, la sala se recrea sola.

## Cómo se juega

- **Moverse:** WASD / flechas, o la cruceta en pantalla (mantén presionado; puedes deslizar el dedo para cambiar de dirección).
- **G** grupo · **M** mapa · **C** sala y mensajes · Combate: toca las opciones o teclas 1–9.
- Al morir todo el grupo se vuelve a empezar desde nivel 1 en Villa Origen (ver "Reglas de la Etapa 2").
- Aldeas 🏘️: posada (guarda), tienda, herrería y taberna (cambiar héroes). Cofres 📦, santuarios ⛩️ y jefes 👑.

## Reglas de la Etapa 2

### Fase 0 (lista)
- **Muerte = empezar de cero.** Si cae **todo** el grupo en un combate, se vuelve a Villa Origen y se pierde:
  nivel y experiencia de todo el roster (también los de la taberna), oro, objetos, mejoras de herrería y
  bonificaciones de santuarios. Se conserva: el mapa explorado, los cofres abiertos, los jefes derrotados,
  el grupo y el líder. El oro y los objetos vuelven a los de una partida nueva, y los demás jugadores
  de la sala reciben el aviso "💀 [nombre] cayó y vuelve a empezar desde Villa Origen".
  Si cae solo una parte del grupo y el resto gana, los caídos siguen caídos hasta revivirlos (posada o Pluma Fénix).
- **Flecha dorada a Villa Origen** 🏘️ con la distancia, siempre visible cuando la villa está fuera de pantalla.
  Esquiva la cruceta, los botones y la flecha del amigo.
- **Jefes con confirmación:** nunca inician el combate. Al tocarlos aparece una ventana con su nivel,
  el nivel promedio de tu grupo, "⚠️ Muy peligroso" si te supera por 2 o más niveles, y los botones Pelear / Retirarse.
- **Experiencia según participación:** cada héroe suma puntos por daño realmente aplicado (+25% de la vida
  máxima del enemigo si lo remata), por curación real y un monto fijo por apoyo (Grito de Guerra, Bendición,
  Revivir, Robar con éxito). La experiencia del combate se reparte en proporción a esos puntos.
  Un héroe vivo que actuó recibe como mínimo el 5%, los caídos conservan lo que aportaron antes de caer
  y los que esperan en la taberna reciben el 10%.
- **Guardado versionado:** las partidas llevan `saveVersion`, y `migrate()` en `public/js/storage.js`
  actualiza las partidas antiguas al cargarlas (las de la Etapa 1 siguen funcionando).

### Fase A (lista): guardado en servidor
- **Identidad sin correo:** código de sala + nombre + **PIN de 4 dígitos**. Si el nombre es nuevo en la sala,
  se crea con ese PIN; si ya existe, hay que escribir su PIN (6 intentos fallidos bloquean ese nombre 10 minutos).
  El PIN se guarda como hash `scrypt` con sal, nunca en texto plano.
- **Cuándo se guarda en el servidor:** juntando cambios cada ~10 s, y de inmediato al descansar, comprar,
  terminar un combate, morir, tocar 💾, minimizar la app o salir. localStorage queda como respaldo.
- **Primera vez:** si el celular tiene una partida y el servidor no, se sube sola. Si ambos tienen,
  se usa la más reciente.
- El panel de la sala muestra a todos los jugadores registrados (los no conectados aparecen "💤 fuera de línea").
  Máximo 4 conectados a la vez.

### Fase B (lista): equipo con rarezas
- **Ranuras por héroe:** Arma, Armadura y Accesorio. Tipos con restricción de clase: Espada/Hacha y Coraza
  (Guerrero), Báculo y Túnica (Maga, Sanadora), Arco (Arquera), Dagas (Pícaro); Armadura ligera, Anillo y
  Amuleto (todas).
- **Rarezas:** Común (gris, 60%, ×1.0), Raro (azul, 28%, ×1.3, 1 propiedad extra), Épico (morado, 10%, ×1.7, 2 extra),
  Legendario (naranjo, 2%, ×2.3, 3 extra + efecto único). Mientras más lejos de Villa Origen, mejores probabilidades.
- **Stat principal** = `round((2 + ilvl × 1.2) × multiplicador)`; arma → ATQ (báculo → MAG), armadura → DEF + PV,
  accesorio → un stat al azar. Extras posibles: PV, PM, ATQ, DEF, MAG, VEL, % crítico, % robo de vida, % res. veneno.
- **8 legendarios:** Colmillo de Brasa (quema), Égida del Alba (15% bloquea), Anillo del Eco (20% habilidad doble),
  Báculo de las Mareas (+3 PM por turno), Arco del Viento Norte (25% flecha extra), Dagas de Umbra (crítico ×2.5),
  Túnica del Sabio Errante (−25% PM), Amuleto del Fénix (revive una vez por combate).
- **Botín:** 15% en combates normales, siempre en jefes (mínimo Raro), 50% en cofres.
- **Inventario compartido** de 40 objetos en 🎒 Grupo → pestaña Equipo: al tocar un objeto se compara con lo
  equipado (verde mejora, rojo empeora) y se puede Equipar, Vender (en una aldea) o Tirar.
- **Armería de la aldea:** vende 4 objetos Comunes del nivel de la zona (se renuevan cada 400 pasos) y compra
  equipo al 30% de su valor.
- **Balance:** para compensar el equipo, el crecimiento de los enemigos por nivel subió de 13% a 15% (ATQ/DEF/MAG)
  y de 30% a 35% (PV). A nivel 1 no cambia nada; a nivel 10 los enemigos son ~6–10% más duros.
- Al morir todo el grupo también se pierde el equipo (puesto y del inventario).

## Guardado en servidor con Neon

Sin `DATABASE_URL` el juego funciona igual, con guardado solo en el celular y sin PIN. Para activarlo:

1. Entra a <https://neon.tech> y crea una cuenta (puede ser con GitHub).
2. **New Project** → nombre `tierras-sin-fin` → región cercana (por ejemplo *AWS São Paulo* o *US East*).
   ⚠️ Debe ser un **proyecto nuevo y exclusivo** del juego: no uses la base de datos de otro proyecto.
3. En el panel del proyecto toca **Connect** y copia la **connection string**
   (empieza con `postgresql://` y termina con `?sslmode=require`).
4. En Render: tu servicio → **Environment** → **Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: la connection string que copiaste
   - **Save Changes** (Render redespliega solo).
5. Comprueba en `https://<tu-servicio>.onrender.com/health` que diga `"db":"ok"`.
   Las tablas `rooms` y `players` se crean solas al arrancar.

**Probar sin base de datos (local):** `npm start` sin `DATABASE_URL` → `/health` dice `"db":"off"`, no se pide PIN
y todo se guarda en el navegador. **Probar con base de datos (local):** `DATABASE_URL="postgresql://…" npm start`
(puede ser la misma de Neon o un Postgres local; para `localhost` el SSL se desactiva solo).

## Estructura

```
server.js              Express + Socket.io: salas, presencia, mensajes, pines, avisos y guardado
db.js                  Neon/Postgres: tablas, PIN (scrypt) y partidas (solo si hay DATABASE_URL)
public/index.html      Pantallas (inicio, juego, combate, modales)
public/manifest.json   "Agregar a pantalla de inicio" (sin service worker)
public/css/style.css   Estilos mobile-first con zonas seguras (notch)
public/js/main.js      Arranque, pantalla de inicio, movimiento, entrada y loop
public/js/data.js      Clases, habilidades, bestiario, objetos, biomas (también lo usa el servidor)
public/js/state.js     Estado compartido de la partida y fórmulas de héroes
public/js/world.js     Ruido, chunks, aldeas/cofres/santuarios, spawns (determinista por semilla)
public/js/render.js    Dibujo del mapa, otros jugadores, pines, globos y flechas
public/js/battle.js    Combate por turnos, participación y efectos del equipo
public/js/items.js     Equipo: tipos, rarezas, legendarios, nombres, botín y armería
public/js/ui.js        HUD, avisos, modales (aldea, grupo, mapa) y panel de la sala
public/js/net.js       Conexión Socket.io, reconexión y estado de los demás jugadores
public/js/storage.js   Guardado local (clave tsf:{sala}:{nombre})
scripts/make-icons.js  Genera los íconos (npm run icons)
```

## Protocolo (Socket.io)

| Evento | Dirección | Datos |
|---|---|---|
| `room:create` | cliente → servidor (ack) | → `{ok, code}` |
| `room:join` | cliente → servidor (ack) | `{code, name, pin, rejoin}` → `{ok, name, players, pins, seed, db, save}` o `{ok:false, error, needPin}` ("Sala llena", "Sala no existe", "PIN incorrecto") |
| `save:push` | cliente → servidor (ack) | `{data}` (máx. 200 KB; no pisa una partida más nueva) → `{ok, stored}` |
| `room:leave` | cliente → servidor | — |
| `player:state` | cliente → servidor (≤ 8/s, solo si cambió) | `{x, y, leaderEmoji, avgLvl, biome, status:'map'\|'battle'\|'village'}` |
| `players:update` | servidor → sala (≤ 10/s) | `{players:[…]}` |
| `chat:quick` | ida y vuelta | `{msgId}` → `{name, msgId}` |
| `ping:place` | ida y vuelta | `{x, y}` → `{name, x, y, ttl}` (2 minutos) |
| `event:notice` | ida y vuelta | `{type:'level'\|'boss'\|'death', text}`; el servidor además envía `join`/`leave` |

El servidor valida tipos, largos y frecuencias de todo lo que llega. Lo de la **Etapa 2**
(`boss:invite`, `battle:join`, `battle:action`) está comentado en `server.js`, `net.js` y `battle.js`.

## Limitaciones conocidas

- Monstruos, cofres y santuarios son individuales por jugador (si tú derrotas un monstruo, sigue vivo para tu amigo).
- Sin `DATABASE_URL`, el progreso vive solo en el navegador: si se borran los datos del sitio, se pierde la partida.
- El PIN queda recordado en el celular para entrar más rápido (solo en ese navegador).
- Un mismo nombre en dos dispositivos dentro de la misma sala: el último en entrar reemplaza al anterior.
- Si el servidor está caído al **abrir** la página, no carga (no hay service worker). Si se cae **durante** la partida, se sigue jugando y se reconecta solo.
