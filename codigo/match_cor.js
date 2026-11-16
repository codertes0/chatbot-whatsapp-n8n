// === MATCH DE COR — nó "Match Cor" (Code, "Run Once for All Items") ===
// Entrada: linhas da aba Catálogo (Google Sheets) em $input.all()
// Cor pedida + dados do cliente: vêm do nó "Processar Saída AI1"
// Saída: 1 item por produto escolhido, já no formato do nó de envio de imagem.

const ctx = $('Processar Saída AI1').first().json;
const corPedida = (ctx.corSolicitada || '').toString();
const numero = (ctx.From || '').replace('@s.whatsapp.net', '');
const Instance = ctx.Instance;

const MAX_RESULTADOS = 4;
const LIMITE_GRAUS = 85; // só considera "cor próxima" até ~85° no círculo de matiz

// --- normalização de texto (remove acentos, minúsculo) ---
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// --- matiz de referência por família cromática (0-360) ---
const FAMILIA_HUE = {
  vermelho: 0, laranja: 30, amarelo: 55, verde: 120,
  ciano: 180, azul: 215, roxo: 275, rosa: 330, marrom: 28,
};
const NEUTRAS = new Set(['branco', 'preto', 'cinza', 'bege', 'marrom', 'dourado', 'prata', 'transparente', 'multicolor']);

// --- dicionário palavra -> família (1ª ocorrência vence) ---
const SINONIMOS = {
  vermelho: ['vermelho', 'vermelha', 'rubro', 'escarlate', 'carmim', 'vinho', 'bordo', 'rubi', 'cereja', 'sangue', 'goiaba'],
  laranja: ['laranja', 'alaranjado', 'laranjado', 'coral', 'ferrugem', 'terracota', 'ambar', 'tangerina', 'salmao', 'pessego', 'damasco', 'abobora'],
  amarelo: ['amarelo', 'amarela', 'mostarda', 'canario', 'citrino', 'limao', 'gema', 'milho'],
  verde: ['verde', 'esmeralda', 'jade', 'oliva', 'musgo', 'menta', 'lima', 'militar', 'agua'],
  ciano: ['ciano', 'turquesa', 'aquamarine', 'tiffany'],
  azul: ['azul', 'marinho', 'royal', 'anil', 'indigo', 'celeste', 'cobalto', 'safira'],
  roxo: ['roxo', 'roxa', 'violeta', 'lilas', 'lavanda', 'purpura', 'ametista', 'uva', 'berinjela'],
  rosa: ['rosa', 'pink', 'magenta', 'fucsia', 'rose', 'rosado'],
  marrom: ['marrom', 'castanho', 'cafe', 'chocolate', 'caramelo', 'tabaco', 'sepia', 'terra', 'cobre', 'bronze', 'noz', 'madeira'],
  bege: ['bege', 'creme', 'nude', 'areia', 'cru', 'natural', 'champagne', 'champanhe', 'marfim', 'offwhite'],
  branco: ['branco', 'branca', 'perola', 'nacarado', 'neve', 'gelo'],
  preto: ['preto', 'preta', 'negro', 'onix'],
  cinza: ['cinza', 'chumbo', 'grafite', 'fume'],
  dourado: ['dourado', 'dourada', 'ouro', 'gold'],
  prata: ['prata', 'prateado', 'prateada', 'silver'],
  transparente: ['transparente', 'cristal', 'incolor', 'translucido'],
  multicolor: ['colorido', 'colorida', 'multicolor', 'mix', 'variado', 'sortido', 'arcoiris'],
};

// dicionário plano palavra -> família
const PALAVRA_FAMILIA = {};
for (const [fam, palavras] of Object.entries(SINONIMOS)) {
  for (const p of palavras) if (!(p in PALAVRA_FAMILIA)) PALAVRA_FAMILIA[p] = fam;
}

// adjacência entre neutras (pra "branco" também sugerir bege/pérola etc.)
const NEUTRA_VIZINHAS = {
  branco: ['branco', 'bege', 'prata', 'transparente'],
  bege: ['bege', 'branco', 'marrom', 'dourado'],
  marrom: ['marrom', 'bege', 'dourado'],
  preto: ['preto', 'cinza'],
  cinza: ['cinza', 'preto', 'prata'],
  dourado: ['dourado', 'bege', 'amarelo', 'prata'],
  prata: ['prata', 'cinza', 'branco'],
  transparente: ['transparente', 'branco'],
  multicolor: ['multicolor'],
};

// --- detecta família a partir do texto do cliente ---
function familiaDoTexto(txt) {
  const tokens = norm(txt).split(/[^a-z]+/).filter(Boolean);
  for (const t of tokens) if (PALAVRA_FAMILIA[t]) return PALAVRA_FAMILIA[t];
  // tenta casar palavra composta (ex: "verde agua")
  const limpo = norm(txt).replace(/[^a-z]+/g, '');
  for (const [p, fam] of Object.entries(PALAVRA_FAMILIA)) if (limpo.includes(p)) return fam;
  return null;
}

