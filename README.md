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
- Si cae todo el grupo, despierta en Ciudad Origen con todo su progreso; los objetos quedan en una tumba 🪦 por 60 minutos (ver "Versión 2").
- **Seguridad:** empezar una partida nueva (desde 🎒 Grupo o desde la elección de héroes cuando ya hay una guardada)
  pide escribir **CONFIRMAR**, para no borrar el avance por un toque accidental.
  Y si ya tienes una partida con tu nombre, **Crear sala nueva** avisa que empezarás desde cero en otro mundo
  (la partida anterior no se borra) y pregunta si quieres seguir en tu sala o crear una nueva.
- Aldeas 🏘️: posada (guarda), tienda, herrería y taberna (cambiar héroes). Cofres 📦, santuarios ⛩️ y jefes 👑.

## Mapa, coordenadas y jugadores

- **Ciudad Origen 🏰** es la ciudad inicial y principal de la sala (la misma para todos) y el punto **(0, 0)**.
  En el mapa se ve como un castillo grande con brillo y nombre dorados; en el minimapa, como un castillo dorado.
- **Coordenadas X, Y** relativas a Ciudad Origen: **este = X positivo**, **norte = Y positivo** (hacia arriba en la
  pantalla), con dirección cardinal (N, NE, E, SE, S, SO, O, NO) y distancia en casillas.
- **Tarjeta de coordenadas** (arriba a la derecha): tus coordenadas, Ciudad Origen, la aldea más cercana ya
  generada y cada compañero. En el celular parte plegada en una línea; se despliega/pliega tocándola
  (el navegador lo recuerda).
- **Jugadores fáciles de distinguir:** el héroe propio se dibuja ~18% más grande que un monstruo, con halo blanco,
  contorno oscuro, anillo **dorado** con pulso y nombre en una etiqueta dorada; cada compañero tiene su propio color
  (anillo, nombre y flecha). Los monstruos llevan un anillo **rojizo**: rojo = enemigo.
- Arreglo: los emojis del mapa se veían semitransparentes porque heredaban la transparencia del último color
  de relleno (la sombra, al 28%). Ahora siempre se dibujan con relleno opaco.

## Reglas de la Etapa 2

### Fase 0 (lista)
- ~~Muerte = empezar de cero~~ → **reemplazada en la Versión 2** por la regla de la tumba 🪦 (ver abajo).
- **Flecha dorada a Ciudad Origen** 🏰 con la distancia, siempre visible cuando la villa está fuera de pantalla.
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
  Legendario (naranjo, 2%, ×2.3, 3 extra + efecto único). Mientras más lejos de Ciudad Origen, mejores probabilidades.
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
- Al morir todo el grupo, el equipo (puesto y del inventario) queda en la tumba 🪦 (Versión 2).

### Fase C (lista): misiones, bote y portales
- **Tablón de misiones** en cada aldea: 3 misiones generadas de forma determinista por aldea (mismas para todos
  los jugadores de la sala); cada puesto se renueva al completar su misión. Máximo 5 activas.
  - 🏹 **Caza:** derrota N monstruos de la zona. · ✉️ **Entrega:** lleva una carta a una aldea a 40–120 casillas
    (si no hay una, se crea). · 🧭 **Exploración:** encuentra un santuario a 20–70 casillas. · 👑 **Jefe:** derrota
    al jefe más cercano de la región.
  - Recompensas de oro, experiencia (repartida entre el grupo) y probabilidad de equipo, según el peligro del objetivo.
  - **Registro de misiones** en 🎒 Grupo → 📜 Misiones (Seguir / Abandonar). La misión seguida aparece en el HUD,
    con una flecha morada en el borde de la pantalla, un ❗ sobre el objetivo y una marca en el mapa.
- **Bote ⛵:** se compra por 300 de oro en aldeas costeras (mar a 3 casillas o menos). Permite navegar por el mar
  (las montañas siguen bloqueadas), con encuentros marinos (cangrejos, serpientes marinas y, muy rara vez, el Kraken,
  que siempre pide confirmación).
- **Portales 🌀:** cada aldea visitada queda registrada; desde cualquier aldea se puede viajar a otra ya visitada por
  5 × nivel promedio en oro. Las aldeas descubiertas se conservan al morir.

## Versión 2

