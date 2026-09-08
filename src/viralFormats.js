// Biblioteca de formatos virales.
//
// Un formato NO es una idea: es la receta de una idea. "Pantone del producto"
// funciona igual para una heladeria, un estudio de pilates o una pizzeria — lo
// que cambia es el producto que entra en la receta. Por eso el catalogo es
// agnostico de rubro y el modelo lo aterriza a cada marca en el momento de
// generar.
//
// Vive en codigo, no en la base, por la misma razon que los prompts: es
// contenido editorial nuestro y se versiona con el deploy. `listViralFormats`
// y `getViralFormat` son la UNICA costura por la que pasan las rutas y la UI,
// asi que mover esto a una tabla mas adelante es reescribir estas dos funciones
// y nada mas.
//
// Campos de cada formato:
//   receta   -> instrucciones para el generador de copy (define la estructura)
//   muestra  -> brief visual para la imagen de muestra del catalogo
//   por_que  -> por que funciona, en criollo, para que el cliente lo entienda

import { AppError } from './errors.js';

export const PILARES = [
  {
    id: 'deseo',
    nombre: 'Deseo',
    descripcion: 'Piezas que dan ganas. No explican: provocan.'
  },
  {
    id: 'producto',
    nombre: 'Producto',
    descripcion: 'Mostrar lo que vendes sin que parezca siempre la misma foto.'
  },
  {
    id: 'creativo',
    nombre: 'Creativo',
    descripcion: 'Los que la gente guarda y manda a un amigo.'
  },
  {
    id: 'comunidad',
    nombre: 'Comunidad',
    descripcion: 'Las personas detras del negocio y las que ya te eligen.'
  },
  {
    id: 'diversos',
    nombre: 'Diversos',
    descripcion: 'Los que rompen el patron del feed y hacen comentar.'
  }
];

