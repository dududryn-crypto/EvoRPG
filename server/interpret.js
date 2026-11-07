'use strict';
/**
 * Interpretação de metas em linguagem natural e análise individual (versão local, determinística).
 *
 * - interpretLocal(texto) → rascunho estruturado (categoria, frequência, alvo, unidade, dias, parâmetros).
 * - analyzeLocal(rascunho, texto) → análise: clareza, dificuldade, complexidade, frequência, viabilidade,
 *   consistência, relevância, melhorias e distribuição de XP entre atributos com justificativa.
 *
 * É usada quando a IA não está configurada e como âncora da IA (a distribuição final sempre combina a
 * referência da categoria com a leitura do texto — ver blendWeights). Por ser determinística, metas
 * equivalentes recebem sempre a mesma análise.
 */
const G = require('./goaltypes');
const R = require('./rules');

const ATTRS = R.ATTRIBUTES;
const NAMES = Object.fromEntries(ATTRS.map((a) => [a, R.ATTRIBUTE_INFO[a].name]));

function norm(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const NUM_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, cem: 100, cento: 100, mil: 1000,
};
/** Troca números por extenso por dígitos e "meia hora" por "30 min". */
function numerify(t) {
  return t
    .replace(/\bmeia hora\b/g, '30 min').replace(/\bhora e meia\b/g, '90 min')
    .replace(/\b(\d+)\s*mil\b/g, (_, n) => String(Number(n) * 1000))
    .replace(/\b(um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|cem|mil)\b/g, (w) => String(NUM_WORDS[w]))
    .replace(/(\d),(\d)/g, '$1.$2');
}

// Palavras-chave → categoria (ordem importa: a primeira que casar vence).
const TYPE_RULES = [
  ['criatividade', /\bescrev/],
  ['carga', /\b(supino|agachamento|levantamento terra|terra|rosca|desenvolvimento|remada|leg press)\b.*\b\d+(\.\d+)?\s*kg\b|\b\d+(\.\d+)?\s*kg\b.*\b(supino|agachamento|terra|rosca|desenvolvimento|remada|leg press)\b/],
  ['peso', /\b(emagrec|perder peso|pesar \d|chegar (a|aos) \d+(\.\d+)?\s*kg|peso corporal|ganhar peso)/],
  ['agua', /\b(agua|hidrat|beber \d)/],
  ['calorias', /\b(caloria|kcal)\b/],
  ['proteinas', /\bproteina/],
  ['carboidratos', /\bcarboidrato/],
  ['gorduras', /\bgordura/],
  ['alimentacao', /\b(aliment|comer (melhor|bem|saudavel)|dieta|refeic|nutric)/],
  ['sono', /\b(dormir|sono|deitar cedo)\b/],
  ['meditacao', /\b(medit|respirac|mindful|atencao plena)/],
  ['calistenia', /\b(calistenia|flexoes|flexao|barra fixa|paralelas)\b/],
  ['musculacao', /\b(muscula|academia|treino de forca|treinar forca|hipertrofia|malhar|levantar peso|treinar pesado)/],
  ['corrida', /\b(corr(er|ida)|cooper|maratona|5k|10k)\b/],
  ['caminhada', /\b(caminh|andar|passos|trilha)/],
  ['ciclismo', /\b(pedal|bike|bicicleta|ciclismo)/],
  ['natacao', /\b(nadar|natacao|piscina)\b/],
  ['esporte', /\b(futebol|basquete|volei|tenis|luta|jiu|boxe|muay|judo|karate|esporte|surf|escalada)\b/],
  ['idiomas', /\b(ingles|espanhol|frances|alemao|italiano|japones|coreano|chines|mandarim|idioma|lingua estrangeira|libras)\b/],
  ['leitura', /\b(ler|leitura|livros?|paginas?)\b(?!.*\bescrev)/],
  ['criatividade', /\b(escrev|redac|poesia|poema|conto|roteiro|desenh|pint|music|tocar|violao|guitarra|piano|bateria|cantar|compor|criativ|fotograf|arte|artesanato|ilustra)/],
  ['estudo', /\b(estud|aula|curso|revis|materia|prova|concurso|vestibular|enem|faculdade|aprender|programa(r|cao))/],
  ['projetos', /\b(projeto|negocio|startup|portfolio|side project|canal|empreend)/],
  ['social', /\b(amigos?|familia|social|ligar para|encontrar|networking|voluntari|conversar com|sair com)\b/],
  ['produtividade', /\b(tarefa|produtiv|organiz|pomodoro|foco|planejar|agenda)/],
  ['habito_saude', /\b(alongar|alongamento|postura|skincare|sol|vitamina|saude)\b/],
];

