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
- **Primero lo que más se usa**: las palabras nuevas entran ordenadas por qué
  tan seguido aparecen en inglés de verdad, no por el orden del archivo.
- **Pistas** cuando la tenés en la punta de la lengua, antes de rendirte y
  mirar la respuesta.
- **"Ya me la sé"** para sacar del mazo una palabra que no necesitás practicar.
- **Festejo cuando una palabra queda aprendida**, para que el logro se note.
- **Los dos caminos a la vista**: cuánto llevás de cada nivel CEFR y cuánto del
  vocabulario de tu área, por separado.
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
- **563 cards** repartidas en seis mazos.
- **Pronunciación** con la voz del sistema, en inglés.
- **Modo inverso** (español → inglés) para producción, no sólo reconocimiento.
- **Práctica activa opcional**: escribir la respuesta, elegirla entre otras
  parecidas o sacarla de oído, antes de ver el significado. Viene apagada.
- **Lo que se te escapó**, al terminar la sesión: las que fallaste, juntas.
- **Heatmap** de actividad y estadísticas de cuántas cards tenés aprendidas.
- **Instalable** en el celular o la tablet (PWA) y funciona sin conexión.
- **Copia de seguridad** en `.json` para pasar el progreso entre dispositivos.

## Los mazos

| Mazo | Cards | Qué trae |
| --- | --- | --- |
| `esencial` | 142 | Las que aparecen en cualquier conversación: verbos, adjetivos y conectores de uso diario, A1 a A2 |
| `core` | 110 | Conectores, verbos y adjetivos de alta frecuencia, A1 a B1 |
| `tech` | 126 | Vocabulario de programación: git, APIs, bases de datos, debugging |
| `ia` | 44 | Machine learning y LLMs: modelos, entrenamiento, tokens, inferencia |
| `frases` | 71 | Expresiones de videos de YouTube, reuniones y conversación |
| `phrasal verbs` | 70 | Verbos frasales de uso diario, de A1 a B2 (get up, give up, look into…) |

Cada card trae la palabra, la traducción, un ejemplo en inglés y su traducción — y
una segunda oración de ejemplo que aparece alternada la próxima vez que repasás
esa card, para no memorizarla por el contexto siempre igual.

## En qué orden se aprende

El objetivo no es "saber inglés" en abstracto: es poder ver videos de
programación y de IA en inglés lo antes posible. Eso es el doble de
productivo — practicás el idioma con contenido que ibas a consumir igual.

El problema es que un mazo grande te tira `stale`, `a workaround` o
`Bear with me.` cuando todavía no tenés `to seem` ni `between`. Aprender eso
primero no rinde: no lo vas a escuchar casi nunca, y lo que se gana es
frustración cuando volvés al otro día y no te acordás ninguna.

Así que cada card tiene un escalón:

- Las **palabras generales** se cruzan contra
  [`data/frequency.json`](data/frequency.json), la lista de las 2000 más usadas
  del idioma. Para una expresión de varias palabras vale la parte **menos**
  común: `to look into` es tan difícil como la idea que arma, no como el `to`.
- El **vocabulario técnico y las frases de video** no se pueden medir así:
  `to debug` y `stale` están los dos fuera del top 2000, pero uno lo escuchás
  en cada video y el otro casi nunca. Esos mazos traen un `step` puesto a mano
  (`1`, `2` o `3`) y, cuando está, manda sobre la frecuencia.

| Escalón | Qué entra |
| --- | --- |
| Base | A1 y A2 frecuente, más lo técnico de todos los días: `a bug`, `a function`, `a server`, `a model`, `to train` |
| Intermedio | el resto de A2 y B1 común, más lo técnico de videos y docs: `to deploy`, `an endpoint`, `inference`, `a benchmark` |
| Completo | lo idiomático y lo rebuscado: `under the hood`, `stale`, `gradient descent`, `Bear with me.` |

