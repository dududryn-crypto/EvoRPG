'use strict';
/**
 * Integração com a OpenAI. A chave fica apenas no servidor (variável de ambiente).
 * A IA só sugere: quem valida e aplica XP/atributos é o backend, e o usuário aprova.
 */
const { HttpError } = require('./util');

const API_URL = 'https://api.openai.com/v1/chat/completions';

function enabled() { return !!process.env.OPENAI_API_KEY; }
function model() { return process.env.OPENAI_MODEL || 'gpt-4o-mini'; }

/** Chamada de texto livre (chat). messages: [{role, content}] */
async function callChat(system, messages) {
  if (!enabled()) throw new HttpError(503, 'A IA está indisponível: defina OPENAI_API_KEY no arquivo .env do servidor.');
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: model(), temperature: 0.2, messages: [{ role: 'system', content: system }, ...messages] }),
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new HttpError(502, 'Não foi possível contatar a OpenAI. Verifique a conexão do servidor e tente novamente.');
  }
  if (!res.ok) {
    const msg = res.status === 401 ? 'Chave da OpenAI inválida (OPENAI_API_KEY).' : res.status === 429 ? 'Limite de uso da OpenAI atingido. Tente novamente em instantes.' : `A OpenAI respondeu com erro ${res.status}.`;
    throw new HttpError(502, msg);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'A OpenAI retornou uma resposta vazia.');
  return content.slice(0, 8000);
}

async function callStructured(system, user, schemaName, schema) {
  if (!enabled()) throw new HttpError(503, 'A avaliação por IA está indisponível: defina OPENAI_API_KEY no arquivo .env do servidor.');
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: model(),
        temperature: 0,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new HttpError(502, 'Não foi possível contatar a OpenAI. Verifique a conexão do servidor e tente novamente.');
  }
  if (!res.ok) {
    let msg = `A OpenAI respondeu com erro ${res.status}.`;
    if (res.status === 401) msg = 'Chave da OpenAI inválida (OPENAI_API_KEY).';
    if (res.status === 429) msg = 'Limite de uso da OpenAI atingido. Tente novamente em instantes.';
    throw new HttpError(502, msg);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new HttpError(502, 'A OpenAI retornou uma resposta vazia.');
  try { return JSON.parse(content); } catch { throw new HttpError(502, 'A resposta da OpenAI não pôde ser interpretada.'); }
}

const nullable = (type) => ({ type: [type, 'null'] });

const GOAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'is_realistic', 'difficulty', 'summary', 'clarity', 'measurability', 'realism', 'frequency', 'issues', 'suggestions', 'suggested_target', 'suggested_target_rationale'],
  properties: {
    score: { type: 'number', description: 'Nota de 0 a 10 para a qualidade da meta' },
    is_realistic: { type: 'boolean' },
    difficulty: { type: 'integer', description: '1 (muito fácil) a 10 (muito difícil)' },
    summary: { type: 'string' },
    clarity: { type: 'string' },
    measurability: { type: 'string' },
    realism: { type: 'string' },
    frequency: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    suggested_target: nullable('number'),
    suggested_target_rationale: { type: 'string' },
  },
};

/**
 * A IA apenas avalia a meta e sugere ajustes de quantidade/frequência.
 * Ela não define atributos, XP nem penalidades: essas regras são fixas do sistema.
 */