const DEFAULTS = {
  musculacao: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  calistenia: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  caminhada: { period: 'daily', target: 30, unit: 'minutos' },
  corrida: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  ciclismo: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  natacao: { period: 'times_per_week', target: 2, unit: 'sessoes' },
  esporte: { period: 'times_per_week', target: 2, unit: 'sessoes' },
  outro_exercicio: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  carga: { period: 'total', target: null, unit: 'kg', deadlineDays: 90 },
  agua: { period: 'daily', target: 2.5, unit: 'L' },
  calorias: { period: 'daily', target: 2200, unit: 'kcal', mode: 'max' },
  proteinas: { period: 'daily', target: 120, unit: 'proteina' },
  carboidratos: { period: 'daily', target: 250, unit: 'carbo', mode: 'range' },
  gorduras: { period: 'daily', target: 70, unit: 'gordura', mode: 'range' },
  alimentacao: { period: 'daily', target: 3, unit: 'refeicoes' },
  sono: { period: 'daily', target: 8, unit: 'horas_sono' },
  meditacao: { period: 'daily', target: 10, unit: 'minutos' },
  peso: { period: 'total', target: null, unit: 'kg', deadlineDays: 120, mode: 'max' },
  habito_saude: { period: 'daily', target: 1, unit: 'sessoes' },
  leitura: { period: 'daily', target: 20, unit: 'paginas' },
  estudo: { period: 'daily', target: 60, unit: 'minutos' },
  idiomas: { period: 'daily', target: 20, unit: 'minutos' },
  habito_mente: { period: 'daily', target: 1, unit: 'sessoes' },
  social: { period: 'times_per_week', target: 2, unit: 'sessoes' },
  criatividade: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  projetos: { period: 'times_per_week', target: 3, unit: 'sessoes' },
  produtividade: { period: 'daily', target: 3, unit: 'tarefas' },
  habito_geral: { period: 'daily', target: 1, unit: 'sessoes' },
};

const UNIT_RULES = [
  ['km', /(\d+(?:\.\d+)?)\s*(km|quilometros?)\b/],
  ['passos', /(\d+(?:\.\d+)?)\s*passos\b/],
  ['paginas', /(\d+(?:\.\d+)?)\s*(paginas?|pags?)\b/],
  ['horas_sono', /(\d+(?:\.\d+)?)\s*(h|horas?)\b(?=.*\b(dormir|sono)\b)|\b(dormir|sono)\b.*?(\d+(?:\.\d+)?)\s*(h|horas?)\b/],
  ['horas', /(\d+(?:\.\d+)?)\s*(h|horas?)\b/],
  ['minutos', /(\d+(?:\.\d+)?)\s*(min|minutos?)\b/],
  ['ml', /(\d+(?:\.\d+)?)\s*ml\b/],
  ['L', /(\d+(?:\.\d+)?)\s*(l|litros?)\b/],
  ['kcal', /(\d+(?:\.\d+)?)\s*(kcal|calorias)\b/],
  ['proteina', /(\d+(?:\.\d+)?)\s*(g|gramas?)\b(?=.*proteina)|proteina.*?(\d+(?:\.\d+)?)\s*(g|gramas?)\b/],
  ['carbo', /(\d+(?:\.\d+)?)\s*(g|gramas?)\b(?=.*carboidrato)/],
  ['gordura', /(\d+(?:\.\d+)?)\s*(g|gramas?)\b(?=.*gordura)/],
  ['kg', /(\d+(?:\.\d+)?)\s*kg\b/],
  ['exercicios', /(\d+(?:\.\d+)?)\s*(exercicios|questoes|questões|problemas)\b/],
  ['tarefas', /(\d+(?:\.\d+)?)\s*tarefas?\b/],
  ['refeicoes', /(\d+(?:\.\d+)?)\s*refeic/],
  ['sessoes', /(\d+(?:\.\d+)?)\s*(sessoes|sessao|treinos?|aulas?)\b/],
];
const LABEL_RULES = /(\d+(?:\.\d+)?)\s*(palavras|musicas|desenhos|fotos|videos|posts|textos|capitulos|poemas|contatos|ligacoes|commits|licoes)\b/;