### Fase 1 (lista): 6 clases nuevas y muerte con tumba
- **11 héroes en el roster** (se siguen eligiendo hasta 3 en la taberna). Nuevas, con habilidades en los niveles 1, 3, 6 y 10:
  | Clase | Habilidades | Pasiva |
  |---|---|---|
  | 🪓 Bárbaro (Ulrik) | Hachazo · Furia · Torbellino · Golpe Desesperado | — |
  | 🧛 Nigromante (Mordek) | Drenar Vida · Maldición · Alzar Esqueleto · Plaga | — |
  | 🧙‍♂️ Druida (Silvano) | Raíces · Espinas · Forma de Oso · Ira de la Naturaleza | — |
  | 🧔 Enano (Brom) | Martillazo · Piel de Piedra · Cerveza Enana · Golpe Sísmico | +25% de oro |
  | 🧝‍♂️ Elfo (Aelar) | Espada Lunar · Canto del Bosque · Danza de Espadas · Luz de Luna | 15% de esquivar golpes físicos |
  | 👺 Goblin (Grik) | Puñal Sucio · Trampa · Bomba Casera · Golpe de Suerte | +30% de botín; huye siempre de monstruos normales |
- **Estados nuevos** con ícono en las tarjetas: 💫 aturdido, 🔮 maldición, 🌵 espinas, 🐻 forma de oso (PV temporales),
  💀 invocación, 💚 regeneración, 🎵 canto del bosque, 😡 furia, 🪨 piel de piedra, 🪤 trampa.
  (La regeneración la da la Forma de Oso: 6% de PV por turno.)
- **Balance:** simulación automática (misma estrategia para todos). En trío —la clase + 2 al azar contra 3 monstruos
  un nivel más arriba— las clases nuevas ganan 73–87% a nivel 5 y 90–100% a nivel 12, el mismo rango que las
  originales (77–93% y 90–100%). Tras simular se bajó el ATQ base del Bárbaro (12→11) y se subieron los PV del Goblin (26→29).
- **Muerte del grupo completo:** se despierta en **Ciudad Origen** con todos revividos y sin estados. Se conservan
  niveles, experiencia, **oro**, herrería, santuarios, mapa, aldeas, misiones y bote. Los **objetos** (pociones,
  éteres, plumas, el inventario y el **equipo puesto**) quedan en una **tumba 🪦** donde cayó el grupo:
  - Al pisarla se recupera todo (el equipo vuelve a su héroe si la ranura sigue libre; si no, al inventario).
  - Dura **60 minutos reales** desde la muerte (corre aunque se cierre el juego). Una sola tumba: si se vuelve a caer,
    la anterior se pierde. Flecha roja con distancia y minutos, marca roja en el minimapa y línea en la tarjeta de coordenadas.
  - Los compañeros ven "🪦 de [nombre]" y reciben el aviso "💀 El grupo de [nombre] cayó".
- **Guardado:** `saveVersion` 6. Al cargar una partida de una versión anterior, primero se copia intacta en
  `tsf:SALA:nombre:backup-vN` (no se borra) y luego se migra: se agregan los 6 héroes nuevos en nivel 1; el grupo
  y todo el progreso quedan iguales (probado con una partida real de la versión publicada).

### Fase 2 (lista): flechas y minimapa
- **Flechas en el borde** cuando el objetivo está fuera de pantalla, con ícono y distancia: 🏰 Ciudad Origen (dorada,
  siempre), 🏘️ aldea más cercana (gris), cada compañero (su color), misión seguida (morada) y tumba 🪦 (roja, con minutos).
  Se separan entre sí (círculo y texto) y esquivan el HUD, la cruceta y los botones.
- **Colores de compañeros** distintos para cada jugador de la sala y los mismos en todos los celulares
  (se asignan por orden alfabético de los nombres de la sala).
- **Mapa grande (🗺️):** tus coordenadas arriba; castillo de Ciudad Origen; aldea más cercana resaltada (con nombre) y las
  demás más tenues; compañeros con punto de color, nombre y coordenadas aunque estén fuera de lo explorado; jefes
  conocidos 👑; tumba, misión, marcas y santuarios; leyenda. Lo que queda fuera del recuadro aparece en el borde con una flechita.
- **Mini-minimapa** bajo las tarjetas de los héroes: alrededores, tu posición, compañeros y la dirección de Ciudad
  Origen. Al tocarlo se abre el mapa grande. Se pliega con ▾ (queda un botón 🧭) y el navegador lo recuerda;
  en el celular horizontal parte plegado para no chocar con los botones.