const FORMATOS = [
  // --- DESEO ---------------------------------------------------------------
  {
    id: 'macro-sensorial',
    pilar: 'deseo',
    nombre: 'Macro sensorial',
    gancho: 'Un primerisimo plano del detalle que da ganas',
    por_que: 'El cerebro reacciona a la textura antes que al texto. Es la forma mas rapida de generar antojo sin decir nada.',
    content_type: 'image',
    receta: 'Plano macro extremo del detalle mas apetecible/atractivo del producto o servicio: la textura, el brillo, el vapor, el grano, la terminacion. El titular es cortisimo (3 a 6 palabras) y sensorial, nombra la sensacion, no la promocion. Nada de precios ni ofertas: esta pieza vende con los ojos.',
    muestra: 'extreme macro close-up of an appetizing product texture, shallow depth of field, glistening highlights, warm editorial lighting, a very short sensory headline in elegant type anchored in the lower third'
  },
  {
    id: 'momento-exacto',
    pilar: 'deseo',
    nombre: 'El momento exacto',
    gancho: 'La pieza capturada en el instante justo de uso',
    por_que: 'Muestra el producto en accion, no en la gondola. El que mira se ve a si mismo ahi.',
    content_type: 'image',
    receta: 'La escena congelada en el segundo mas deseable: el primer mordisco, la mano que recibe, el momento en que el servicio se disfruta. Debe haber una persona o una mano en cuadro — el producto solo no alcanza. El titular habla desde ese instante, en presente.',
    muestra: 'candid photograph capturing the exact moment a product is being enjoyed, a hand entering the frame, natural window light, authentic and warm, short present-tense headline integrated into the composition'
  },
  {
    id: 'antes-despues',
    pilar: 'deseo',
    nombre: 'Antes y despues',
    gancho: 'La transformacion real, lado a lado',
    por_que: 'Es la prueba mas honesta que existe: el resultado se ve, no se promete. De los formatos con mas guardados.',
    content_type: 'carousel',
    receta: 'Carrusel de 3 placas: placa 1 el "antes" con el problema visible, placa 2 el "despues" con el resultado, placa 3 el cierre que explica que se hizo y cuanto tardo. Nada de exagerar el antes: la credibilidad es el activo. Si la marca no produce transformaciones visibles, el antes/despues es de una situacion (desorden -> orden, duda -> decision).',
    muestra: 'split-screen before and after comparison, left side dull and unresolved, right side bright and finished, clean dividing line, minimal labels in confident type'
  },
  {
    id: 'el-ritual',
    pilar: 'deseo',
    nombre: 'El ritual',
    gancho: 'Los pasos del disfrute, como ceremonia',
    por_que: 'Convierte un consumo de treinta segundos en una experiencia que se recuerda y se imita.',
    content_type: 'carousel',
    receta: 'Carrusel de 4 placas donde cada una es un paso del ritual de uso o consumo, numerado. Tono de ceremonia, no de instructivo de IKEA. La ultima placa es el momento de disfrute pleno. El titular de portada promete el ritual completo ("Como se toma de verdad un...").',
    muestra: 'first slide of an editorial carousel about a consumption ritual, elegant numbered step marker, refined still life, generous negative space, sophisticated serif headline'
  },
  {
    id: 'plano-cenital',
    pilar: 'deseo',
    nombre: 'Mesa tendida',
    gancho: 'Todo desplegado desde arriba, en orden perfecto',
    por_que: 'El plano cenital ordenado es hipnotico y muestra variedad y abundancia de un saque.',
    content_type: 'image',
    receta: 'Plano cenital (desde arriba) con varios elementos del negocio distribuidos con orden geometrico y espacio entre ellos: productos, herramientas, ingredientes, accesorios. La abundancia ordenada es el mensaje. Titular breve que nombre el conjunto, no cada pieza.',
    muestra: 'overhead flat lay photograph, multiple related items arranged in a precise geometric grid on a textured surface, even soft lighting, abundant but orderly, small confident headline in a corner'
  },

  // --- PRODUCTO ------------------------------------------------------------
  {
    id: 'pantone-producto',
    pilar: 'producto',
    nombre: 'Pantone del producto',
    gancho: 'Tu producto convertido en muestra de color',
    por_que: 'Un codigo visual que todo el mundo reconoce, aplicado a lo tuyo. Se guarda porque es lindo, no porque venda.',
    content_type: 'image',
    receta: 'El producto presentado como una muestra de color estilo catalogo de disenador: bloque de color plano sacado del producto, el producto apoyado sobre ese color, y abajo una etiqueta con el nombre del producto tratado como si fuera el nombre del color. El titular ES el nombre del producto. Sin bajada.',
    muestra: 'a product presented as a designer color swatch card, large flat color block sampled from the product, product resting on it, small caption label at the bottom like a paint chip, studio lighting, minimal and graphic'
  },
  {
    id: 'ficha-ilustrada',
    pilar: 'producto',
    nombre: 'Ficha tecnica ilustrada',
    gancho: 'El producto con sus partes senaladas, tipo despiece',
    por_que: 'Le da al producto un aire de objeto de diseno y justifica el precio sin hablar de precio.',
    content_type: 'image',
    receta: 'El producto en el centro, limpio, con lineas finas que salen hacia etiquetas cortas senalando sus componentes, ingredientes o diferenciales (3 a 5 llamadas, maximo 4 palabras cada una). Estetica de manual tecnico elegante. El titular nombra el producto; las llamadas hacen el resto.',
    muestra: 'technical exploded-diagram style product shot, thin callout lines pointing to short labels around a centered product, clean neutral background, precise engineering-manual aesthetic'
  },
  {
    id: 'grilla-catalogo',
    pilar: 'producto',
    nombre: 'La grilla completa',
    gancho: 'Todas tus opciones en una sola placa ordenada',
    por_que: 'Responde de una vez la pregunta que mas llega por mensaje: "que tenes?". Se guarda para volver a mirarlo.',
    content_type: 'image',
    receta: 'Grilla ordenada (3x2 o 3x3) con las opciones reales del catalogo, cada una con su nombre corto debajo. Usa nombres y precios EXACTOS del catalogo de la marca; si no hay catalogo cargado, usa las opciones que aparezcan en el contexto y no inventes ninguna. Titular tipo indice ("Todo lo que hacemos", "La carta completa").',
    muestra: 'clean product grid layout, nine small product photos arranged in a 3x3 grid with short name labels underneath each, consistent lighting across cells, catalogue aesthetic, bold title at the top'
  },
  {
    id: 'lugar-imposible',
    pilar: 'producto',
    nombre: 'El lugar imposible',
    gancho: 'Tu producto donde jamas podria estar',
    por_que: 'La incongruencia frena el scroll. Es el formato que mas se comparte por privado.',
    content_type: 'image',
    receta: 'El producto insertado con total naturalidad en un contexto epico o absurdo donde no podria estar: el espacio, un monumento famoso, el fondo del mar, una pintura clasica. La ejecucion tiene que ser impecable y creible, no un collage berreta. El titular juega con la incongruencia, sin explicarla.',
    muestra: 'a everyday product placed with photorealistic seamlessness into an epic impossible location such as outer space or a famous monument, dramatic cinematic lighting, surreal but believable, witty short headline'
  },
  {
    id: 'tamano-real',
    pilar: 'producto',
    nombre: 'Tamano real',
    gancho: 'La escala comparada con algo cotidiano',
    por_que: 'Contesta visualmente la duda que frena la compra: cuanto es. Genera comentarios de gente sorprendida.',
    content_type: 'image',
    receta: 'El producto al lado de un objeto de escala universalmente conocida (una mano, una moneda, un celular, una taza) para que se entienda el tamano real de un vistazo. El titular remata la sorpresa del tamano con un dato concreto.',
    muestra: 'product photographed next to a familiar everyday object for scale comparison, side by side on a clean surface, honest documentary lighting, short headline stating the size'
  },

  // --- CREATIVO ------------------------------------------------------------
  {
    id: 'homenaje-clasico',
    pilar: 'creativo',
    nombre: 'Homenaje a un clasico',
    gancho: 'Una obra famosa reversionada con lo tuyo',
    por_que: 'La referencia cultural hace que la gente se sienta inteligente al entenderla. Y por eso la comparte.',
    content_type: 'image',
    receta: 'Una obra de arte o imagen ultra reconocible reinterpretada con el producto o el servicio como protagonista. Tiene que leerse la referencia en menos de un segundo. El titular es un guino corto, jamas explica el chiste. Sin bajada.',
    muestra: 'a world-famous classical painting recreated as a photograph with a modern product replacing the central subject, museum lighting, rich painterly colors, witty minimal caption'
  },
  {
    id: 'objeto-imposible',
    pilar: 'creativo',
    nombre: 'Objeto imposible',
    gancho: 'Tu producto convertido en otra cosa',
    por_que: 'Es puro oficio visual: demuestra que la marca tiene cabeza creativa, no solo mercaderia.',
    content_type: 'image',
    receta: 'El producto transformado visualmente en otro objeto que comparte su forma: una porcion que es un barrilete, un cono que es un cohete, una rueda que es un disco. La metafora tiene que ser limpia y entenderse sola. Titular de 3 a 5 palabras que confirme la metafora.',
    muestra: 'creative visual metaphor where a product is transformed into a different object sharing its silhouette, clean colored background, playful advertising art direction, minimal type'
  },
  {
    id: 'poster-pelicula',
    pilar: 'creativo',
    nombre: 'Poster de pelicula',
    gancho: 'La pieza como afiche de cine',
    por_que: 'Le da epica a algo cotidiano. Funciona clavado para lanzamientos y temporadas.',
    content_type: 'image',
    receta: 'La pieza compuesta como un afiche de cine: titulo inventado grande abajo o arriba, producto como protagonista iluminado con dramatismo, y una linea de tagline. El "titulo de la pelicula" es el image_headline. Nada de creditos ni letra chica ilegible.',
    muestra: 'dramatic movie poster composition featuring a product as the hero, cinematic rim lighting, deep shadows, large stylized title treatment at the bottom, one short tagline above it'
  },
  {
    id: 'producto-personaje',
    pilar: 'creativo',
    nombre: 'El producto como personaje',
    gancho: 'Con actitud propia, casi con cara',
    por_que: 'Humanizar el producto lo vuelve memorable y da pie a una saga que se puede repetir todo el ano.',
    content_type: 'image',
    receta: 'El producto puesto en una situacion con actitud humana: esperando, escapando, descansando, en problemas. La postura y el contexto le dan la personalidad, sin pegarle ojos ni caras dibujadas. El titular habla EN NOMBRE del producto, en primera persona.',
    muestra: 'a product staged with human-like attitude and body language in a small narrative scene, expressive composition, soft cinematic lighting, first-person short headline'
  },
  {
    id: 'titular-diario',
    pilar: 'creativo',
    nombre: 'Titular de diario',
    gancho: 'Tu novedad tratada como noticia de tapa',
    por_que: 'El formato noticia da urgencia e importancia a un anuncio que en un post comun pasaria desapercibido.',
    content_type: 'image',
    receta: 'La novedad de la marca compuesta como portada de diario o placa de noticiero: titular en tono periodistico, foto de apoyo, y una bajada corta tipo copete. El tono es serio-divertido, nunca fake news creible sobre terceros. Solo para anuncios reales.',
    muestra: 'newspaper front page composition announcing a product as breaking news, bold editorial headline typography, supporting photograph, short standfirst line, printed paper texture'
  },

  // --- COMUNIDAD -----------------------------------------------------------
  {
    id: 'frase-cliente',
    pilar: 'comunidad',
    nombre: 'La frase del cliente',
    gancho: 'Un testimonio real como protagonista',
    por_que: 'Vende mas la frase textual de un cliente que cualquier adjetivo que escriba la marca.',
    content_type: 'image',
    receta: 'Una frase textual y breve de un cliente como elemento dominante de la pieza, entrecomillada, sobre una foto del producto o del local. Debajo, chiquito, el nombre de pila. Usa solo testimonios que figuren en el contexto de la marca; si no hay ninguno, la pieza debe pedirlos en vez de inventar uno.',
    muestra: 'a short customer quote set in large elegant type as the dominant element over a softly blurred product photograph, small attribution name underneath, warm editorial mood'
  },
  {
    id: 'detras-escena',
    pilar: 'comunidad',
    nombre: 'Detras de escena',
    gancho: 'Como se hace, con las manos en la masa',
    por_que: 'El proceso genera confianza y justifica el precio: se ve el trabajo que hay atras.',
    content_type: 'image',
    receta: 'Foto de proceso real, con manos trabajando y algo de desprolijidad honesta: harina, herramientas, pantalla a medio hacer, cables. Nada de estudio impecable. El titular cuenta un dato concreto del proceso (cuanto tarda, cuantos pasos, a que hora empieza).',
    muestra: 'authentic behind-the-scenes photograph of hands at work in a real workspace, natural light, honest imperfect details, documentary feel, short factual headline'
  },
  {
    id: 'el-equipo',
    pilar: 'comunidad',
    nombre: 'La persona detras',
    gancho: 'Nombre, cara y oficio de quien lo hace',
    por_que: 'La gente le compra a personas. Presentar al equipo sube el alcance porque rompe el feed de productos.',
    content_type: 'image',
    receta: 'Retrato de una persona del equipo en su puesto de trabajo, mirando a camara, con su nombre y su rol. El titular es una frase corta de esa persona sobre lo que hace. Nunca un retrato generico de banco de imagenes: tiene que parecer una persona real de este negocio.',
    muestra: 'environmental portrait of a craftsperson at their workstation looking at the camera, natural light, name and role in small clean type at the bottom, warm authentic mood'
  },
  {
    id: 'esto-o-aquello',
    pilar: 'comunidad',
    nombre: 'Esto o aquello',
    gancho: 'Dos opciones, que elijan en comentarios',
    por_que: 'Es la forma mas barata de conseguir comentarios, y los comentarios son lo que mas empuja el alcance.',
    content_type: 'image',
    receta: 'Pieza partida al medio con dos opciones reales del negocio enfrentadas, una de cada lado, tratadas con identica jerarquia. En el centro, un separador tipo "o". El titular es la pregunta directa. La bajada invita a responder en comentarios, sin sonar a pedido desesperado.',
    muestra: 'split composition with two competing product options facing each other, identical visual weight on both halves, a central divider mark, direct question headline across the top'
  },

  // --- DIVERSOS ------------------------------------------------------------
  {
    id: 'mitos-verdades',
    pilar: 'diversos',
    nombre: 'Mitos y verdades',
    gancho: 'Lo que todos creen del rubro, y lo que es',
    por_que: 'Posiciona a la marca como la que sabe. Es de los formatos que mas se guardan.',
    content_type: 'carousel',
    receta: 'Carrusel de 4 a 5 placas: la portada anuncia los mitos del rubro, y cada placa siguiente toma UN mito y lo desarma con el dato real. Estructura fija por placa: el mito arriba (tachado o marcado como falso) y la verdad abajo. La ultima placa cierra con la postura de la marca.',
    muestra: 'first slide of an educational carousel about myths in an industry, bold typographic cover with a crossed-out word, confident editorial layout, strong color contrast, minimal illustration'
  },
  {
    id: 'errores-comunes',
    pilar: 'diversos',
    nombre: 'Los errores de siempre',
    gancho: 'Lo que la mayoria hace mal, numerado',
    por_que: 'El formato lista con numero en la portada es el que mas alcance saca en Instagram. Sirve para cualquier rubro.',
    content_type: 'carousel',
    receta: 'Carrusel de 4 a 5 placas. La portada lleva el numero bien grande ("4 errores al..."). Cada placa desarrolla UN error y como corregirlo, en dos lineas. La ultima placa cierra con la invitacion a guardar el post. El error tiene que ser especifico del rubro, no un consejo de galletita de la fortuna.',
    muestra: 'carousel cover slide with a very large numeral and a short list title, bold modern typography, strong flat background color, one small supporting illustration'
  },
  {
    id: 'linea-de-tiempo',
    pilar: 'diversos',
    nombre: 'Linea de tiempo',
    gancho: 'Como cambio el rubro (o el negocio) con los anos',
    por_que: 'La nostalgia y el dato historico hacen comentar a la gente que se acuerda de cada epoca.',
    content_type: 'image',
    receta: 'Una linea de tiempo vertical u horizontal con 4 o 5 hitos, cada uno con su ano y una descripcion de pocas palabras. Puede ser la historia del rubro o la del propio negocio si el contexto la tiene. Datos reales unicamente. El titular anuncia el recorrido.',
    muestra: 'clean infographic timeline with four or five year markers and short labels along a vertical line, editorial poster layout, restrained palette, strong title at the top'
  },
  {
    id: 'test-visual',
    pilar: 'diversos',
    nombre: 'Test visual',
    gancho: 'Una pregunta visual que obliga a responder',
    por_que: 'La gente no puede no contestar. Es un imán de comentarios y no habla de vender.',
    content_type: 'image',
    receta: 'Una pregunta visual simple y contestable de un vistazo, hecha con elementos del negocio: cuantos hay, cual es distinto, que ves primero, cual falta. La respuesta no se revela en la pieza: se pide en comentarios. El titular ES la pregunta.',
    muestra: 'playful visual puzzle made of repeating product icons where one differs, flat graphic style, bold question headline at the top, high contrast background'
  },
  {
    id: 'opinion-tajante',
    pilar: 'diversos',
    nombre: 'Opinion tajante',
    gancho: 'Una postura discutible del rubro, sin rodeos',
    por_que: 'Dividir opiniones genera debate en comentarios y le da personalidad a la marca. Es el formato de mayor riesgo y mayor retorno.',
    content_type: 'image',
    receta: 'Una afirmacion tajante y discutible sobre el rubro (nunca sobre personas, competidores ni temas sensibles), tipografia dominante sobre fondo casi liso, con poco o nada de foto. El titular es la opinion completa. La bajada la fundamenta en una linea. Que se banque el debate en comentarios.',
    muestra: 'bold typographic statement poster, a short opinionated sentence filling most of the frame, almost no imagery, strong flat background color, confident condensed type'
  },
  {
    id: 'glosario-rubro',
    pilar: 'diversos',
    nombre: 'El termino que nadie entiende',
    gancho: 'Una palabra tecnica del rubro, explicada facil',
    por_que: 'Educar sin vender construye autoridad, y el que aprende algo se queda siguiendo la cuenta.',
    content_type: 'image',
    receta: 'Un termino tecnico del rubro presentado como entrada de diccionario: la palabra grande, su pronunciacion o categoria en chiquito, y una definicion de una linea en criollo. Cierra con por que le importa al cliente. Estetica de diccionario, ordenada y con mucho aire.',
    muestra: 'dictionary entry layout as a poster, one large headword with a small phonetic line beneath it and a one-sentence plain-language definition, generous white space, elegant serif typography'
  },
  {
    id: 'promo-relampago',
    pilar: 'diversos',
    nombre: 'Promo relampago',
    gancho: 'Valida solo hoy, para los que ya te siguen',
    por_que: 'La urgencia real convierte. Va en historia porque desaparece igual que la promo.',
    content_type: 'story',
    receta: 'Historia vertical con una promo concreta valida solo hoy: que es, cuanto sale, hasta que hora. Estetica de historia (informal, tipo sticker), no de placa de vidriera. El texto de la imagen tiene que decir el producto Y la condicion — la historia no lleva caption, asi que si la pieza sola no se entiende, no sirve. Usa precios exactos del catalogo.',
    muestra: 'vertical Instagram story with an informal flash-promo sticker aesthetic, handwritten-feel type over a casual product photo, a clear price and a time limit, spontaneous phone-shot look'
  }
];

const BY_ID = new Map(FORMATOS.map((formato) => [formato.id, formato]));

// --- Capa de acceso ---------------------------------------------------------
// Todo lo de afuera entra por aca. Son async a proposito: el dia que el
// catalogo salga de una tabla, cambia el cuerpo y nada mas.

export async function listViralFormats({ pilar = null } = {}) {
  const items = pilar ? FORMATOS.filter((formato) => formato.pilar === pilar) : FORMATOS;
  return items.map((formato) => ({ ...formato }));
}

export async function getViralFormat(id) {
  const formato = BY_ID.get(String(id || ''));
  if (!formato) {
    throw new AppError(`El formato "${id}" no existe.`, 404, 'VIRAL_FORMAT_NOT_FOUND');
  }
  return { ...formato };
}

export function viralFormatIds() {
  return FORMATOS.map((formato) => formato.id);
}