const EXERCISES = ['supino', 'agachamento', 'levantamento terra', 'terra', 'rosca', 'desenvolvimento', 'remada', 'leg press'];
const LANG = { ingles: 'inglês', espanhol: 'espanhol', frances: 'francês', alemao: 'alemão', italiano: 'italiano', japones: 'japonês', coreano: 'coreano', chines: 'chinês', mandarim: 'mandarim', libras: 'Libras' };

function stripIntent(text) {
  return String(text || '').trim()
    .replace(/^(eu\s+)?(quero|gostaria de|pretendo|preciso|vou|desejo|meu objetivo (e|é)|minha meta (e|é))\s+/i, '')
    .replace(/[.!]+$/, '');
}
/** Recupera do texto original as palavras (com acentos) correspondentes a um trecho normalizado. */
function restoreAccents(raw, normalized) {
  const words = String(raw).split(/\s+/);
  const target = normalized.split(' ');
  const nw = words.map((w) => norm(w).replace(/[^a-z0-9]/g, ''));
  for (let i = 0; i + target.length <= nw.length; i++) {
    if (target.every((x, j) => nw[i + j] === x)) return words.slice(i, i + target.length).join(' ').replace(/[.,!?]+$/, '');
  }
  return normalized;
}
function cap(s) { s = s.trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Lê o texto e devolve um rascunho de meta. `assumed` lista o que foi presumido (o usuário deve conferir). */
function interpretLocal(text, today) {
  const raw = String(text || '').slice(0, 400);
  const t = numerify(norm(raw));
  let type = 'habito_geral';
  for (const [k, re] of TYPE_RULES) if (re.test(t)) { type = k; break; }
  const T = G.GOAL_TYPES[type];
  const def = DEFAULTS[type] || { period: 'daily', target: 1, unit: 'sessoes' };
  const assumed = [];
  const draft = { type, name: cap(stripIntent(raw)).slice(0, 60) || T.name, period: null, target: null, unit: null, mode: (T.modes || ['min'])[0], days: [], params: {}, deadline: null, custom_fields: [] };

  // frequência
  const tpw = t.match(/(\d)\s*(x|vezes|dias)\s*(por|na|a|pela|em uma)?\s*semana/);
  if (tpw && T.periods.includes('times_per_week')) { draft.period = 'times_per_week'; draft.target = Math.min(7, Math.max(1, Number(tpw[1]))); draft.unit = 'sessoes'; }
  else if (/\b(por dia|ao dia|diariamente|todo dia|todos os dias|diario|diaria|cada dia|por noite|toda noite|todas as noites)\b/.test(t)) draft.period = 'daily';
  else if (/\b(por semana|semanal|semanalmente|na semana|toda semana)\b/.test(t)) draft.period = 'weekly';
  else if (/\b(por mes|mensal|mensalmente|no mes|todo mes)\b/.test(t)) draft.period = 'monthly';
  const dl = t.match(/\bem (\d+)\s*(dias|semanas|meses)\b|\bate (o fim do ano|dezembro)\b/);
  if (dl && T.periods.includes('total')) {
    draft.period = 'total';
    const n = dl[1] ? Number(dl[1]) * ({ dias: 1, semanas: 7, meses: 30 }[dl[2]]) : null;
    const base = new Date(`${today}T12:00:00Z`);
    const end = n ? new Date(base.getTime() + n * 864e5) : new Date(Date.UTC(base.getUTCFullYear(), 11, 31, 12));
    draft.deadline = end.toISOString().slice(0, 10);
  }
  if (/\b(segunda a sexta|dias uteis|dia util)\b/.test(t)) draft.days = [1, 2, 3, 4, 5];
  else if (/\b(fins? de semana|sabado e domingo)\b/.test(t)) draft.days = [0, 6];

  // quantidade e unidade
  if (draft.target === null) {
    for (const [u, re] of UNIT_RULES) {
      if (!(u in T.units)) continue;
      const m = t.match(re);
      if (m) { const n = Number(m.slice(1).find((x) => x && /^\d/.test(x))); if (n > 0) { draft.unit = u; draft.target = n; break; } }
    }
  }
  if (draft.target === null) {
    const lab = t.match(LABEL_RULES);
    const unitFor = ['quantidade', 'tarefas'].find((u) => u in T.units);
    if (lab && unitFor) { draft.unit = unitFor; draft.target = Number(lab[1]); draft.params.unit_label = lab[2].replace('licoes', 'lições').replace('musicas', 'músicas').replace('videos', 'vídeos').replace('capitulos', 'capítulos').replace('ligacoes', 'ligações'); }
  }
  // horas para metas que medem minutos
  if (draft.unit === 'horas' && !('horas' in T.units) && 'minutos' in T.units) { draft.unit = 'minutos'; draft.target *= 60; }
  if (draft.unit === 'minutos' && draft.target >= 60 && draft.target % 60 === 0 && 'horas' in T.units && /\bhoras?\b/.test(t)) { draft.unit = 'horas'; draft.target /= 60; }
  if (draft.unit === 'ml' && !('ml' in T.units)) { draft.unit = 'L'; draft.target /= 1000; }

  // parâmetros específicos
  if (type === 'carga') {
    const ex = EXERCISES.find((e) => t.includes(e)) || 'supino';
    draft.params.exercise = cap(ex === 'terra' ? 'levantamento terra' : ex);
    draft.period = 'total';
  }
  if (type === 'peso') {
    const m = t.match(/(chegar a|chegar aos|pesar|para)\s*(\d+(?:\.\d+)?)\s*kg/);
    draft.target = m ? Number(m[2]) : null; draft.unit = 'kg'; draft.period = 'total';
    draft.mode = /\bganhar\b/.test(t) ? 'min' : 'max';
  }
  if (type === 'estudo') {
    const m = t.match(/\b(?:estudar|aprender|revisar)\s+(?:a\s+)?(?!por\b|durante\b|todo\b|\d)([a-z ]{3,40}?)(?=\s+(?:por|durante|todos?|diariamente|\d|ate|na|no|em|a cada)\b|$)/);
    if (m) draft.params.subject = cap(restoreAccents(raw, m[1].trim())).slice(0, 60);
  }
  if (type === 'idiomas') { const k = Object.keys(LANG).find((l) => t.includes(l)); if (k) draft.name = cap(stripIntent(raw)).slice(0, 60); if (k && !/\d/.test(t)) draft.name = `Praticar ${LANG[k]}`; }

  // valores presumidos (texto vago)
  if (!draft.period) { draft.period = def.period; assumed.push('period'); }
  if (!T.periods.includes(draft.period)) { draft.period = T.periods[0]; assumed.push('period'); }
  if (draft.period === 'times_per_week') draft.unit = 'sessoes';
  const DAILY_DEFAULT = { criatividade: [20, 'minutos'], projetos: [30, 'minutos'], social: [1, 'sessoes'], esporte: [30, 'minutos'], musculacao: [45, 'minutos'], corrida: [20, 'minutos'] };
  if (draft.target === null && draft.period === 'daily' && DAILY_DEFAULT[type] && DAILY_DEFAULT[type][1] in T.units) { [draft.target, draft.unit] = DAILY_DEFAULT[type]; assumed.push('target'); }
  if (draft.target === null) {
    if (def.target !== null) { draft.target = def.period === 'times_per_week' && draft.period !== 'times_per_week' ? 1 : def.target; draft.unit = draft.period === 'times_per_week' ? 'sessoes' : def.unit; }
    assumed.push('target');
  }
  if (!draft.unit || !(draft.unit in T.units)) { draft.unit = draft.period === 'times_per_week' ? 'sessoes' : (def.unit in T.units ? def.unit : Object.keys(T.units)[0]); if (!assumed.includes('target')) assumed.push('unit'); }
  if (def.mode && !/\b(no minimo|pelo menos)\b/.test(t)) draft.mode = def.mode;
  if (/\b(no maximo|ate \d|menos de|nao passar)\b/.test(t) && (T.modes || []).includes('max')) draft.mode = 'max';
  if (draft.period === 'total' && !draft.deadline) {
    const base = new Date(`${today}T12:00:00Z`);
    draft.deadline = new Date(base.getTime() + (def.deadlineDays || 90) * 864e5).toISOString().slice(0, 10);
    assumed.push('deadline');
  }
  if (draft.period === 'daily' && !draft.days.length) draft.days = [0, 1, 2, 3, 4, 5, 6];
  draft.custom_fields = draft.params.unit_label ? [] : suggestFields(type, t);
  const vague = /\b(melhorar|desenvolver|aprender|ser mais|ficar mais|evoluir|cuidar)\b/.test(t) && assumed.includes('target');
  return { draft, assumed, vague };
}

/** Campos personalizados sugeridos para metas genéricas (registros do tipo "sessão"). */
function suggestFields(type, t) {
  const f = [];
  if (type === 'criatividade' && /escrev|redac|conto|roteiro|livro/.test(t)) f.push({ key: 'palavras', label: 'Palavras escritas', type: 'number', unit: 'palavras' });
  if (type === 'criatividade' && /music|tocar|violao|guitarra|piano|bateria|cantar/.test(t)) f.push({ key: 'musica', label: 'O que praticou', type: 'text' });
  if (type === 'criatividade' && /desenh|pint|ilustra|arte/.test(t)) f.push({ key: 'tecnica', label: 'Técnica', type: 'text' });
  if (type === 'idiomas') { f.push({ key: 'atividade', label: 'Atividade (aula, conversa, app…)', type: 'text' }); f.push({ key: 'palavras_novas', label: 'Palavras novas', type: 'number' }); }
  if (type === 'meditacao') f.push({ key: 'humor', label: 'Como se sentiu (1–5)', type: 'number' });
  if (type === 'projetos') f.push({ key: 'entrega', label: 'O que avançou', type: 'text' });
  if (type === 'social') f.push({ key: 'com_quem', label: 'Com quem', type: 'text' });
  return f;
}

// ---------- Análise ----------
const SIGNALS = [
  ['criatividade', 2, /(escrev|redac|poesia|poema|conto|roteiro|desenh|pint|music|tocar|violao|guitarra|piano|compor|criativ|fotograf|arte|ilustra|artesanato|livro de)/, 'envolve criação e expressão própria'],
  ['intelectual', 1.5, /(estud|aprend|ler\b|leitura|livro|matemat|fisica|quimic|program|curso|idioma|ingles|espanhol|ciencia|historia|filosof|teoria|prova|concurso)/, 'exige aprendizado e esforço cognitivo'],
  ['social', 1.5, /(conversa|convers|amigos?|familia|falar|apresent|networking|grupo|equipe|voluntar|comunidade|pessoas|ingles|espanhol|idioma)/, 'envolve comunicação e convivência'],
  ['fisico', 1.5, /(treino|corr|caminh|trilha|forca|muscul|flex|esporte|levantar|carga|kg\b|calistenia|nadar|pedal|luta)/, 'trabalha força, resistência ou condicionamento'],
  ['saude', 1.5, /(saude|sono|dormir|aliment|agua|hidrat|medit|estresse|ansiedade|bem-estar|caminh|alonga|postura|respira)/, 'contribui diretamente para a saúde e o bem-estar'],
  ['disciplina', 0.6, /(todo dia|todos os dias|diariamente|rotina|acordar cedo|sem falta|constancia|habito|disciplina|foco|consistent|organiz|planej)/, 'depende de constância e autocontrole'],
];
const TYPE_REASON = {
  saude: 'efeito direto sobre saúde e bem-estar', fisico: 'exige esforço físico', intelectual: 'desenvolve conhecimento',
  disciplina: 'requer regularidade', social: 'tem componente social', criatividade: 'envolve criação',
};

/** Normaliza, descarta contribuições muito pequenas e arredonda (soma = 1). */
function finalizeWeights(raw) {
  let w = Object.fromEntries(ATTRS.map((a) => [a, Math.max(0, Number(raw[a]) || 0)]));
  let sum = Object.values(w).reduce((x, y) => x + y, 0);
  if (!sum) return null;
  w = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum]).filter(([, v]) => v >= 0.08));
  sum = Object.values(w).reduce((x, y) => x + y, 0);
  const out = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round((v / sum) * 100) / 100]));
  const diff = Math.round((1 - Object.values(out).reduce((x, y) => x + y, 0)) * 100) / 100;
  const top = Object.entries(out).sort((a, b) => b[1] - a[1])[0][0];
  out[top] = Math.round((out[top] + diff) * 100) / 100;
  return out;
}