### Fase 3 (lista): jefes en equipo, 1 héroe por jugador
- La ventana del jefe tiene **⚔️ Pelear solo · 📣 Pedir ayuda · 🏃 Retirarse**. "Pedir ayuda" se activa si hay
  compañeros conectados explorando.
- **Pedir ayuda:** eliges **1 héroe** de tu grupo (tarjetas con clase, nivel y PV/PM; los caídos no se pueden elegir).
  Todos los de la sala ven un aviso grande "Dani encontró al Ogro Rey 👑 (Nv 8) — ⚔️ Unirse / Ahora no" por
  **90 segundos**, marcado con 📣 en el minimapa y con una flecha. Quien pidió ayuda ve una sala de espera con los
  que se unen y **¡Comenzar!**; si nadie se une puede **pelear solo con su grupo completo** o retirarse.
- **Combate:** el que encontró al jefe es el **anfitrión** (corre el combate y transmite el estado); los demás mandan
  sus acciones. Cada jugador controla solo su héroe, con **30 s por turno** y cuenta regresiva visible (si se acaba,
  el héroe se defiende). Las habilidades de apoyo funcionan sobre los héroes de los demás. Los invitados "viajan"
  junto al jefe y al terminar vuelven a su posición. El panel muestra "👑 vs Ogro Rey".
- **Balance:** vida del jefe × `1 + 0.7 × (jugadores − 1)`. Como el jefe está pensado contra un grupo de 3 héroes
  y en equipo cada jugador trae 1, el **daño de los enemigos** se ajusta: ×0.55 (2 jugadores), ×0.75 (3), ×1.0 (4).
- **Resultado:** cada jugador recibe la **experiencia completa** para su héroe y **su propio botín** (Pluma Fénix,
  Éter y un equipo mínimo Raro); si su héroe cayó pero ganaron, revive con 25% de vida. Si pierden, cada uno despierta
  en Ciudad Origen con todo su grupo y la regla de la tumba 🪦 (los objetos quedan donde estaba antes del combate).
- **Desconexiones:** si se va el anfitrión, el combate se cancela para todos **sin penalización**; si se va un invitado,
  su héroe se defiende solo y el combate sigue.

## Versión 3

### Fase 0 (lista): portal, chat, visibilidad, objetos y combate más claro
- **🌀 Portal rediseñado** (en cualquier aldea → "Abrir portal"): **Ciudad Origen** arriba en una tarjeta dorada;
  debajo las **⭐ favoritas** (se marcan con la estrella y se guardan en la partida) y las aldeas agrupadas en
  **⬆️ Norte, ⬇️ Sur, ➡️ Este y ⬅️ Oeste** con su cantidad. La zona se calcula **respecto a Ciudad Origen**
  (4 sectores de 90°; las diagonales exactas van al norte o al sur). Al abrir el portal se despliega la zona donde
  estás (en Ciudad Origen, la que tiene más aldeas); al tocar otra, las demás se pliegan. Cada fila: nombre (con "…"),
  coordenadas, "18 casillas al sur de ti", costo y **Viajar** siempre a la derecha; ordenadas de la más cercana a la
  más lejana. La aldea donde estás dice "📍 Estás aquí". **🗺️ Ver en mapa** muestra las aldeas visitadas; al tocar
  una aparece su tarjeta con Viajar. El viaje sigue costando 5 × nivel promedio.
- **💬 Chat de la sala** (botón 💬, tecla C): panel con pestañas **💬 Chat / 👥 Sala** (la sala tiene los jugadores
  y 📍 Marcar aquí). En el celular sube desde abajo (mitad de la pantalla) y se acomoda sobre el teclado. Cada mensaje
  muestra el emoji del líder, el nombre en su color, la hora y el texto; los mensajes del sistema (entradas, salidas,
  subidas de nivel, jefes derrotados, caídas e invitaciones a jefes) van en gris. ⚡ abre los mensajes rápidos, que
  también quedan en el chat. Globito rojo con los no leídos y **globo de 5 s sobre el personaje** de quien escribe.
  **🔕 Silenciar** oculta los globos y el contador (los mensajes siguen llegando); se recuerda en el dispositivo.
  - **Seguridad:** máx. **200 caracteres**, sin mensajes vacíos y **1 mensaje por segundo** por jugador (validado en
    el servidor). El servidor guarda y envía el texto con el HTML escapado y el cliente lo muestra solo con
    `textContent` (nunca `innerHTML`).
  - **Historial:** los últimos **100 mensajes por sala** se guardan en la tabla `chat_messages` (si hay base de datos)
    y se envían al entrar o reconectar. Sin base de datos viven en la memoria del servidor.
