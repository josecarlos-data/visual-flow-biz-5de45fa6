/**
 * Prompt y esquema de extracción de la nota de voz.
 *
 * Vive aparte de `index.ts` (y sin ninguna API de Deno) para que el banco de pruebas
 * de `scripts/bench-visita-voz/` pueda importar exactamente lo que se despliega:
 * si el prompt cambia aquí, la comparativa se reejecuta contra este mismo texto.
 *
 * HISTORIAL DE VERSIONES
 * - fase4.1 (07/08/2026) — Primera versión multibloque: 11 motivos, un array por motivo,
 *   `campos_meta` con cita literal completa y confianza. Modelo openai/gpt-5.6-sol.
 * - fase4.2 (08/08/2026) — Tras probar con tres narraciones reales:
 *   · Modelo de extracción a openai/gpt-5.6-luna (+ temperature 0 si el modelo lo admite).
 *   · Regla imperativa: competidor o precio ajeno => SIEMPRE bloque `competencia`
 *     ADEMÁS del bloque de seguimiento/revisión que corresponda.
 *   · Citas acortadas a 5-10 palabras (antes frase completa).
 *   · System prompt fijo y cacheado, idéntico entre llamadas (prompt caching).
 *   · Transcripción con vocabulario del sector en el parámetro `prompt`.
 *   · Referencias basura descartadas en servidor (mínimo 3 caracteres y algún dígito).
 *   · El cliente nunca se deduce de la transcripción: viene dado por la app.
 * - fase4.3 (09/08/2026) — Tras la comparativa sol vs luna (se queda luna):
 *   · UN BLOQUE POR COMPARATIVA: cada referencia comparada con su precio es un bloque
 *     `competencia` independiente; prohibido resumir varias comparativas en uno.
 *   · `seguimiento` solo se instancia si NO se ha creado ningún otro bloque, salvo
 *     contenido sobrante que no encaje en ninguno de ellos.
 * - fase4.4 (12/08/2026) — Criterios afinados tras procesar 18.647 observaciones del histórico:
 *   · Ejemplos de competidores corregidos (Recanor no existe): Luis Moleón, Grupo Peña, Eurorecambios.
 *   · Nueva sección ALIAS Y NORMALIZACIÓN (LM, Peña, Titan/TitanX, Garret, Lemforder, Alko,
 *     Mann Filter, recambio original con la marca del fabricante, servicio oficial).
 *   · Campos con opciones: si el valor no está en la lista va a null y el literal al texto libre
 *     del bloque; prohibido forzar a "Otra" ni al valor más parecido.
 *   · Un solo valor en los select (marca_competencia); " | " es exclusivo de multiselect.
 *   · Nueva sección de reglas para `informacion_potencial` (potencial de compra del cliente).
 */
export const VERSION_PROMPT = "fase4.4";

/**
 * Extracción: clasificar y rellenar campos con reglas explícitas. No es razonamiento,
 * por eso va con el modelo rápido y `reasoning_effort: "none"`.
 */
export const MODELO_EXTRACCION = "openai/gpt-5.6-luna";

/**
 * Lectura de albaranes fotografiados (fase B): necesita entrada de imagen.
 * Si la pasarela lo rechaza, el 400 queda en los logs con el detalle y se cambia aquí.
 */
export const MODELO_VISION = "google/gemini-3.6-flash";

export interface CampoDef {
  motivo_key: string;
  campo_key: string;
  label: string;
  ayuda: string | null;
  tipo: string;
  is_required: boolean;
  requerido_validacion: boolean;
  sort_order: number;
  opciones: string[];
}

export interface MotivoDef {
  key: string;
  nombre: string;
  descripcion: string | null;
  campos: CampoDef[];
}

/** Campos que NUNCA van al modelo: inactivos, de sistema, adjuntos y campañas. */
export function admiteIA(c: { is_active: boolean; visibilidad: string; tipo: string }) {
  return (
    c.is_active &&
    c.visibilidad === "normal" &&
    c.tipo !== "adjunto" &&
    c.tipo !== "referencia_campana"
  );
}