/** Combina a referência da categoria (âncora anti-manipulação) com a leitura da meta (local ou IA). */
function blendWeights(type, reading, readShare = 0.65) {
  const prior = G.weightsOf(type);
  const r = finalizeWeights(reading) || prior;
  const mix = {};
  for (const a of ATTRS) mix[a] = (1 - readShare) * (prior[a] || 0) + readShare * (r[a] || 0);
  // Âncora: o atributo principal da categoria mantém pelo menos 30% (evita que o texto "desvie" todo o XP).
  const primary = Object.entries(prior).sort((x, y) => y[1] - x[1])[0][0];
  const total = Object.values(mix).reduce((x, y) => x + y, 0);
  if (mix[primary] / total < 0.3) {
    const others = total - mix[primary];
    const need = 0.3 * total;
    for (const a of ATTRS) if (a !== primary) mix[a] *= (total - need) / others;
    mix[primary] = need;
  }
  return finalizeWeights(mix);
}

const COMPLEXITY = { forca: 7, cardio: 5, leitura: 4, estudo: 6, refeicao: 5, hidratacao: 2, sono: 4, corpo: 5, sessao: 5 };
const score = (n) => Math.max(1, Math.min(10, Math.round(n)));

function analyzeLocal(draft, text, { assumed = [], vague = false } = {}) {
  const T = G.GOAL_TYPES[draft.type];
  const t = norm(`${text || ''} ${draft.name || ''} ${draft.description || ''} ${draft.objective || ''} ${draft.params?.subject || ''}`);
  // leitura da meta: intensidades da categoria + sinais do texto + frequência
  const reading = Object.fromEntries(ATTRS.map((a) => [a, T.weights[a] || 0]));
  const reasons = {};
  for (const a of ATTRS) if (T.weights[a]) reasons[a] = [TYPE_REASON[a]];
  for (const [a, pts, re, why] of SIGNALS) if (re.test(t)) { reading[a] += pts; (reasons[a] ||= []).push(why); }
  if (draft.period === 'daily' && (draft.days?.length || 7) >= 5 && !(reasons.disciplina || []).includes('depende de constância e autocontrole')) { reading.disciplina += 0.3; (reasons.disciplina ||= []).push('frequência diária'); }
  if (draft.period === 'times_per_week' && draft.target >= 5) { reading.disciplina += 0.4; (reasons.disciplina ||= []).push('alta frequência semanal'); }
  const weights = blendWeights(draft.type, reading, 0.5);

  // dificuldade relativa à referência semanal da categoria
  const ref = T.units?.[draft.unit];
  let weekly = draft.target;
  if (draft.period === 'daily') weekly = draft.target * (draft.days?.length || 7);
  if (draft.period === 'monthly') weekly = (draft.target * 7) / 30;
  const ratio = ref ? weekly / ref : 1;
  const diff = T.milestone ? 6 : score(2 + Math.min(7, ratio * 4));
  const complexity = score((COMPLEXITY[T.kind] || 5) + (draft.custom_fields?.length ? 1 : 0) + (draft.params?.subject ? 0.5 : 0));
  const clarity = score(assumed.includes('target') ? (vague ? 3 : 5) : assumed.length ? 7 : 9);
  const freqScore = score(draft.period === 'daily' ? 9 : draft.period === 'times_per_week' ? 8 : draft.period === 'weekly' ? 7 : draft.period === 'monthly' ? 6 : 6);
  const viability = score(ratio > 2 ? 3 : ratio > 1.4 ? 5 : ratio < 0.25 ? 9 : 8);
  const U = G.UNITS[draft.unit];
  const unitLabel = draft.params?.unit_label || U.label;
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString('pt-BR');
  const per = { daily: 'por dia', times_per_week: 'por semana', weekly: 'por semana', monthly: 'por mês', total: 'até o prazo' }[draft.period];
  const measurable = draft.period === 'times_per_week' ? `${T.name}: ${draft.target}× por semana, registrando cada sessão.` : `${T.name}: ${fmt(draft.target)} ${unitLabel} ${per}.`;
  const improvements = [];
  if (assumed.includes('target')) improvements.push(`Defina uma quantidade concreta — sugerimos ${measurable.toLowerCase()} Ajuste se não fizer sentido para você.`);
  if (assumed.includes('period')) improvements.push('Indique a frequência (por dia, vezes por semana…) para o sistema calcular os objetivos semanais.');
  if (ratio > 1.6) improvements.push('O volume está bem acima da referência para essa atividade: considere começar menor e aumentar aos poucos.');
  if (ratio < 0.3 && !T.milestone) improvements.push('O alvo está baixo: é ótimo para criar o hábito; aumente gradualmente depois.');
  if (!draft.criteria?.length && ['sessao'].includes(T.kind)) improvements.push('Descreva o que conta como “cumprido” (ex.: tempo mínimo ou entrega) para evitar ambiguidade.');
  const attributes = Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([a, w]) => ({
    attribute: a, name: NAMES[a], weight: w, reason: cap([...new Set(reasons[a] || ['contribuição secundária da atividade'])].slice(0, 2).join('; ')) + '.',
  }));
  return {
    summary: `${T.name} — ${draft.period === 'times_per_week' ? `${draft.target}× por semana` : `${fmt(draft.target)} ${unitLabel} ${per}`}. Principal atributo: ${attributes[0].name} (${Math.round(attributes[0].weight * 100)}%).`,
    clarity: { score: clarity, comment: assumed.includes('target') ? 'A meta não tinha quantidade definida; usamos um valor sugerido.' : 'Meta com quantidade e frequência definidas.' },
    difficulty: { score: diff, comment: T.milestone ? 'Meta de marco: exige progressão ao longo de semanas.' : `Volume semanal ≈ ${Math.round(ratio * 100)}% da referência da atividade.` },
    complexity: { score: complexity, comment: complexity >= 7 ? 'Atividade com várias variáveis a registrar.' : 'Registro simples.' },
    frequency: { score: freqScore, comment: per ? `Frequência: ${per}.` : '' },
    viability: { score: viability, comment: viability <= 4 ? 'Pode ser difícil de sustentar.' : 'Viável para a maioria das rotinas.' },
    consistency: { score: score(freqScore - (ratio > 1.4 ? 2 : 0)), comment: 'Constância favorecida por metas frequentes e realistas.' },
    relevance: { score: 8, comment: 'Meta escolhida por você — relevante para o seu desenvolvimento.' },
    improvements, measurable_version: measurable, attributes, weights,
    xp_factor: Math.round(Math.max(0.9, Math.min(1.1, 1 + (complexity - 5) * 0.02)) * 100) / 100,
  };
}