- **👁️ Ver a los demás jugadores** (botón abajo, 3 modos con aviso): 👁️ Mostrar todo · 🗺️ Solo en el minimapa ·
  🚫 Ocultar todo. Siempre siguen el chat, el panel de jugadores, las invitaciones a jefes, tu tumba, Ciudad Origen y
  la aldea más cercana; en un combate en equipo se ven los compañeros de ese combate. Se recuerda en el dispositivo.
- **🧪 Objetos más fáciles:** Poción, Éter y Pluma Fénix (en combate, fuera de combate y como invitado en un jefe)
  abren tarjetas del grupo con emoji, nombre, clase, **barras y números de PV/PM** y la vista previa del efecto
  ("🧪 +40 PV → 63/80"). El que más lo necesita aparece resaltado; "Vida llena", "Magia llena" y los caídos quedan
  desactivados con su motivo; la Pluma Fénix muestra solo a los caídos. Curar y Revivir fuera de combate usan las
  mismas tarjetas.
- **⚔️ Estimados en los botones del combate** (`public/js/estimate.js`, mismas fórmulas que `battle.js` sin el azar):
  "⚔️ Daño ≈ 18–22", "💥 ≈ 12–15 a cada enemigo", "🏹 2 × ≈ 9–11", "💚 Cura ≈ 35", veneno "☠️ +6 por turno durante
  3 turnos" y efectos ("+40% ATQ · 3 turnos"). Cuenta los stats, el equipo, las mejoras activas y la defensa del
  enemigo (promedio de los vivos); los críticos no se incluyen (nota "crítico ×1.75"). Al elegir objetivo:
  "🐺 Lobo · PV 30/45 → ≈ 10 PV" o "💀 lo derrota"; al curar: "Ivana · PV 23/80 → ≈ 60/80". (Los talentos se sumarán
  en la Fase 2.)
- **❤️ Vida de los enemigos con números:** "PV 34 / 60" dentro de la barra; al recibir daño el número baja animado y la
  parte perdida queda un momento más clara. Los **jefes** tienen una barra grande arriba con nombre, nivel y
  "PV 1.240 / 2.000".
- **Guardado:** `saveVersion` 7 (agrega `favs`). Antes de migrar se copia la partida intacta en
  `tsf:SALA:nombre:backup-v6`. El modo 👁️ y 🔕 se guardan en el dispositivo (`tsf-vis`, `tsf-mute`), no en la partida.

### Fase 1 (lista): mazmorras 🕳️
- **Entradas** en el mapa (~3% de los chunks, a más de 25 casillas de Ciudad Origen), deterministas por la semilla de
  la sala y con nombre ("Cripta de Valdor", "Gruta Sombría", "Mina Olvidada"). Se generan con un azar aparte, así que
  las aldeas, cofres y monstruos de los mundos que ya existían no cambian. Al pisarla: nombre, tipo, nivel
  recomendado (peligro de la zona + 1), pisos y **🕳️ Entrar / 🏃 Retirarse**.
- **Adentro:** pisos de salas y pasillos de 40×30 (deterministas por la entrada), **3 a 5 pisos** según el nivel
  (Nv <6: 3 · <12: 4 · si no, 5). **Visión de ~5 casillas** que no atraviesa muros; lo ya visto queda en penumbra y el
  resto en negro, con luz de antorcha. Escaleras 🪜 para bajar y subir; desde **cualquier escalera** se puede
  **🚪 Salir de la mazmorra**. Flechas en el borde hacia las escaleras ya vistas.
- **Monstruos de cueva** según el tipo (Cripta: esqueletos, zombis, fantasmas, murciélagos · Gruta: arañas,
  murciélagos, serpientes, **Gólem 🗿** · Mina: **Mineros Fantasma**, gólems, murciélagos, ratas). Nivel = entrada + 1
  por piso. Te persiguen si te ven.
- **Trampas ocultas:** púas (−12% de vida a cada héroe, nunca por debajo de 1) y gas (veneno). Con **Pícaro o Goblin**
  en el grupo, 50% de detectarlas al verlas (⚠️ visibles: al pisarlas se esquivan).