// --- detecta intenção de CLARIDADE (claro/escuro), quando não há cor específica ---
const PALAVRAS_CLARO = ['claro', 'clara', 'claros', 'claras', 'clarinho', 'clarinha', 'clarinhos', 'clarinhas', 'claras', 'light', 'suave', 'suaves', 'pastel'];
const PALAVRAS_ESCURO = ['escuro', 'escura', 'escuros', 'escuras', 'dark', 'fechado', 'fechada', 'fechados', 'fechadas'];
function intencaoLuz(txt) {
  const tokens = norm(txt).split(/[^a-z]+/).filter(Boolean);
  if (tokens.some(t => PALAVRAS_ESCURO.includes(t))) return 'escuro';
  if (tokens.some(t => PALAVRAS_CLARO.includes(t))) return 'claro';
  return null;
}

// --- hex -> HSL (retorna {h,s,l} ou null) ---
function hexParaHsl(hex) {
  if (!hex) return null;
  const m = norm(hex).match(/[0-9a-f]{6}/);
  if (!m) return null;
  const n = parseInt(m[0], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

// distância circular de matiz (0-180)
function distHue(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// --- monta a legenda da imagem ---
function caption(row) {
  const nome = row.nome || row.id;
  const cor = row.cor_descricao ? `\n${row.cor_descricao}` : '';
  const preco = Number(String(row.preco).replace(',', '.')) || 0;
  const linhaPreco = preco > 0
    ? `\n💰 R$ ${preco} / ${row.unidade || 'fio'} · pedido mínimo ${row.moq || '-'}`
    : '';
  return `🪨 *${nome}*${cor}${linhaPreco}`;
}

function urlImagem(id) {
  return `https://drive.google.com/uc?export=download&id=${String(id).trim()}`;
}

// === seleção ===
const linhas = $input.all()
  .map(i => i.json)
  .filter(r => r && r.image_id && String(r.ativo || 'sim').toLowerCase() !== 'nao'
            && !String(r.image_id).includes('COLE_O_ID'));

const famPedida = familiaDoTexto(corPedida);
const luz = !famPedida ? intencaoLuz(corPedida) : null;
let escolhidos = [];

if (luz) {
  // pedido por claridade (claro/escuro): ordena pela luminosidade do hex
  const comHex = linhas.map(r => ({ r, hsl: hexParaHsl(r.hex) })).filter(x => x.hsl);
  comHex.sort((a, b) => luz === 'escuro' ? a.hsl.l - b.hsl.l : b.hsl.l - a.hsl.l);
  escolhidos = comHex.slice(0, MAX_RESULTADOS).map(x => x.r);
} else if (famPedida && NEUTRAS.has(famPedida)) {
  // pedido por cor neutra -> usa adjacência de neutras
  const aceitas = new Set(NEUTRA_VIZINHAS[famPedida] || [famPedida]);
  escolhidos = linhas
    .filter(r => aceitas.has(norm(r.familia_cor || '')))
    .slice(0, MAX_RESULTADOS);

} else if (famPedida) {
  // pedido por cor cromática -> ranqueia por proximidade de matiz
  const alvo = FAMILIA_HUE[famPedida];
  const ranqueado = linhas.map(r => {
    const fam = norm(r.familia_cor || '');
    const hsl = hexParaHsl(r.hex);
    // confia na família declarada: neutro nunca entra em busca cromática.
    let neutro = NEUTRAS.has(fam);
    let hue;
    if (!neutro) {
      if (hsl && hsl.s > 0.12) hue = hsl.h;                          // hex refina o tom
      else if (FAMILIA_HUE[fam] != null) hue = FAMILIA_HUE[fam];     // senão, matiz da família
      else neutro = true;
    }
    let dist = neutro ? 999 : distHue(alvo, hue);
    if (neutro && fam === 'marrom') dist = distHue(alvo, FAMILIA_HUE.marrom) + 40; // marrom = laranja apagado
    return { r, dist };
  }).sort((a, b) => a.dist - b.dist);

  escolhidos = ranqueado.filter(x => x.dist <= LIMITE_GRAUS).slice(0, MAX_RESULTADOS).map(x => x.r);
  if (escolhidos.length === 0 && ranqueado.length) escolhidos = [ranqueado[0].r]; // ao menos a mais próxima
}

// sem família reconhecida -> não envia imagem (o bot já respondeu em texto)
if (escolhidos.length === 0) return [];

return escolhidos.map(r => ({
  json: { url: urlImagem(r.image_id), caption: caption(r), numero, Instance },
}));