/** Valida e combina a resposta da IA com a âncora da categoria. Nada da IA é aplicado sem passar por aqui. */
function sanitizeAiAnalysis(ai, draft, local) {
  const sc = (o, fb) => ({ score: score(Number(o?.score) || fb.score), comment: typeof o?.comment === 'string' ? o.comment.slice(0, 300) : fb.comment });
  const reading = {};
  const reasons = {};
  for (const a of Array.isArray(ai?.attributes) ? ai.attributes : []) {
    if (!ATTRS.includes(a.attribute)) continue;
    const w = Math.max(0, Math.min(100, Number(a.weight) || 0));
    reading[a.attribute] = (reading[a.attribute] || 0) + w;
    if (typeof a.reason === 'string') reasons[a.attribute] = a.reason.slice(0, 240);
  }
  const weights = Object.keys(reading).length ? blendWeights(draft.type, reading, 0.65) : local.weights;
  const attributes = Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([a, w]) => ({
    attribute: a, name: NAMES[a], weight: w, reason: reasons[a] || local.attributes.find((x) => x.attribute === a)?.reason || 'Contribuição secundária.',
  }));
  const complexity = sc(ai?.complexity, local.complexity);
  return {
    summary: typeof ai?.summary === 'string' ? ai.summary.slice(0, 500) : local.summary,
    clarity: sc(ai?.clarity, local.clarity), difficulty: sc(ai?.difficulty, local.difficulty), complexity,
    frequency: sc(ai?.frequency, local.frequency), viability: sc(ai?.viability, local.viability),
    consistency: sc(ai?.consistency, local.consistency), relevance: sc(ai?.relevance, local.relevance),
    improvements: (Array.isArray(ai?.improvements) ? ai.improvements : local.improvements).filter((x) => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 300)),
    measurable_version: typeof ai?.measurable_version === 'string' && ai.measurable_version ? ai.measurable_version.slice(0, 200) : local.measurable_version,
    attributes, weights,
    xp_factor: Math.round(Math.max(0.9, Math.min(1.1, 1 + (complexity.score - 5) * 0.02)) * 100) / 100,
  };
}

/** Chave de cache: metas equivalentes compartilham a mesma análise (coerência). */
function analysisKey(draft, text) {
  const crypto = require('crypto');
  const base = JSON.stringify([norm(stripIntent(text || draft.name || '')), draft.type, draft.period, draft.unit, Number(draft.target), draft.mode, (draft.days || []).length, draft.params || {}]);
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 40);
}

module.exports = { interpretLocal, analyzeLocal, sanitizeAiAnalysis, blendWeights, finalizeWeights, analysisKey, norm, DEFAULTS };
