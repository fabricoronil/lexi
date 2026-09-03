# Lexi

Vocabulario y frases en inglés con repetición espaciada, pensado para el área tech.
Sin cuentas, sin backend, sin instalar nada: es una página estática que guarda tu
progreso en el navegador y funciona offline una vez que la abriste.

**→ [Abrir Lexi](https://fabricoronil.github.io/lexi/)**

## Por qué

Uso Duolingo y clases con profe, y miro videos de programación en inglés como input
comprensible. Lo que faltaba era un lugar para fijar el vocabulario que aparece en
esos videos. Anki hace exactamente eso, pero quería algo cómodo en el celular y con
un estilo que dé ganas de abrirlo.

## Qué hace

- **Repetición espaciada SM-2**, el mismo algoritmo que usa Anki: cada card vuelve
  justo antes de que te la olvides, y el intervalo crece cada vez que la recordás.
  Con dos arreglos propios: reaprender no arranca de cero, y el ease se recupera
  (ver más abajo).
- **Cuatro botones de dificultad** — Otra vez / Difícil / Bien / Fácil — con el
  próximo intervalo a la vista antes de elegir.
- **Racha diaria** al estilo Duolingo: sube sólo cuando llegás a tu meta del día,
  y si perdés un día podés recuperarla al siguiente pagando el doble.
- **Las que más te cuestan**: las palabras que venís fallando, ordenadas por cuánto
  pesan, con un repaso enfocado sólo en ellas.
- **Presupuesto de tiempo**: decís cuántos minutos por día le querés meter y la app
  calcula sola las cards nuevas y la meta.
- **Nivel de exigencia configurable**: Tranqui, Normal, Bestia, o los sliders a mano.
- **Meta diaria recomendada**: proyecta el mazo real para decirte cuántos repasos
  por día te va a pedir el ritmo de cards nuevas que elegiste.
- **Anotar palabras desde el celu**, mientras mirás un video con subtítulos.
- **Vocabulario por nivel** (A1 a B2) y **las 2000 palabras más usadas** del idioma,
  con buscador.
- **386 cards** repartidas en cuatro mazos.
- **Pronunciación** con la voz del sistema, en inglés.
- **Modo inverso** (español → inglés) para producción, no sólo reconocimiento.
- **Heatmap** de actividad y estadísticas de cuántas cards tenés aprendidas.
- **Instalable** en el celular o la tablet (PWA) y funciona sin conexión.
- **Copia de seguridad** en `.json` para pasar el progreso entre dispositivos.

## Los mazos

| Mazo | Cards | Qué trae |
| --- | --- | --- |
| `core` | 117 | Conectores, verbos y adjetivos de alta frecuencia, A1 a B1 |
| `tech` | 128 | Vocabulario de programación: git, APIs, bases de datos, debugging |
| `frases` | 71 | Expresiones de videos de YouTube, reuniones y conversación |
| `phrasal verbs` | 70 | Verbos frasales de uso diario, de A1 a B2 (get up, give up, look into…) |

Cada card trae la palabra, la traducción, un ejemplo en inglés y su traducción — y
una segunda oración de ejemplo que aparece alternada la próxima vez que repasás
esa card, para no memorizarla por el contexto siempre igual.

## Anotar palabras al vuelo

En **Estudio → Mi vocabulario** hay un botón **Anotar**: escribís la palabra y ya
está. Lo único obligatorio es la palabra en inglés — el significado, el ejemplo,
el tipo y la categoría los podés dejar para después, y la fila te lo recuerda
hasta que la completes. Tocá cualquier palabra tuya para editarla o borrarla.

Se guardan en el navegador y viajan por la misma sincronización que el progreso,
así que las anotás en el celu y aparecen en la compu. Son material de consulta:
no entran al SRS ni llevan estado de aprendido, igual que las que vienen del
Notion.

## Las listas de vocabulario

**Estudio → Vocabulario** junta tres formas de mirar lo mismo:

| Sección | Qué trae |
| --- | --- |
| Mi vocabulario | Las de tu Notion más las que anotás vos |
| Vocabulario A1–B2 | 1150 palabras agrupadas por tema, lo esencial de cada nivel |
| Las 1000 / 2000 más importantes | Las más frecuentes del idioma, en bloques de cien |

Las dos últimas salen de [`data/vocab-levels.json`](data/vocab-levels.json) y
[`data/frequency.json`](data/frequency.json), que se bajan recién cuando entrás a
Vocabulario — son 120 KB entre las dos y no tienen por qué demorar el arranque.
El orden de la lista de frecuencia es orientativo: los primeros cientos son los
que aparecen en cualquier texto, de ahí en adelante es una aproximación, no un
ranking exacto de corpus.

Son listas de consulta, con buscador: no llevan estado de aprendido ni entran al
SRS. Para eso están los mazos.

## Olvidarse no es empezar de nuevo

SM-2 puro tiene dos vicios que se notan justo en las palabras que más cuestan, y
[`js/srs.js`](js/srs.js) los corrige:

**Fallar una card la mandaba de vuelta a 1 día**, como si fuera nueva. Pero una
palabra que ya tuviste a veinte días y se te escapó no está en el mismo estado que
una que ves por primera vez: la recuperás más rápido, y cada ciclo de olvido →
reaprendizaje la deja más pegada. Acá, al graduarla de nuevo, se te devuelve un
porcentaje del intervalo perdido — 25% la primera vez, más alto en cada
reaprendizaje siguiente. Esa card vuelve con cinco días en vez de uno.

**El ease sólo bajaba.** Contestar honestamente "Otra vez" o "Difícil" hundía la
card a 1.30 para siempre, y quedaba repitiéndose cada tres días aunque ya te la
supieras — el "ease hell" clásico de Anki. Ahora cada "Bien" recupera un poco:
castiga mientras cuesta, perdona cuando ya la sacás.

## Cuántos repasos por día

La meta diaria no es un número al azar: una card nueva no es un repaso, son
muchos repartidos en el tiempo. [`js/plan.js`](js/plan.js) proyecta catorce días
del mazo real — lo que ya tenés vencido, lo que va a volver, y las nuevas que van
a ir entrando — y saca el promedio de repasos por día. Ese es el número que
Ajustes recomienda, y el que usan los presets.

Si la meta queda muy por debajo, la racha se cumple a mitad de camino y el atraso
crece sin que se note; si queda muy por encima, hay días en que el mazo no tiene
tanto para darte. Ajustes te avisa en cuál de los dos casos estás.

También se puede ir al revés, que es lo más cómodo: en Ajustes decís cuántos
minutos por día le querés dedicar y la app busca el ritmo de cards nuevas que
llena ese tiempo, con la meta que le corresponde. Si el mazo cambia, los números
se recalculan solos para que el tiempo siga siendo el mismo.

## Perder un día no mata la racha

Si te salteás un día, al siguiente la racha queda en riesgo en vez de morir: la
salvás haciendo el doble de la meta. Si también fallás ese, queda una última
oportunidad al tercer día con el triple. Recién ahí arrancás de cero.

Vaciar la cola salva un día normal (no tiene sentido exigirte repasos que no
existen), pero no un rescate: recuperar la racha tiene que costar de verdad, y
para eso está el refuerzo, que no tiene límite.

## Agregar mazos de cards

Los mazos son JSON plano en [`data/`](data/). Agregás un objeto y listo:

```json
{
  "en": "to spin up",
  "es": "levantar (un servicio)",
  "ex": "Spin up a new instance.",
  "exEs": "Levantá una instancia nueva.",
  "lvl": "B1",
  "tag": "tech"
}
```

El `id` de cada card se deriva del campo `en`, así que podés reordenar el archivo sin
perder el progreso. Si cambiás el texto en inglés, esa card arranca de cero.

## Cómo está hecho

JavaScript con módulos ES, sin dependencias ni build. Las piezas principales:

- `js/srs.js` — el planificador SM-2, aislado y sin efectos secundarios
- `js/store.js` — persistencia en `localStorage`, racha, historial y palabras propias
- `js/decks.js` — carga de mazos y armado de la cola del día
- `js/plan.js` — proyección de carga diaria, para recomendar la meta
- `js/app.js` — vistas y eventos

Para correrlo local hace falta un servidor (los módulos y `fetch` no andan con
`file://`):

```bash
python3 -m http.server 8000
```

## Licencia

MIT.