/** Descripción de un campo para el modelo: la ayuda de la plantilla es la fuente. */
export function descripcionCampo(c: CampoDef): string {
  const partes = [`${c.label}.`];
  if (c.ayuda) partes.push(c.ayuda);
  if (c.opciones.length)
    partes.push(
      `Valores permitidos: ${c.opciones.join(" / ")}. Si lo que dice el comercial no coincide con ninguno, deja el campo a null ` +
        "y anota el término literal en el texto libre del bloque (conclusion en competencia, observaciones en el resto). " +
        "Nunca lo fuerces a 'Otra' ni al valor más parecido.",
    );
  if (c.tipo === "multiselect") partes.push("Si son varios, sepáralos con ' | '.");
  else if (c.opciones.length) partes.push("Un solo valor: ' | ' es exclusivo de los campos multiselect.");
  if (c.tipo === "booleano") partes.push("Responde 'si' o 'no'.");
  if (c.tipo === "numero") partes.push("Solo el número, sin símbolo de moneda.");
  if (c.tipo === "fecha") partes.push("Formato AAAA-MM-DD.");
  if (c.tipo === "referencia") {
    partes.push(
      "Devuelve la referencia TAL CUAL la dice el comercial, sin corregirla ni completarla. " +
        "Debe ser una referencia de verdad (lleva dígitos); nunca una palabra suelta de la conversación. " +
        "Si no menciona ninguna, null.",
    );
  }
  partes.push("null si la narración no dice nada de este punto.");
  return partes.join(" ");
}

export function esquemaCampos(campos: CampoDef[]) {
  const properties: Record<string, unknown> = {};
  for (const c of campos) {
    properties[c.campo_key] = {
      type: c.tipo === "numero" ? ["number", "null"] : ["string", "null"],
      description: descripcionCampo(c),
    };
  }
  return {
    type: "object",
    properties,
    required: campos.map((c) => c.campo_key),
    additionalProperties: false,
  };
}

const DESC_CITA =
  "Fragmento LITERAL de la transcripción, de 5 a 10 palabras, que justifica el valor. No la frase entera, solo el trozo que lo prueba.";

export function esquemaBloque(m: MotivoDef) {
  return {
    type: "object",
    properties: {
      campos: esquemaCampos(m.campos),
      evidencias: {
        type: "array",
        description:
          "Una entrada por cada campo que hayas rellenado (no para los que dejas a null), con el fragmento literal que lo justifica.",
        items: {
          type: "object",
          properties: {
            campo: { type: "string", enum: m.campos.map((c) => c.campo_key) },
            cita: { type: "string", description: DESC_CITA },
            confianza: { type: "string", enum: ["alta", "media", "baja"] },
          },
          required: ["campo", "cita", "confianza"],
          additionalProperties: false,
        },
      },
    },
    required: ["campos", "evidencias"],
    additionalProperties: false,
  };
}

export function esquemaExtraccion(motivos: MotivoDef[]) {
  const properties: Record<string, unknown> = {
    resultado_visita: {
      type: "string",
      enum: ["efectiva", "cliente_ausente", "cerrado", "sin_acceso"],
      description:
        "efectiva = ha hablado con el cliente. cliente_ausente = no estaba. cerrado = el taller estaba cerrado. sin_acceso = no le han dejado pasar.",
    },
  };
  for (const m of motivos) {
    const extra =
      m.key === "competencia"
        ? " OBLIGATORIO: si en la narración hay un competidor nombrado o un precio de otro proveedor, esta lista NO puede quedar vacía." +
          " Una comparativa por referencia y precio: si compara varias referencias, devuelve un elemento por cada una, nunca uno agrupado."
        : "";
    properties[`bloques_${m.key}`] = {
      type: "array",
      description:
        `${m.nombre}. ${m.descripcion ?? ""} Añade un elemento por cada asunto distinto de este tipo que aparezca en la narración ` +
        "(dos ofertas distintas = dos elementos). Deja la lista vacía si no hay ningún dato real de este tipo." + extra,
      items: esquemaBloque(m),
    };
  }
  return {
    type: "object",
    properties,
    required: ["resultado_visita", ...motivos.map((m) => `bloques_${m.key}`)],
    additionalProperties: false,
  };
}