En **Ajustes → Qué palabras nuevas te toma** elegís hasta dónde llegar. No
apaga mazos ni esconde nada: lo que queda afuera espera su turno, y cuando te
quedás sin palabras nuevas del escalón elegido el inicio te avisa y te deja
subir de un toque. El salto lo das vos cuando terminaste lo anterior, en vez
de que la app te meta términos rebuscados de sorpresa.

### Una rampa, no una pared

Dentro del escalón, ordenar por nivel y después por frecuencia daba tres
semanas de puro A1 y de golpe un muro de A2. Ahora cada card tiene un costo —
su posición en el ranking de frecuencia más un peso por nivel — así que una
palabra A2 que se usa todo el tiempo entra antes que una A1 que casi no
aparece. A1 domina el arranque y A2 toma fuerza sola:

| | A1 | A2 |
| --- | --- | --- |
| días 1–3 | 27 | 9 |
| días 4–7 | 13 | 34 |
| días 8–14 | 15 | 68 |

### Una de cada tres, de lo tuyo

Dentro del escalón el orden es por frecuencia, pero si fuera sólo eso el
vocabulario técnico quedaría para dentro de meses: ningún término de dev o de
ML figura en el top 2000 del idioma general. Por eso cada tanda de cards
nuevas **reserva un lugar de cada tres para una card de `tech` o `ia`** del
escalón en el que estés. Desde el primer día hay algo de tu área, pero de a
poco y sin que te coma la tanda entera.

La proporción se cambia en **Ajustes → Cuánto de tu área** (1 de 5, 1 de 3,
1 de 2). Subirla llega antes a los videos, pero el vocabulario general es el
que te deja parsear la oración donde esas palabras aparecen — por eso el
default es un tercio y no la mitad.

### Cuánto falta, a este ritmo

El cuello de botella para entender los videos no es el mazo: es cuántas cards
nuevas por día aceptás. **Progreso** lo dice en días, para el escalón actual y
para el vocabulario del área, así la decisión de apretar el acelerador se toma
con el número a la vista y no a ciegas:

| ritmo | escalón completo | vocabulario del área |
| --- | --- | --- |
| 5/día, 1 de 3 | 66 días | 39 días |
| 10/día, 1 de 3 | 33 días | 26 días |
| 10/día, 1 de 2 | 33 días | 16 días |
| 20/día, 1 de 2 | 17 días | 8 días |

## Los dos caminos, a la vista

La misma sesión tira de dos sogas: subir de nivel (A1 → A2 → B1) y llegar a
entender los videos de tu área sin subtítulos en español. Avanzan con las
mismas cards pero a ritmos distintos, así que **Progreso** las muestra por
separado: cuánto llevás del vocabulario de cada nivel CEFR, y cuánto de cada
paso de `tech` + `ia`. El porcentaje dice lo que mide — cuánto llevás del
vocabulario que trae la app, no un certificado de nivel.

## Cuando no te sale, y cuando ya te la sabés

Dos botones en la sesión, para los dos casos en que calificar no alcanza:

**Pista** te da un empujón antes de que te rindas y mires la respuesta. Van de
menos a más: primero otra oración en inglés con la misma palabra — que es como
la vas a encontrar de verdad, input comprensible en chiquito — y después el
esqueleto de la traducción (`d _ _ _ _ _   c _ _ _ _ _`). En modo inverso es al
revés: la oración con la palabra tapada, y después cómo empieza.

Y la pista **tiene precio**: si la sacaste con ayuda, no te la sabías, y
calificarla "Fácil" le mentiría al SRS — te la mandaría a un mes cuando en
realidad no te salió sola. Así que cada pista baja el techo de lo que podés
votar: con una queda fuera "Fácil", con las dos el máximo es "Difícil". Hacia
abajo siempre podés (ahí está "Otra vez"); hacia arriba, no.