async function evaluateGoal(input) {
  const system = [
    'Você é o avaliador de metas do EvoRPG, um aplicativo de evolução pessoal gamificado. Responda em português do Brasil.',
    'Avalie clareza, mensurabilidade, realismo e frequência da meta quantitativa informada.',
    'XP, atributos e penalidades seguem regras fixas do aplicativo (informadas em regras_do_sistema). Você pode comentar se a categoria escolhida é coerente, mas não pode alterar essas regras.',
    'Avalie também se a meta precisa de critérios de conclusão mais objetivos.',
    'Se a quantidade parecer irrealista (alta ou baixa demais) para a frequência, sugira um alvo na MESMA unidade e período; caso contrário, suggested_target = null.',
    'Para metas de saúde (água, sono, alimentação), considere faixas geralmente recomendadas para adultos, sem dar orientação médica individual.',
    'Não invente informações sobre o usuário: avalie apenas os dados fornecidos.',
  ].join('\n');
  const out = await callStructured(system, JSON.stringify(input), 'goal_evaluation', GOAL_SCHEMA);
  return sanitizeEvaluation(out);
}

/** Valida e limita tudo que veio da IA antes de mostrar ao usuário. */
function sanitizeEvaluation(o) {
  const str = (s, n = 600) => (typeof s === 'string' ? s.slice(0, n) : '');
  const arr = (a, n = 8) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, n).map((x) => x.slice(0, 300)) : []);
  const st = Number(o.suggested_target);
  return {
    score: Math.max(0, Math.min(10, Math.round(Number(o.score) * 10) / 10 || 0)),
    is_realistic: !!o.is_realistic,
    difficulty: Math.max(1, Math.min(10, Math.round(Number(o.difficulty)) || 5)),
    summary: str(o.summary), clarity: str(o.clarity), measurability: str(o.measurability), realism: str(o.realism), frequency: str(o.frequency),
    issues: arr(o.issues), suggestions: arr(o.suggestions),
    suggested_target: Number.isFinite(st) && st > 0 ? st : null,
    suggested_target_rationale: str(o.suggested_target_rationale),
  };
}

const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['analysis', 'recommendations', 'suggested_goal'],
  properties: {
    analysis: { type: 'string' },
    recommendations: { type: 'array', items: { type: 'string' } },
    suggested_goal: {
      type: 'object', additionalProperties: false, required: ['title', 'target_value', 'unit', 'rationale'],
      properties: { title: { type: 'string' }, target_value: { type: 'number' }, unit: { type: 'string' }, rationale: { type: 'string' } },
    },
  },
};

async function bossReport(report, outcome) {
  const system = [
    'Você analisa o relatório semanal do Evolve RPG (Boss 1, Boss 2 e Boss Final). Responda em português do Brasil.',
    'O Boss Final é vencido com média aritmética simples ≥ 95% das metas válidas (cada uma limitada a 100%).',
    'Use SOMENTE os dados fornecidos. Não invente causas, sentimentos, eventos ou comportamentos que não estejam registrados.',
    'Se os dados não explicarem o motivo, diga explicitamente que não há registros suficientes para identificar a causa.',
    'Dê recomendações práticas e sugira uma meta mais realista para a próxima semana, baseada nos números registrados.',
  ].join('\n');
  const out = await callStructured(system, JSON.stringify({ resultado: outcome, dados: report }), 'boss_report', REPORT_SCHEMA);
  return {
    analysis: String(out.analysis || '').slice(0, 2000),
    recommendations: (out.recommendations || []).slice(0, 6).map((s) => String(s).slice(0, 400)),
    suggested_goal: {
      title: String(out.suggested_goal?.title || '').slice(0, 120),
      target_value: Number(out.suggested_goal?.target_value) || null,
      unit: String(out.suggested_goal?.unit || '').slice(0, 30),
      rationale: String(out.suggested_goal?.rationale || '').slice(0, 600),
    },
  };
}

