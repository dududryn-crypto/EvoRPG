'use strict';
/**
 * Categorias de meta. NENHUMA é obrigatória: o usuário cria apenas as metas que quiser.
 * O usuário escolhe a categoria, a quantidade, a unidade, a frequência, os dias e o prazo.
 * Os atributos afetados, o XP e as penalidades vêm daqui — definidos pelo sistema.
 *
 * Intensidade dos atributos: 1 = "+", 2 = "++", 3 = "+++".
 * budget = XP semanal de referência por cumprir 100% da meta (antes da ofensiva e do fator de dificuldade).
 * units: unidade -> referência semanal usada no fator de dificuldade (null = sem ajuste).
 */

const UNITS = {
  sessoes: { label: 'sessões', dayMax: 5, min: 1, int: true },
  minutos: { label: 'min', dayMax: 900, min: 1 },
  horas: { label: 'h', dayMax: 15, min: 0.25 },
  km: { label: 'km', dayMax: 200, min: 0.1 },
  passos: { label: 'passos', dayMax: 60000, min: 500, int: true },
  paginas: { label: 'páginas', dayMax: 500, min: 1, int: true },
  exercicios: { label: 'exercícios', dayMax: 500, min: 1, int: true },
  tarefas: { label: 'tarefas', dayMax: 50, min: 1, int: true },
  quantidade: { label: 'unidades', dayMax: 10000, min: 1 },
  L: { label: 'L', dayMax: 8, min: 0.25 },
  ml: { label: 'ml', dayMax: 8000, min: 250, int: true },
  kcal: { label: 'kcal', dayMax: 8000, min: 500, int: true },
  proteina: { label: 'g de proteína', dayMax: 600, min: 5, int: true },
  carbo: { label: 'g de carboidrato', dayMax: 1200, min: 5, int: true },
  gordura: { label: 'g de gordura', dayMax: 400, min: 5, int: true },
  horas_sono: { label: 'h de sono', dayMax: 14, min: 3 },
  kg: { label: 'kg', dayMax: 2000, min: 1 },
  refeicoes: { label: 'refeições', dayMax: 10, min: 1, int: true },
};

const PERIODS = {
  daily: 'por dia',
  times_per_week: 'vezes por semana',
  weekly: 'por semana',
  monthly: 'por mês',
  total: 'até o prazo',
};

const ALL = ['daily', 'times_per_week', 'weekly', 'monthly', 'total'];
const EX = ['times_per_week', 'daily', 'weekly', 'monthly', 'total'];