/** System prompt: FIJO entre llamadas (prompt caching). Nada variable aquí. */
export function sistemaExtraccion(motivos: MotivoDef[]) {
  const catalogo = motivos
    .map((m) => `- ${m.key} (${m.nombre}): ${m.descripcion ?? ""}`)
    .join("\n");
  return (
    "Eres el asistente de un comercial de recambios de automoción. Recibes la transcripción de una nota de voz grabada tras una " +
    "visita a un cliente y la repartes en bloques, uno por cada asunto tratado.\n\n" +
    `MOTIVOS DISPONIBLES:\n${catalogo}\n\n` +
    "REGLAS DE SELECCIÓN DE MOTIVO:\n" +
    "- revision_seguimiento solo si se revisa algo concreto de una visita anterior (una oferta ya pasada, un compromiso previo). " +
    "Si es una oferta nueva, es promocion.\n" +
    "- seguimiento es el cajón de último recurso: SOLO se instancia si no has creado ningún otro bloque. Si ya hay al menos un " +
    "bloque de otro motivo, no añadas seguimiento salvo que quede contenido concreto que no encaje en ninguno de ellos; en ese " +
    "caso el bloque recoge únicamente ese contenido sobrante, nunca un resumen de lo ya repartido.\n" +
    "- COMPETENCIA, REGLA IMPERATIVA: si en la narración aparece un competidor nombrado (Luis Moleón, Grupo Peña, Eurorecambios, etc.) o un precio " +
    "de otro proveedor, creas SIEMPRE un bloque competencia con competidor, precio_rimosa, precio_competencia y resultado_venta. " +
    "Va ADEMÁS del bloque de seguimiento o de revisión que corresponda: no son excluyentes, la misma situación genera los dos. " +
    "Los precios de la comparativa nunca se quedan solo dentro de un texto libre como motivo_perdida; van a sus campos numéricos " +
    "del bloque competencia.\n" +
    "- UN BLOQUE POR COMPARATIVA: cada referencia comparada es una comparativa independiente. Si el comercial compara dos o más " +
    "referencias o productos con precios distintos, devuelves un bloque competencia por cada uno, con su referencia, sus dos " +
    "precios y su resultado_venta. Nunca resumas varias comparativas en un solo bloque ni dejes resultado_venta vacío.\n" +
    "  Ejemplo: «se los compra a Eurorecambios a 120 cuando nosotros lo tenemos a 142, me ha enseñado el albarán» => " +
    "un bloque revision_seguimiento con resultado 'Venta perdida' Y un bloque competencia con competidor=Eurorecambios, " +
    "precio_competencia=120, precio_rimosa=142, resultado_venta el que corresponda.\n" +
    "  Ejemplo con dos referencias: «la batería de 110 se la dan a 78 y nosotros a 92, y la de 140 a 105 frente a nuestros 121» => " +
    "DOS bloques competencia: uno con precio_competencia=78 y precio_rimosa=92, otro con precio_competencia=105 y " +
    "precio_rimosa=121, cada uno con su referencia y su resultado_venta.\n" +
    "- Un motivo solo se instancia si hay al menos un dato real en la narración. Nunca crees un bloque vacío por si acaso.\n" +
    "- Si el mismo motivo aparece dos veces con contenido distinto, devuelve dos elementos en su lista, nunca uno con los datos mezclados.\n\n" +
    "ALIAS Y NORMALIZACIÓN (usa siempre el nombre de catálogo, no el que suene en la grabación):\n" +
    "- 'LM', 'L.M.', 'LMR', 'Luis', 'Moleón' => Luis Moleón.\n" +
    "- 'Peña', 'G. Peña' => Grupo Peña.\n" +
    "- Salysan es una empresa aparte: NO es Eurorecambios ni se mezcla con ella.\n" +
    "- 'Titan' es TitanX (radiadores), nunca Titanium (que es marca de baterías).\n" +
    "- 'Garret' => Garrett. 'Knorr-Bremse' => Knorr. 'Lemforder' => Lemförder. 'Alko' => AL-KO.\n" +
    "- 'MANN FILTER', 'Mann', 'Mann-Filter' => Mann Filter.\n" +
    "- El recambio original se registra con la marca del fabricante: «lo compra original DAF» => DAF.\n" +
    "- «se lo ofrecen en la Renault», «en el servicio oficial» => competidor 'Servicio oficial de la marca', " +
    "y la marca concreta se anota en conclusion.\n\n" +
    "INFORMACION_POTENCIAL (alimenta la ficha del cliente y el cálculo de su potencial de compra):\n" +
    "- tipo_negocio decide con qué fórmula se calcula el potencial. Flotista: tiene vehículos propios («flota de 35 camiones»). " +
    "Taller: repara vehículos de terceros («es taller de turismo»). Mixto: ambas cosas. Si el texto no permite distinguirlo va a " +
    "null: un valor inventado falsea el potencial de ese cliente.\n" +
    "- num_mecanicos son mecánicos NO electromecánicos. Si el comercial solo dice «cuatro mecánicos» sin distinguir, van todos a " +
    "num_mecanicos y num_electromecanicos queda a null. No repartas a ojo.\n" +
    "- marca_remolque y tipo_ejes son campos distintos: un remolque Schmitz puede montar ejes BPW o SAF. «remolque Schmitz con ejes " +
    "SAF» son dos campos, no uno.\n" +
    "- segmento_vehiculo recoge remolques, plataformas, frigoríficos, autobuses y furgonetas. En marcas_vehiculo van solo fabricantes.\n" +
    "- proveedor_principal solo si el texto dice cuál es el principal. Si nombra varios sin jerarquía, va a null y los nombres a " +
    "observaciones.\n" +
    "- potencial_estimado solo si el comercial da una cifra anual explícita. Nunca lo calcules.\n\n" +
    "REGLAS DE CONTENIDO:\n" +
    "- El cliente YA viene dado por la aplicación: no lo deduzcas de la transcripción ni lo devuelvas.\n" +
    "- No inventes: si la narración no dice nada de un campo, ese campo va a null.\n" +
    "- En los campos con lista de opciones: si el valor que dice el comercial no está en la lista, deja el campo a null y anota el " +
    "término literal en el texto libre del bloque (conclusion en competencia, observaciones en el resto). Nunca lo fuerces a 'Otra' " +
    "ni al valor más parecido de la lista.\n" +
    "- UN SOLO VALOR EN LOS CAMPOS SELECT: marca_competencia admite una única marca. Si el comercial nombra dos («Borygo Maflow»), " +
    "son dos comparativas distintas y van en dos bloques competencia, o la segunda se anota en conclusion. El separador ' | ' es " +
    "exclusivo de los campos multiselect.\n" +
    "- Las referencias de producto se devuelven tal cual las dice el comercial; no las corrijas ni las aproximes, y nunca " +
    "conviertas una palabra suelta en referencia.\n" +
    "- Redacta los textos en español, en tercera persona, breve y concreto.\n" +
    "- Por cada campo relleno añade una evidencia con un fragmento literal de 5 a 10 palabras y tu nivel de confianza."
  );
}

/** Mensaje de usuario: lo variable va SIEMPRE después del system, nunca dentro de él. */
export function usuarioExtraccion(transcripcion: string, clienteNombre: string) {
  return (
    (clienteNombre ? `Cliente (ya seleccionado en la aplicación, no lo deduzcas): ${clienteNombre}\n\n` : "") +
    `Transcripción de la nota de voz:\n"""\n${transcripcion}\n"""`
  );
}