- **Cofres:** equipo con **+1 nivel de rareza garantizado** (nunca Común) y algo de oro.
- **Último piso:** jefe de mazmorra (Señor de la Cripta, Reina Araña o Gólem Ancestral) con la ventana de confirmación
  y **📣 Pedir ayuda** (igual que los jefes en equipo; los compañeros lo ven en la entrada de la mazmorra). Al vencerlo:
  "✅ ¡Mazmorra completada!", aparece un **portal de salida 🌀** y la entrada queda con ✅ en el mapa y el minimapa.
  El jefe y los cofres no reaparecen; los monstruos normales sí (cada vez que entras).
- **Muerte adentro:** despiertas en Ciudad Origen y la **tumba 🪦 queda en la entrada** de la mazmorra, afuera.
- **Otros jugadores** ven en el panel "🕳️ en Cripta de Valdor (piso 2)". Para unirte a un jefe en equipo tienes que
  salir de la mazmorra.
- **Misiones:** nuevo tipo **🕳️ Completa la mazmorra X** en los tablones (~15% de los puestos; las demás misiones de
  cada tablón quedan iguales que antes).
- **Guardado:** `saveVersion` 8: `dungeons` (por entrada: pisos vistos, cofres abiertos, jefe, completada, piso más
  profundo) e `inDun` (si recargas adentro, vuelves al mismo piso y lugar).

### Fase 2 (lista): talentos y clases avanzadas
- **Talentos** en los niveles **5, 10, 20 y 30**: cada héroe elige 1 de 2 pasivas (⚔️ ofensiva o 🛡️ defensiva/utilidad)
  en 🎒 Grupo → Héroes. Al subir de nivel aparece el aviso y el botón 🎒 muestra un **!** rojo. En la **posada** se
  reinician pagando **20 × nivel** de oro. Datos en `TAL` (`public/js/data.js`).
- **Clases avanzadas** al nivel **15** (1 de 2, no se puede cambiar): cambia el título y el ícono, ajusta un poco el
  crecimiento de stats desde el nivel 15 y da 2 habilidades (niveles 15 y 22). Datos en `ADV`.
- **Estados nuevos** (con ícono en las tarjetas): 💠 escudo · ✨ anula el próximo golpe · 🎯 marcado (+40% daño
  recibido) · ⏩ actúa primero · 💢 frenesí (2 ataques) · 🩸 robo de vida 30% · 🌙 +30% esquivar · 👤 esquiva todo ·
  💜 agonía (daño creciente) · 🪔 runa de fuego (los golpes queman) · ⚡ siguiente golpe crítico · 🔥 quemadura
  (ya existía, ahora también la aplican habilidades).
- Los estimados de los botones incluyen los talentos (por ejemplo "Golpe Certero" o "Quemadura").