const ANALYST_RULES = [
  'Você é o analista de dados do EvoRPG, um aplicativo de evolução pessoal. Responda em português do Brasil, de forma clara e objetiva.',
  'Você recebe em JSON os dados REAIS de UMA meta do usuário: definição, registros, séries diárias/semanais e estatísticas já calculadas pelo servidor.',
  'Regras obrigatórias:',
  '- Use somente esses dados. Nunca invente registros, cargas, médias, datas ou progresso.',
  '- Diferencie explicitamente: [registrado] = valor que está nos registros; [calculado] = derivado dos registros (soma, média, variação); [estimativa] = projeção; [recomendação] = sugestão sua.',
  '- Prefira os números já calculados pelo servidor. Se fizer contas próprias, mostre como chegou ao resultado.',
  '- Não afirme causas que os dados não demonstram (ex.: cansaço, alimentação) a menos que estejam em observações registradas.',
  '- Se não houver dados suficientes para responder, diga claramente qual informação falta.',
  '- Não fale de outras metas nem dê orientação médica individual.',
].join('\n');

/** Chat de análise de uma meta (aba Detalhes). */
async function goalChat(dataPackage, history, question) {
  const system = `${ANALYST_RULES}\n\nDADOS DA META (JSON):\n${JSON.stringify(dataPackage)}`;
  const msgs = history.slice(-12).map((m) => ({ role: m.role, content: m.content }));
  msgs.push({ role: 'user', content: question });
  return callChat(system, msgs);
}

const GOAL_REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['resumo', 'estatisticas', 'comparacao', 'pontos_positivos', 'pontos_atencao', 'tendencias', 'recomendacoes', 'limitacoes'],
  properties: {
    resumo: { type: 'string' },
    estatisticas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rotulo', 'valor', 'origem'], properties: { rotulo: { type: 'string' }, valor: { type: 'string' }, origem: { type: 'string', enum: ['registrado', 'calculado', 'estimativa'] } } } },
    comparacao: { type: 'string' },
    pontos_positivos: { type: 'array', items: { type: 'string' } },
    pontos_atencao: { type: 'array', items: { type: 'string' } },
    tendencias: { type: 'array', items: { type: 'string' } },
    recomendacoes: { type: 'array', items: { type: 'string' } },
    limitacoes: { type: 'array', items: { type: 'string' } },
  },
};
async function goalReport(dataPackage) {
  const out = await callStructured(`${ANALYST_RULES}\nProduza um relatório estruturado da meta.`, JSON.stringify(dataPackage), 'goal_report', GOAL_REPORT_SCHEMA);
  const arr = (a, n = 8) => (Array.isArray(a) ? a.slice(0, n).map((x) => String(x).slice(0, 400)) : []);
  return {
    resumo: String(out.resumo || '').slice(0, 1500), comparacao: String(out.comparacao || '').slice(0, 800),
    estatisticas: (out.estatisticas || []).slice(0, 12).map((e) => ({ rotulo: String(e.rotulo).slice(0, 80), valor: String(e.valor).slice(0, 80), origem: ['registrado', 'calculado', 'estimativa'].includes(e.origem) ? e.origem : 'calculado' })),
    pontos_positivos: arr(out.pontos_positivos), pontos_atencao: arr(out.pontos_atencao), tendencias: arr(out.tendencias), recomendacoes: arr(out.recomendacoes), limitacoes: arr(out.limitacoes),
  };
}

