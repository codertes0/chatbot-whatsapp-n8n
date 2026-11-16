// === Nó "Montar Imagens" (Code, "Run Once for All Items") ===
// Monta as fotos de [CATALOGO] e [IMAGEM:x] a partir da aba Catalogo (Google Sheets).
// Mesma legenda da busca por cor: nome + descrição + preço/pedido mínimo (sem telefone/site).

const ctx = $('Processar Saída AI1').first().json;
const ids = ctx.idsParaEnviar || [];
const numero = (ctx.From || '').replace('@s.whatsapp.net', '');
const Instance = ctx.Instance;

const rows = $input.all().map(i => i.json)
  .filter(r => r && r.image_id && String(r.ativo || 'sim').toLowerCase() !== 'nao');
const byId = {};
rows.forEach(r => { byId[r.id] = r; });

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

// preserva a ordem pedida em idsParaEnviar
const escolhidos = ids.map(id => byId[id]).filter(Boolean);
if (!escolhidos.length) return [];

return escolhidos.map(r => ({
  json: { url: urlImagem(r.image_id), caption: caption(r), numero, Instance },
}));