| Clase | Nv 5 | Nv 10 | Nv 20 | Nv 30 |
|---|---|---|---|---|
| Guerrero | Sed de Sangre (+10% ATQ, 5% robo) / Piel de Hierro (+15% DEF) | Golpe Certero (Golpe Fuerte y Titánico +25%) / Vitalidad (+15% PV) | Furia del Guerrero (+8% crít.) / Bastión (escudo 15% PV al empezar) | Masacre (+15% ATQ) / Inquebrantable (1 vez queda con 1 PV) |
| Maga | Mente Afilada (+12% MAG) / Reserva Arcana (+20% PM) | Quemadura (Bola de Fuego quema) / Eco Mágico (15% no gasta PM) | Tormenta Arcana (Ventisca y Meteoro +20%) / Barrera (escudo 20% PV) | Poder Absoluto (+15% MAG) / Meditación (+3 PM por turno) |
| Arquera | Ojo Agudo (+6% crít.) / Pies Ligeros (+10% esquivar) | Veneno Potente (+50% veneno) / Rapidez (+15% VEL) | Puntería (+12% ATQ) / Instinto (+15% PV) | Disparo Letal (críticos ×2.25) / Camuflaje (+15% esquivar) |
| Pícaro | Filo Oculto (+8% crít.) / Manos Rápidas (Robar +25%) | Venenos (+50% veneno) / Evasión (+12% esquivar) | Ejecutor (+20% a enemigos con <50% PV) / Botín Extra (+20% oro) | Críticos Letales (×2.25) / Sombra Viva (+15% esquivar) |
| Sanadora | Luz Ardiente (Luz Sagrada +30%) / Manos Benditas (+20% curación) | Fervor (+12% MAG) / Eco Sagrado (15% no gasta PM) | Ira Celestial (+8% crít., +10% ATQ) / Aura de Vida (regenera 4% PV) | Milagro (+30% curación) / Ángel Guardián (1 vez queda con 1 PV) |
| Bárbaro | Sed de Sangre (6% robo) / Piel Gruesa (+15% PV) | Ira Creciente (+25% ATQ con <50% PV) / Rugido (Furia no cuesta vida) | Hacha Pesada (+12% ATQ) / Aguante (+12% DEF) | Carnicero (+8% crít., críticos ×2) / Imparable (1 vez queda con 1 PV) |
| Nigromante | Hambre Oscura (Drenar Vida cura 100%) / Velo Sombrío (+12% DEF) | Peste (+50% veneno) / Huesos Fuertes (esqueleto +2 rondas) | Poder Oscuro (+15% MAG) / Alma Robada (+3 PM por turno) | Maldición Profunda (+50% en vez de +30%) / Inmortal (1 vez queda con 1 PV) |
| Druida | Espinas Afiladas (reflejan 50%) / Savia (regenera 3% PV) | Furia Salvaje (oso +25% ATQ) / Raíces Profundas (Raíces +60%) | Ira de Gaia (Ira de la Naturaleza +25%) / Corteza (+15% DEF) | Naturaleza Salvaje (+12% ATQ y MAG) / Renacer (1 vez queda con 1 PV) |
| Enano | Martillo Pesado (Martillazo aturde 50%) / Roca Viva (+15% DEF) | Fuerza de la Montaña (+12% ATQ) / Barba de Hierro (escudo 15% PV) | Golpe Rúnico (+8% crít., +10% ATQ) / Cerveza Doble (2 usos) | Bolsa de Oro (+20% oro) / Fortaleza (+20% PV) |
| Elfo | Hoja Lunar (Espada Lunar +25%) / Gracia Élfica (+10% esquivar) | Agilidad (+15% VEL) / Canto Sanador (Canto cura 10% PV) | Ojo del Bosque (+8% crít.) / Sabiduría Antigua (+12% MAG) | Danza Perfecta (Danza da 4 golpes) / Espíritu Libre (+15% esquivar) |
| Goblin | Pólvora Extra (Bomba +30%) / Bolsillos Hondos (+15% oro) | Suerte de Goblin (+8% crít.) / Escurridizo (+10% esquivar) | Golpe Afortunado (Golpe de Suerte mín. ×1.5) / Trampero (detecta 90% de trampas) | Rata Lista (+15% ATQ, +10% VEL) / Esquivo (+15% esquivar) |

- **Guardado:** `saveVersion` 9: cada héroe guarda `tal` (opción elegida por nivel) y `adv` (clase avanzada). Las
  partidas viejas cargan con todo vacío y los héroes que ya pasaron esos niveles los eligen al entrar.

### Fase 3 (lista): día y noche, y mascotas
- **Día y noche compartido por la sala:** se calcula con la hora del servidor (`room:join` entrega `now`; ver
  `public/js/daynight.js`). Ciclo de **20 minutos**: 14 de día y 6 de noche, con atardecer 🌇 y amanecer suaves.
  Arriba a la derecha: ☀️/🌙 con el tiempo que falta para el cambio, y un aviso al anochecer y al amanecer.
- **De noche:** el mapa se oscurece con un círculo de luz alrededor del grupo; las aldeas y Ciudad Origen se ven
  iluminadas con faroles 🏮. Los monstruos tienen **+20% de stats** y dan **+30% de experiencia, oro y botín**.
  Aparecen **monstruos nocturnos** (Murciélago Vampiro, Lobo de Sombra, Espectro Errante) que se van al amanecer;
  se generan con un azar aparte, así que los monstruos de día no cambian. En las mazmorras no hay día ni noche.