const SCORE = { type: 'object', additionalProperties: false, required: ['score', 'comment'], properties: { score: { type: 'integer', description: '1 a 10' }, comment: { type: 'string' } } };
function interpretSchema(types, units) {
  return {
    type: 'object', additionalProperties: false, required: ['draft', 'analysis'],
    properties: {
      draft: {
        type: 'object', additionalProperties: false,
        required: ['type', 'name', 'period', 'target', 'unit', 'mode', 'days', 'subject', 'exercise', 'unit_label', 'deadline_days', 'custom_fields'],
        properties: {
          type: { type: 'string', enum: types }, name: { type: 'string' },
          period: { type: 'string', enum: ['daily', 'times_per_week', 'weekly', 'monthly', 'total'] },
          target: { type: ['number', 'null'] }, unit: { type: 'string', enum: units }, mode: { type: 'string', enum: ['min', 'max', 'range'] },
          days: { type: 'array', items: { type: 'integer' } }, subject: { type: ['string', 'null'] }, exercise: { type: ['string', 'null'] },
          unit_label: { type: ['string', 'null'] }, deadline_days: { type: ['integer', 'null'] },
          custom_fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'type', 'unit'], properties: { label: { type: 'string' }, type: { type: 'string', enum: ['number', 'text'] }, unit: { type: ['string', 'null'] } } } },
        },
      },
      analysis: {
        type: 'object', additionalProperties: false,
        required: ['summary', 'clarity', 'difficulty', 'complexity', 'frequency', 'viability', 'consistency', 'relevance', 'improvements', 'measurable_version', 'attributes'],
        properties: {
          summary: { type: 'string' }, clarity: SCORE, difficulty: SCORE, complexity: SCORE, frequency: SCORE, viability: SCORE, consistency: SCORE, relevance: SCORE,
          improvements: { type: 'array', items: { type: 'string' } }, measurable_version: { type: 'string' },
          attributes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['attribute', 'weight', 'reason'], properties: {
            attribute: { type: 'string', enum: ['saude', 'fisico', 'intelectual', 'disciplina', 'social', 'criatividade'] }, weight: { type: 'integer', description: '0 a 100; a soma deve ser 100' }, reason: { type: 'string' } } } },
        },
      },
    },
  };
}

/**
 * Interpreta a meta escrita pelo usuário e a analisa individualmente.
 * A resposta é apenas uma proposta: o servidor valida o rascunho (limites, unidades, categoria) e combina
 * a distribuição de atributos com a referência da categoria antes de aplicar qualquer coisa.
 */
async function interpretGoal({ text, catalog, today, draft }) {
  const system = [
    'Você é o analista de metas do EvoRPG, um aplicativo de evolução pessoal gamificado. Responda em português do Brasil.',
    'Tarefa 1 (draft): transforme o texto do usuário em uma meta estruturada usando SOMENTE as categorias e unidades do catálogo fornecido.',
    '- Respeite exatamente o que a pessoa escreveu (números, frequência, dias). Não invente detalhes. Se faltar quantidade, proponha um valor inicial realista e diga isso em improvements.',
    '- period: daily (por dia), times_per_week (N vezes por semana; unit = sessoes), weekly, monthly, total (até um prazo; use deadline_days).',
    '- days: dias da semana (0=domingo … 6=sábado) só se a pessoa indicou; senão [].',
    '- unit_label: rótulo para unidades genéricas (ex.: "palavras" quando unit = quantidade); senão null.',
    '- custom_fields: até 4 campos úteis e específicos para registrar o progresso desta meta (ex.: "Palavras escritas"); [] se os registros padrão bastarem.',
    'Tarefa 2 (analysis): avalie a meta individualmente — clareza, dificuldade, complexidade, frequência, viabilidade, consistência e relevância (1 a 10, com comentário específico ao que foi escrito, nunca genérico).',
    '- attributes: quais atributos do personagem a meta desenvolve e em que proporção (pesos inteiros somando 100), com justificativa curta baseada na finalidade e no contexto da meta.',
    '  Atributos: saude, fisico, intelectual, disciplina, social, criatividade. Use de 1 a 4 atributos. Seja coerente: metas equivalentes devem receber distribuições equivalentes.',
    '- measurable_version: uma versão clara e mensurável da meta. improvements: sugestões concretas.',
    'Você não define XP, moedas nem recompensas. Não dê orientação médica individual.',
  ].join('\n');
  const user = JSON.stringify({ hoje: today, texto_do_usuario: text, rascunho_atual: draft || null, catalogo: catalog });
  return callStructured(system, user, 'goal_interpretation', interpretSchema(catalog.map((c) => c.type), [...new Set(catalog.flatMap((c) => c.units))]));
}

module.exports = { enabled, model, interpretGoal, evaluateGoal, bossReport, sanitizeEvaluation, goalChat, goalReport };