const T = (o) => o;
const GOAL_TYPES = {
  // ---------- Exercícios ----------
  musculacao: T({ group: 'exercicio', name: 'Musculação', weights: { saude: 1, fisico: 3, disciplina: 1 }, budget: 120, kind: 'forca', params: { modality: 'musculacao' }, units: { sessoes: 3, minutos: 180, volume: null }, periods: EX, accumulate: true }),
  calistenia: T({ group: 'exercicio', name: 'Calistenia', weights: { saude: 1, fisico: 3, disciplina: 1 }, budget: 110, kind: 'forca', params: { modality: 'calistenia' }, units: { sessoes: 3, minutos: 120 }, periods: EX, accumulate: true }),
  caminhada: T({ group: 'exercicio', name: 'Caminhada', weights: { saude: 3, fisico: 1, disciplina: 1 }, budget: 80, kind: 'cardio', params: { modality: 'caminhada' }, units: { sessoes: 4, minutos: 150, km: 15, passos: 50000 }, periods: EX, accumulate: true }),
  corrida: T({ group: 'exercicio', name: 'Corrida', weights: { saude: 2, fisico: 2, disciplina: 1 }, budget: 110, kind: 'cardio', params: { modality: 'corrida' }, units: { sessoes: 3, minutos: 120, km: 15 }, periods: EX, accumulate: true }),
  ciclismo: T({ group: 'exercicio', name: 'Ciclismo', weights: { saude: 2, fisico: 2, disciplina: 1 }, budget: 100, kind: 'cardio', params: { modality: 'ciclismo' }, units: { sessoes: 3, minutos: 150, km: 40 }, periods: EX, accumulate: true }),
  natacao: T({ group: 'exercicio', name: 'Natação', weights: { saude: 2, fisico: 2, disciplina: 1 }, budget: 110, kind: 'cardio', params: { modality: 'natacao' }, units: { sessoes: 3, minutos: 120, km: 3 }, periods: EX, accumulate: true }),
  esporte: T({ group: 'exercicio', name: 'Treino esportivo', weights: { saude: 2, fisico: 2, disciplina: 1 }, budget: 100, kind: 'cardio', params: { modality: 'esporte' }, units: { sessoes: 2, minutos: 120 }, periods: EX, accumulate: true }),
  outro_exercicio: T({ group: 'exercicio', name: 'Outro exercício', weights: { saude: 2, fisico: 2, disciplina: 1 }, budget: 80, kind: 'cardio', params: { modality: 'outro_exercicio' }, units: { sessoes: 3, minutos: 120 }, periods: EX, accumulate: true }),
  carga: T({ group: 'exercicio', name: 'Meta de carga', weights: { fisico: 3, disciplina: 1 }, budget: 150, kind: 'forca', units: { kg: null }, periods: ['total'], milestone: 'max_load', needs: ['exercise'] }),
  // ---------- Saúde ----------
  agua: T({ group: 'saude', name: 'Hidratação', weights: { saude: 3, disciplina: 1 }, budget: 50, kind: 'hidratacao', units: { L: null, ml: null }, periods: ['daily'], modes: ['min'], accumulate: false }),
  calorias: T({ group: 'saude', name: 'Calorias', weights: { saude: 2, fisico: 1, disciplina: 1 }, budget: 40, kind: 'refeicao', units: { kcal: null }, periods: ['daily'], modes: ['max', 'range', 'min'], accumulate: false }),
  proteinas: T({ group: 'saude', name: 'Proteínas', weights: { fisico: 2, saude: 1 }, budget: 40, kind: 'refeicao', units: { proteina: null }, periods: ['daily'], modes: ['min', 'range', 'max'], accumulate: false }),
  carboidratos: T({ group: 'saude', name: 'Carboidratos', weights: { saude: 1, fisico: 1 }, budget: 25, kind: 'refeicao', units: { carbo: null }, periods: ['daily'], modes: ['range', 'max', 'min'], accumulate: false }),
  gorduras: T({ group: 'saude', name: 'Gorduras', weights: { saude: 1, fisico: 1 }, budget: 25, kind: 'refeicao', units: { gordura: null }, periods: ['daily'], modes: ['range', 'max', 'min'], accumulate: false }),
  alimentacao: T({ group: 'saude', name: 'Alimentação', weights: { saude: 3, fisico: 1, disciplina: 1 }, budget: 50, kind: 'refeicao', units: { refeicoes: null }, periods: ['daily'], modes: ['min'], accumulate: false }),
  sono: T({ group: 'saude', name: 'Sono', weights: { saude: 3, disciplina: 1, intelectual: 1 }, budget: 70, kind: 'sono', units: { horas_sono: null }, periods: ['daily'], modes: ['min', 'range'], accumulate: false }),
  meditacao: T({ group: 'saude', name: 'Meditação', weights: { saude: 2, disciplina: 2 }, budget: 60, kind: 'sessao', units: { minutos: 70, sessoes: 7 }, periods: ['daily', 'times_per_week', 'weekly'], accumulate: false }),
  peso: T({ group: 'saude', name: 'Peso corporal', weights: { saude: 2, fisico: 1, disciplina: 1 }, budget: 150, kind: 'corpo', units: { kg: null }, periods: ['total'], modes: ['max', 'min'], milestone: 'body_weight' }),
  habito_saude: T({ group: 'saude', name: 'Hábito saudável', weights: { saude: 2, disciplina: 1 }, budget: 50, kind: 'sessao', units: { sessoes: 7, minutos: 140, quantidade: null }, periods: ['daily', 'times_per_week', 'weekly'], accumulate: true }),
  // ---------- Mente ----------
  leitura: T({ group: 'mente', name: 'Leitura', weights: { intelectual: 3, disciplina: 1 }, budget: 90, kind: 'leitura', units: { paginas: 140, minutos: 140, sessoes: 5 }, periods: ALL, accumulate: true }),
  estudo: T({ group: 'mente', name: 'Estudo', weights: { intelectual: 3, disciplina: 2 }, budget: 110, kind: 'estudo', units: { minutos: 300, horas: 5, sessoes: 5, exercicios: 100 }, periods: ALL, accumulate: true, optional: ['subject'] }),
  idiomas: T({ group: 'mente', name: 'Idiomas', weights: { intelectual: 2, social: 1, disciplina: 1 }, budget: 90, kind: 'sessao', units: { minutos: 150, horas: 3, sessoes: 5, quantidade: 7 }, periods: ALL, accumulate: true }),
  habito_mente: T({ group: 'mente', name: 'Hábito intelectual', weights: { intelectual: 2, disciplina: 1 }, budget: 50, kind: 'sessao', units: { sessoes: 5, minutos: 150, quantidade: null }, periods: ['daily', 'times_per_week', 'weekly', 'monthly'], accumulate: true }),
  // ---------- Social e criatividade ----------
  social: T({ group: 'social', name: 'Atividades sociais', weights: { social: 3, saude: 1 }, budget: 70, kind: 'sessao', units: { sessoes: 3, minutos: 180, quantidade: 3 }, periods: ['times_per_week', 'weekly', 'daily', 'monthly'], accumulate: true }),
  criatividade: T({ group: 'social', name: 'Desenvolvimento criativo', weights: { criatividade: 3, disciplina: 1 }, budget: 90, kind: 'sessao', units: { minutos: 180, horas: 3, sessoes: 3, quantidade: 2 }, periods: ALL, accumulate: true }),
  projetos: T({ group: 'social', name: 'Projeto pessoal', weights: { criatividade: 2, intelectual: 1, disciplina: 1 }, budget: 90, kind: 'sessao', units: { minutos: 300, horas: 5, sessoes: 4, tarefas: 10 }, periods: ALL, accumulate: true }),
  // ---------- Produtividade ----------
  produtividade: T({ group: 'produtividade', name: 'Tarefas e produtividade', weights: { disciplina: 2, intelectual: 1 }, budget: 80, kind: 'sessao', units: { tarefas: 15, minutos: 600, sessoes: 5 }, periods: ALL, accumulate: true }),
  habito_geral: T({ group: 'produtividade', name: 'Hábito pessoal', weights: { disciplina: 2, criatividade: 1 }, budget: 50, kind: 'sessao', units: { sessoes: 7, minutos: 140, quantidade: null }, periods: ['daily', 'times_per_week', 'weekly'], accumulate: true }),
};
// "volume" não é unidade de meta exposta (apenas estatística).
delete GOAL_TYPES.musculacao.units.volume;