- **Mascotas:** salen de un **huevo 🥚** (15% en cada jefe, 30% en misiones de jefe y de mazmorra, o 800 oro en
  Ciudad Origen) que eclosiona a los **300 pasos** con una mascota al azar:
  🐺 Lobo (ataca al final de cada ronda) · 🦉 Búho (revela trampas y cofres cercanos en el minimapa) ·
  🐈 Gato (+15% de oro y botín) · 🐲 Dragoncito (fuego a todos cada 2 rondas) · 🐢 Tortuga (escudo al héroe con
  menos vida, 1 vez por combate) · 🦊 Zorro (+10% de huir y de esquivar).
  1 mascota activa; las demás en el **🐾 Establo** de cualquier aldea, donde se cambian. Sigue al grupo en el mapa
  (los demás también la ven), gana la mitad de la experiencia de los combates y sube hasta nivel 20 (el efecto
  mejora). No muere. En los jefes en equipo acompaña al héroe elegido.
- **Guardado:** `saveVersion` 10: `pets`, `pet` y `eggs`.

### Fase 4 (lista): logros, jefe de mundo semanal y arena PvP
- **🏆 Logros** (🎒 Grupo → Logros): 30 logros en 7 categorías (exploración, combate, mazmorras, cooperativo,
  colección, clases, mundo y arena), con barra de progreso. Cada uno da un **título** que se muestra bajo tu nombre
  en el mapa y en el panel de jugadores (se elige en la misma pestaña), y algunos dan oro o equipo. Al desbloquear:
  aviso propio y aviso a la sala ("🏆 Dani consiguió «Matadragones»", también en el chat). Los logros que una partida
  vieja ya cumple se desbloquean solos al entrar. **Ranking de la sala** (más logros, más lejos, más jefes y arena),
  guardado en el servidor (tabla `player_stats`).
- **🌋 Jefe de mundo semanal (Titán de Lava):** cada semana aparece a 60–100 casillas de Ciudad Origen, en un lugar
  determinista (semilla de la sala + número de semana), con flecha naranja, marca en el minimapa y una línea en la
  tarjeta de coordenadas. Su **vida es compartida por toda la sala** y la guarda el servidor (tabla `world_boss`).
  Cada intento (solo con el grupo o en equipo con 📣 Pedir ayuda) dura **máximo 10 rondas**; luego se retira y el daño
  queda registrado con el aporte de cada jugador. Si el grupo cae, aplica la tumba. Al derrotarlo, cada uno que
  aportó recibe oro y equipo Épico o Legendario según su daño, y el título «Azote de Titanes». La semana siguiente
  reaparece más fuerte (nivel +4 y +50% de vida por cada vez que cayó).
- **⚔️ Arena** en Ciudad Origen: desafía a un jugador que también esté ahí, **1 contra 1** (cada uno elige 1 héroe)
  o **3 contra 3** (el grupo). Duelo amistoso: se usan copias de los héroes, nadie pierde nada y al terminar todos
  recuperan la vida y la magia. Los stats se nivelan (el lado de menor nivel sube al nivel del otro, conservando sus
  habilidades). Sin objetos ni huir; 30 s por turno; el retador es el anfitrión. Si alguien se desconecta, el duelo se
  cancela sin efecto. Puntos: ganar 10 (1v1) o 15 (3v3), perder 2. Logros «el Duelista» y «Campeón de la Arena».
