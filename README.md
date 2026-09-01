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
- **Cuatro botones de dificultad** — Otra vez / Difícil / Bien / Fácil — con el
  próximo intervalo a la vista antes de elegir.
- **Racha diaria** al estilo Duolingo: sube sólo cuando llegás a tu meta del día.
- **Nivel de exigencia configurable**: Tranqui, Normal, Bestia, o los sliders a mano.
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

## Agregar tus propias palabras

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

JavaScript con módulos ES, sin dependencias ni build. Cuatro archivos:

- `js/srs.js` — el planificador SM-2, aislado y sin efectos secundarios
- `js/store.js` — persistencia en `localStorage`, racha e historial
- `js/decks.js` — carga de mazos y armado de la cola del día
- `js/app.js` — vistas y eventos

Para correrlo local hace falta un servidor (los módulos y `fetch` no andan con
`file://`):

```bash
python3 -m http.server 8000
```

## Licencia

MIT.