const GROUPS = {
  exercicio: { name: 'Exercícios', icon: 'dumbbell' },
  saude: { name: 'Saúde e bem-estar', icon: 'heart' },
  mente: { name: 'Mente e aprendizado', icon: 'brain' },
  social: { name: 'Social e criatividade', icon: 'palette' },
  produtividade: { name: 'Produtividade e hábitos', icon: 'target' },
};

const MODES = { min: 'atingir pelo menos', max: 'não ultrapassar', range: 'ficar na faixa (±10%)' };

function weightsOf(type) {
  const w = GOAL_TYPES[type].weights;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, x]) => [k, x / sum]));
}

/** Modelos opcionais — apenas sugestões para agilizar o cadastro. */
const TEMPLATES = [
  { type: 'leitura', name: 'Ler 30 páginas por dia', period: 'daily', target: 30, unit: 'paginas' },
  { type: 'musculacao', name: 'Musculação 4× por semana', period: 'times_per_week', target: 4, unit: 'sessoes', days: [1, 2, 4, 5] },
  { type: 'caminhada', name: 'Caminhar 5 km por dia', period: 'daily', target: 5, unit: 'km' },
  { type: 'agua', name: 'Beber 3 L de água', period: 'daily', target: 3, unit: 'L' },
  { type: 'estudo', name: 'Estudar 2 horas por dia', period: 'daily', target: 2, unit: 'horas' },
  { type: 'sono', name: 'Dormir 8 horas', period: 'daily', target: 8, unit: 'horas_sono' },
  { type: 'projetos', name: 'Avançar no projeto pessoal', period: 'times_per_week', target: 3, unit: 'sessoes' },
  { type: 'idiomas', name: 'Praticar inglês', period: 'daily', target: 20, unit: 'minutos' },
  { type: 'carga', name: 'Supino 80 kg', period: 'total', target: 80, unit: 'kg', params: { exercise: 'Supino reto' }, deadlineDays: 90 },
  { type: 'calorias', name: 'Até 2.200 kcal por dia', period: 'daily', target: 2200, unit: 'kcal', mode: 'max' },
];

module.exports = { UNITS, PERIODS, GOAL_TYPES, GROUPS, MODES, TEMPLATES, weightsOf };