- **Guardado:** `saveVersion` 11: `stats`, `ach`, `title`, `arena`, `wbClaim`, `wbSeen`.

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
   Las tablas `rooms`, `players`, `chat_messages`, `player_stats` y `world_boss` se crean solas al arrancar.

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
public/js/quests.js    Misiones de aldea: generación determinista, progreso y recompensas
public/js/tomb.js      Tumba 🪦: objetos del grupo caído, recuperación y vencimiento (60 min)
public/js/minimap.js   Dibujo del mapa grande y del mini-minimapa
public/js/coop.js      Jefes en equipo: invitación, elección de héroe, sala de espera y vista del invitado
public/js/ui.js        HUD, avisos, modales (aldea, portal, grupo, mapa)
public/js/chat.js      Panel 💬 Chat / 👥 Sala: mensajes, no leídos, silenciar y teclado del celular
public/js/prefs.js     Preferencias del dispositivo: ver jugadores 👁️ y silenciar chat 🔕
public/js/estimate.js  Estimados de daño/curación de los botones y vista previa de objetos
public/js/hpbar.js     Barras de vida de enemigos con números y barra grande de jefe
public/js/daynight.js  Día y noche con la hora del servidor
public/js/pets.js      Mascotas: huevos, eclosión, efectos y experiencia
public/js/achievements.js Logros, títulos y ranking de la sala
public/js/worldboss.js Jefe de mundo semanal (vida compartida en el servidor)
public/js/dungeon.js   Mazmorras: pisos, visión, monstruos, trampas, cofres, escaleras, jefe y progreso
public/js/net.js       Conexión Socket.io, reconexión y estado de los demás jugadores
public/js/storage.js   Guardado local (clave tsf:{sala}:{nombre})
scripts/make-icons.js  Genera los íconos (npm run icons)
```

## Protocolo (Socket.io)

| Evento | Dirección | Datos |
|---|---|---|
| `room:create` | cliente → servidor (ack) | → `{ok, code}` |
| `room:join` | cliente → servidor (ack) | `{code, name, pin, rejoin}` → `{ok, name, players, pins, seed, db, save, chat}` o `{ok:false, error, needPin}` ("Sala llena", "Sala no existe", "PIN incorrecto") |
| `save:push` | cliente → servidor (ack) | `{data}` (máx. 200 KB; no pisa una partida más nueva) → `{ok, stored}` |
| `room:leave` | cliente → servidor | — |
| `player:state` | cliente → servidor (≤ 8/s, solo si cambió) | `{x, y, leaderEmoji, avgLvl, biome, status:'map'\|'battle'\|'village'\|'dungeon', tomb, vs, dun}` (en una mazmorra, x/y son los de la entrada y `dun` = "Cripta de Valdor (piso 2)") |
| `players:update` | servidor → sala (≤ 10/s) | `{players:[…]}` |
| `chat:quick` | ida y vuelta | `{msgId}` → `{name, msgId}` (además queda en el chat) |
| `chat:msg` | cliente → servidor (ack) · servidor → sala | `{text}` (máx. 200, 1/s) → `{ok}` o `{ok:false, error}`; la sala recibe `{id, t, kind:'msg'\|'quick'\|'sys', name, e, text}` con el texto escapado |
| `ping:place` | ida y vuelta | `{x, y}` → `{name, x, y, ttl}` (2 minutos) |
| `event:notice` | ida y vuelta | `{type:'level'\|'boss'\|'death', text}`; el servidor además envía `join`/`leave` |
| `boss:invite` | anfitrión → sala (ack) | `{boss, hero}` → todos reciben `{id, host, boss, left}` (90 s) |
| `boss:join` / `boss:leave` | invitado → servidor | `{id, hero}` / `{id}`; el anfitrión recibe `boss:lobby` |
| `boss:start` / `boss:cancel` | anfitrión → invitados | comienza o se cancela; la invitación se cierra con `boss:closed` |
| `battle:state` | anfitrión → invitados | estado del combate (enemigos, héroes, turno, registro, números flotantes) |
| `battle:action` | invitado → anfitrión | `{id, heroId, kind, key, target}` (kind: atk, skill, item o def) |
| `battle:end` | anfitrión → invitados | `{result, xp, gold, boss, heroes}` (win, lose o cancel; si se va el anfitrión, el servidor manda cancel) |
| `stats:push` / `rank:get` | cliente → servidor | logros, distancia, jefes, arena y título / ranking de la sala (ack) |
| `wb:get` / `wb:hit` | cliente → servidor (ack) | estado del jefe de mundo / daño de un intento `{week, parts:{nombre: daño}}` |
| `wb:state` | servidor → sala | `{week, gen, hp, mhp, lvl, contrib, killed}` |
| `pvp:invite` / `pvp:accept` / `pvp:decline` | retador ↔ desafiado | duelo en la arena; luego `pvp:start` al retador y el combate usa `battle:state/action/end` |

El servidor valida tipos, largos y frecuencias de todo lo que llega. Los eventos de los jefes en equipo están en `server.js` (sesiones) y `public/js/coop.js` (cliente).

## Limitaciones conocidas

- Monstruos, cofres y santuarios son individuales por jugador (si tú derrotas un monstruo, sigue vivo para tu amigo).
- Sin `DATABASE_URL`, el progreso vive solo en el navegador: si se borran los datos del sitio, se pierde la partida.
- El PIN queda recordado en el celular para entrar más rápido (solo en ese navegador).
- Un mismo nombre en dos dispositivos dentro de la misma sala: el último en entrar reemplaza al anterior.
- Si el servidor está caído al **abrir** la página, no carga (no hay service worker). Si se cae **durante** la partida, se sigue jugando y se reconecta solo.