**Ya me la sé** saca la palabra del circuito para siempre: no vuelve a la cola,
ni al refuerzo, ni a "las que más te cuestan". Y **en su lugar entra la
siguiente**, en el acto: como nunca la respondiste, no gastó cupo de cards
nuevas, así que marcarla te adelanta en vez de acortarte el día. Vive en el botón de arriba de
todo, lejos de los de calificar, y siempre pide confirmación — no hay forma de
sacarte una palabra de encima con un toque sin querer. Si te arrepentís, están
todas juntas en **Progreso → Palabras → Ya la sé**, y tocarlas las devuelve al
mazo con el progreso que tenían intacto.

## Cuando una palabra queda aprendida

Una card se considera aprendida cuando el intervalo pasa las tres semanas. Eso
es un logro real y antes pasaba en silencio, en medio de la sesión: el número
de "aprendidas" del inicio subía sin que te enteraras. Ahora la pantalla se
pone verde, el círculo se dibuja y te dice cuál fue y cuándo vuelve.

## Producir la respuesta, no sólo reconocerla

Los cuatro botones y los intervalos son los de siempre: esto no los toca.
Lo que decide es si, **antes** de mostrarte el significado, la respuesta
tiene que salir de vos. Uno cree que se acuerda de una palabra hasta que
tiene que escribirla.

En **Ajustes → Cómo practicás** hay tres niveles:

| | Qué pasa en la sesión |
| --- | --- |
| **Clásico** | El flujo de Anki de siempre: ves la palabra, la pensás, mostrás el significado y te calificás. **Es el que viene puesto.** |
| **Mixto** | El ejercicio sigue a la madurez de la palabra (ver abajo) |
| **Exigente** | Escribís siempre, salvo la primera vez que ves una palabra |

En **Mixto** la exigencia sube con la palabra, no de golpe:

| Estado de la card | Qué te pide |
| --- | --- |
| Nunca la viste | Elegirla entre cuatro del mismo mazo y nivel |
| En los pasos de aprendizaje | Nada: la mirás entera, como siempre |
| Ya graduada | Escribir el significado |
| Intervalo de tres semanas o más | Escribirla **de oído**, sin verla |

Pedirle a alguien que escriba una palabra que ve por primera vez no es
exigencia, es una pared: no hay nada que recuperar todavía. Y seguir
mostrándole cuatro opciones a una palabra que hace un mes que sabe no le
enseña nada. El dictado aparece último porque entender un video es
justamente reconocer la palabra sin leerla, que es el objetivo de la app.

Al comparar lo que escribiste no se es quisquilloso: no importan los
acentos, las mayúsculas, la puntuación, el `to` del infinitivo ni los
artículos, y una respuesta separada por `/` acepta cualquiera de sus partes
(`darse cuenta / resolver`). Un error de tipeo en una palabra larga cuenta
como **Casi** y te marca la letra; en una de cuatro letras no, porque ahí
cambiar una letra cambia la palabra.

Y el resultado **tiene precio**, igual que las pistas: si la escribiste bien
podés votar lo que quieras; si le erraste por una letra el techo es "Bien";
y si no te salió, sólo queda "Otra vez". Calificar "Fácil" algo que no supiste
le mentiría al SRS y te mandaría la palabra a un mes.

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
- `js/decks.js` — carga de mazos, ranking por frecuencia y armado de la cola del día
- `js/quiz.js` — los modos de práctica activa y la comparación de respuestas
- `js/plan.js` — proyección de carga diaria, para recomendar la meta
- `js/app.js` — vistas y eventos

Para correrlo local hace falta un servidor (los módulos y `fetch` no andan con
`file://`):

```bash
npm run serve   # o: python3 -m http.server 8000
```

### Las pruebas

El planificador es lo que no se puede romper: si programa mal, las palabras
vuelven cuando ya te las olvidaste, y eso no se nota hasta semanas después.
`test/` fija su comportamiento — los pasos de aprendizaje, los topes del ease,
el reaprendizaje, el fuzz — y también la comparación de respuestas escritas,
que es el otro lugar donde un cambio chico hace daño silencioso.

```bash
npm test
```

No hay dependencias: usa el runner que trae Node.

## Licencia

MIT.
