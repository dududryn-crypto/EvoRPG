'use strict';
/**
 * Catálogo de personalização. Itens são predominantemente cosméticos (não alteram XP nem batalhas).
 * Cada item aponta para um "desenhista" (d) do motor de sprites + paleta; novos itens ou
 * conjuntos podem ser adicionados aqui sem mudar o banco. Um item também pode usar uma
 * imagem (sprite: '/sprites/arquivo.png'), suportada pelo renderizador.
 */

/**
 * Raridades (exatamente seis). price = preço de UMA peça na loja; setDiscount = desconto ao comprar a skin completa.
 * Secreta nunca é vendida: só sai em missões extremas ou como recompensa raríssima de chefes.
 */
const RARITIES = [
  { key: 'comum', name: 'Comum', color: '#b8c0cc', price: 30, compensation: 40 },
  { key: 'rara', name: 'Rara', color: '#4f9dff', price: 80, compensation: 100 },
  { key: 'epica', name: 'Épica', color: '#b06cff', price: 180, compensation: 220 },
  { key: 'lendaria', name: 'Lendária', color: '#f5a524', price: 380, compensation: 450 },
  { key: 'mistica', name: 'Mística', color: '#2ee6d6', price: 800, compensation: 900 },
  { key: 'secreta', name: 'Secreta', color: '#ff5fd2', price: null, compensation: 2000 },
];
const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.key, { ...r, tier: i + 1 }]));
/** Raridades das versões anteriores → novas (apenas para dados antigos). */
const LEGACY_RARITY = { incomum: 'rara', raro: 'rara', epico: 'epica', lendario: 'lendaria', mitico: 'mistica' };
const SET_DISCOUNT = 0.8;

const SLOTS = {
  head: 'Cabeça', mask: 'Máscara', chest: 'Peitoral', legs: 'Pernas', boots: 'Botas', gloves: 'Luvas',
  weapon: 'Armas', shield: 'Escudos', cape: 'Capas', accessory: 'Acessórios', effect: 'Efeitos', pet: 'Mascotes', title: 'Títulos',
};

// Aparência base (escolhas livres, sem custo).
const APPEARANCE = {
  bodies: { slim: 'Esguio', athletic: 'Atlético', broad: 'Robusto' },
  skins: ['#f7d7c4', '#efc3a4', '#e0a982', '#c98e66', '#a8714d', '#875737', '#653f26', '#47291a'],
  eyes: { round: 'Redondos', sharp: 'Afiados', calm: 'Serenos', fierce: 'Ferozes' },
  eyeColors: ['#2b1d14', '#5b3a1e', '#2f6b3a', '#2563eb', '#6b7280', '#9333ea', '#b45309'],
  faces: { neutral: 'Neutro', determined: 'Determinado', smile: 'Sorridente', scar: 'Cicatriz', warpaint: 'Pintura de guerra', freckles: 'Sardas' },
  hair: { short: 'Curto', buzz: 'Raspado curto', long: 'Longo', wavy: 'Ondulado', spiky: 'Espetado', ponytail: 'Rabo de cavalo', mohawk: 'Moicano', topknot: 'Coque samurai', braid: 'Trança', curly: 'Cacheado', undercut: 'Undercut', bald: 'Careca' },
  hairColors: ['#16120f', '#3b2416', '#6b4226', '#a0692f', '#d6a35c', '#e8d3a0', '#d4d4d8', '#b91c1c', '#4338ca', '#0f766e'],
  beards: { none: 'Sem barba', stubble: 'Por fazer', short: 'Curta', full: 'Cheia', goatee: 'Cavanhaque', mustache: 'Bigode' },
};

const DEFAULT_CHARACTER = {
  body: 'athletic', skin: '#e0a982', eyes: 'round', eyeColor: '#5b3a1e', face: 'neutral', hair: 'short', hairColor: '#3b2416', beard: 'none',
  head: null, mask: null, chest: 'chest_tunic', legs: 'legs_pants', boots: 'boots_leather', gloves: null, cape: null,
  weapon: 'wpn_training', shield: null, accessory: null, effect: null, pet: null, title: 'title_aprendiz',
};

// Construtor compacto: I(id, slot, nome, raridade, desenho, opções)
const ITEMS = [];
function I(id, slot, name, rarity, d, o = {}) {
  ITEMS.push({ id, slot, name, rarity, d, set: o.set || null, price: o.price !== undefined ? o.price : RARITY[rarity].price, unlock: o.unlock || null, desc: o.desc || null });
}
const free = { price: 0 };

// ---------- Iniciais ----------
I('chest_tunic', 'chest', 'Túnica de aprendiz', 'comum', { t: 'tunic', c: '#5b6274', c2: '#3d4352' }, free);
I('legs_pants', 'legs', 'Calças de viagem', 'comum', { t: 'pants', c: '#3a3226' }, free);
I('boots_leather', 'boots', 'Botas de couro', 'comum', { t: 'boots', c: '#4a3222' }, free);
I('wpn_training', 'weapon', 'Espada de treino', 'comum', { t: 'sword', c: '#b08455', c2: '#6b4a2b', len: 40 }, free);
I('title_aprendiz', 'title', 'Aprendiz', 'comum', { t: 'title' }, free);
// ---------- Avulsos ----------
I('chest_tunic_blue', 'chest', 'Túnica azul', 'comum', { t: 'tunic', c: '#2f5196', c2: '#c9a24a' });
I('chest_tunic_crimson', 'chest', 'Túnica carmesim', 'comum', { t: 'tunic', c: '#8e2b39', c2: '#d6b25c' });
I('cape_red', 'cape', 'Capa vermelha', 'comum', { t: 'cape', c: '#9b1c26', c2: '#5c0f16' });
I('shield_wood', 'shield', 'Escudo de madeira', 'comum', { t: 'round', c: '#8a5a32', c2: '#5d3b20' });
I('acc_scarf', 'accessory', 'Cachecol do viajante', 'comum', { t: 'scarf', c: '#c2410c' });
I('pet_slime', 'pet', 'Slime', 'comum', { t: 'slime', c: '#4ade80' });
I('wpn_axe', 'weapon', 'Machado de batalha', 'rara', { t: 'axe', c: '#aeb6c2', c2: '#5a3a22' });
I('wpn_spear', 'weapon', 'Lança', 'rara', { t: 'spear', c: '#cfd5de', c2: '#6a4528' });
I('acc_amulet', 'accessory', 'Amuleto de jade', 'rara', { t: 'amulet', c: '#34d399' });
I('pet_cat', 'pet', 'Gato aventureiro', 'rara', { t: 'cat', c: '#f59e0b' });
I('cape_royal', 'cape', 'Manto real', 'rara', { t: 'cape', c: '#6d28d9', c2: '#f1cf85', fur: true });
I('wpn_dual', 'weapon', 'Espadas duplas', 'rara', { t: 'dual', c: '#d4dae3', c2: '#3a2a1a', len: 34 });
I('fx_sparks', 'effect', 'Faíscas', 'rara', { t: 'sparks', c: '#7cc8ff' });
I('pet_owl', 'pet', 'Coruja sábia', 'rara', { t: 'owl', c: '#a87b4f' });
I('fx_frost', 'effect', 'Aura gélida', 'epica', { t: 'frost', c: '#a5f3fc' });
I('pet_wolf', 'pet', 'Lobo cinzento', 'epica', { t: 'wolf', c: '#9ca3af' });
I('pet_drone', 'pet', 'Drone companheiro', 'epica', { t: 'drone', c: '#22d3ee' });
I('wpn_flame', 'weapon', 'Lâmina flamejante', 'epica', { t: 'flame', c: '#ff7a2a', len: 44 }, { price: null, unlock: { achievement: 'boss_1' } });
I('fx_gold', 'effect', 'Aura dourada', 'epica', { t: 'gold', c: '#f1cf85' }, { price: null, unlock: { achievement: 'streak_7' } });
I('fx_stars', 'effect', 'Constelação', 'epica', { t: 'stars', c: '#e6f0ff' }, { price: null, unlock: { achievement: 'records_100' } });
I('pet_dragon', 'pet', 'Dragãozinho', 'lendaria', { t: 'dragon', c: '#ef4444' }, { price: null, unlock: { bosses: 10 } });
I('fx_ember', 'effect', 'Brasas do tirano', 'lendaria', { t: 'ember', c: '#ff6a3d' }, { price: null, unlock: { achievement: 'final_1' } });
I('wpn_scythe', 'weapon', 'Foice do vazio', 'lendaria', { t: 'scythe', c: '#a78bfa', c2: '#1f1530' }, { price: null, unlock: { level: 15 } });
I('pet_phoenix', 'pet', 'Fênix', 'mistica', { t: 'phoenix', c: '#ff7a2a' }, { unlock: { achievement: 'desafio_95x3' } });

// ---------- Conjuntos (skins) ----------
const SETS = {};
/**
 * SET(chave, nome, raridade, descrição, peças, origem)
 * origem.shop  — vendida na loja (padrão: true, exceto Secreta)
 * origem.boss  — 'any' (pode cair de qualquer chefe, padrão para skins da loja), um arquétipo
 *                ('golem', 'glutton', 'specter', 'shade', 'siren', 'wisp', 'tyrant') para exclusivas, ou false
 * origem.mission — chave da missão que entrega a skin completa
 */
function SET(key, name, rarity, desc, items, src = {}) {
  const shop = src.shop !== undefined ? src.shop : rarity !== 'secreta' && !src.mission && !(typeof src.boss === 'string' && src.boss !== 'any');
  const boss = src.boss !== undefined ? src.boss : (shop ? 'any' : false);
  SETS[key] = { key, name, rarity, desc, theme: src.theme || null, items: items.map((x) => x[0]), shop, boss, mission: src.mission || null, unlock: src.unlock || null };
  for (const [id, slot, nm, r, d, o] of items) I(id, slot, nm, r || rarity, d, { ...(o || {}), set: key, ...(shop ? {} : { price: null }) });
}
const P = (prefix, rarity, parts) => parts.map(([slot, nm, d, r]) => [`${prefix}_${slot}`, slot, nm, r || rarity, d]);
SET('guerreiro', 'Guerreiro medieval', 'rara', 'Cota de malha, elmo nasal e espada longa.', [
  ['g_head', 'head', 'Elmo nasal', 'rara', { t: 'nasal', c: '#9aa3b2' }],
  ['g_chest', 'chest', 'Cota de malha', 'rara', { t: 'chain', c: '#8a919e', c2: '#7a2e2e' }],
  ['g_legs', 'legs', 'Calças reforçadas', 'comum', { t: 'pants', c: '#4a3a2a' }],
  ['g_boots', 'boots', 'Botas de ferro', 'rara', { t: 'sabatons', c: '#7d8592' }],
  ['g_gloves', 'gloves', 'Luvas de couro', 'comum', { t: 'gloves', c: '#6b4a2b' }],
  ['g_weapon', 'weapon', 'Espada longa', 'rara', { t: 'sword', c: '#cfd6df', c2: '#7a2e2e', len: 50 }],
  ['g_shield', 'shield', 'Escudo redondo', 'rara', { t: 'round', c: '#7a2e2e', c2: '#c0c6cf' }],
]);
SET('cavaleiro', 'Cavaleiro', 'epica', 'Armadura de placas completa, escudo com brasão.', [
  ['k_head', 'head', 'Elmo de cavaleiro', 'epica', { t: 'greathelm', c: '#c3cad6', c2: '#b91c1c' }],
  ['k_chest', 'chest', 'Peitoral de placas', 'epica', { t: 'plate', c: '#b7bfcc', c2: '#2f5196' }],
  ['k_legs', 'legs', 'Grevas de aço', 'rara', { t: 'greaves', c: '#a7b0bf' }],
  ['k_boots', 'boots', 'Sabatons de aço', 'rara', { t: 'sabatons', c: '#a7b0bf' }],
  ['k_gloves', 'gloves', 'Manoplas de aço', 'rara', { t: 'gauntlets', c: '#b7bfcc' }],
  ['k_weapon', 'weapon', 'Espada do cavaleiro', 'epica', { t: 'sword', c: '#e2e8f0', c2: '#c9a24a', len: 54 }],
  ['k_shield', 'shield', 'Escudo de brasão', 'epica', { t: 'kite', c: '#2f5196', c2: '#f1cf85' }],
  ['k_cape', 'cape', 'Capa azul real', 'rara', { t: 'cape', c: '#1e3a8a', c2: '#f1cf85' }],
]);
SET('samurai', 'Samurai', 'epica', 'Kabuto, armadura lamelar e katana.', [
  ['s_head', 'head', 'Kabuto', 'epica', { t: 'kabuto', c: '#1f1f24', c2: '#e0ad3a' }],
  ['s_mask', 'mask', 'Menpo', 'rara', { t: 'menpo', c: '#9b1c26' }],
  ['s_chest', 'chest', 'Armadura lamelar', 'epica', { t: 'lamellar', c: '#9b1c26', c2: '#1f1f24' }],
  ['s_legs', 'legs', 'Hakama', 'rara', { t: 'hakama', c: '#1f2937' }],
  ['s_boots', 'boots', 'Tabi', 'rara', { t: 'tabi', c: '#e5e7eb' }],
  ['s_gloves', 'gloves', 'Kote', 'rara', { t: 'gloves', c: '#1f1f24' }],
  ['s_weapon', 'weapon', 'Katana', 'epica', { t: 'katana', c: '#e5e7eb', c2: '#1f1f24' }],
]);
SET('assassino', 'Assassino', 'rara', 'Capuz, máscara e adagas silenciosas.', [
  ['a_head', 'head', 'Capuz sombrio', 'rara', { t: 'hood', c: '#1f2028' }],
  ['a_mask', 'mask', 'Máscara de pano', 'rara', { t: 'cloth', c: '#1f2028' }],
  ['a_chest', 'chest', 'Couro escuro', 'rara', { t: 'leather', c: '#2a2a34', c2: '#7f1d1d' }],
  ['a_legs', 'legs', 'Calças escuras', 'rara', { t: 'pants', c: '#1c1c24' }],
  ['a_boots', 'boots', 'Botas silenciosas', 'rara', { t: 'boots', c: '#1c1c24' }],
  ['a_gloves', 'gloves', 'Luvas escuras', 'rara', { t: 'gloves', c: '#22222b' }],
  ['a_weapon', 'weapon', 'Adagas gêmeas', 'rara', { t: 'dual', c: '#cbd5e1', c2: '#111', len: 26 }],
]);
SET('mago', 'Mago', 'epica', 'Chapéu pontudo, manto arcano e cajado.', [
  ['m_head', 'head', 'Chapéu arcano', 'rara', { t: 'wizard', c: '#3b2f7a', c2: '#f1cf85' }],
  ['m_chest', 'chest', 'Manto arcano', 'epica', { t: 'robe', c: '#3a2d6e', c2: '#f1cf85' }],
  ['m_legs', 'legs', 'Veste longa', 'rara', { t: 'pants', c: '#2b2156' }],
  ['m_boots', 'boots', 'Sapatos de tecido', 'comum', { t: 'shoes', c: '#3b2f7a' }],
  ['m_weapon', 'weapon', 'Cajado arcano', 'epica', { t: 'staff', c: '#9d8cff', c2: '#5b3b24' }],
  ['m_acc', 'accessory', 'Amuleto arcano', 'rara', { t: 'amulet', c: '#a78bfa' }],
  ['m_fx', 'effect', 'Runas arcanas', 'epica', { t: 'arcane', c: '#a78bfa' }],
]);
SET('cacador', 'Caçador', 'rara', 'Arco longo, capa verde e aljava.', [
  ['h_head', 'head', 'Capuz do caçador', 'rara', { t: 'hood', c: '#2f4a2b' }],
  ['h_chest', 'chest', 'Gibão de patrulheiro', 'rara', { t: 'leather', c: '#3f5b38', c2: '#7a5a34' }],
  ['h_legs', 'legs', 'Calças de campo', 'comum', { t: 'pants', c: '#3a3326' }],
  ['h_boots', 'boots', 'Botas de trilha', 'rara', { t: 'boots', c: '#5b4128' }],
  ['h_gloves', 'gloves', 'Braçadeiras', 'rara', { t: 'gloves', c: '#7a5a34' }],
  ['h_weapon', 'weapon', 'Arco longo', 'rara', { t: 'bow', c: '#7a4f2a', c2: '#e5e7eb' }],
  ['h_acc', 'accessory', 'Aljava', 'rara', { t: 'quiver', c: '#6b4426' }],
  ['h_cape', 'cape', 'Manto verde', 'rara', { t: 'cape', c: '#2f4a2b', c2: '#1d2e1b' }],
]);
SET('paladino', 'Paladino', 'lendaria', 'Armadura sagrada branca e dourada, martelo e escudo de luz.', [
  ['p_head', 'head', 'Elmo sagrado', 'lendaria', { t: 'greathelm', c: '#f1f5f9', c2: '#e0ad3a', g: '#fde68a' }],
  ['p_chest', 'chest', 'Placas sagradas', 'lendaria', { t: 'plate', c: '#f1f5f9', c2: '#e0ad3a', g: '#fde68a' }],
  ['p_legs', 'legs', 'Grevas douradas', 'epica', { t: 'greaves', c: '#e0ad3a' }],
  ['p_boots', 'boots', 'Sabatons dourados', 'epica', { t: 'sabatons', c: '#e0ad3a' }],
  ['p_gloves', 'gloves', 'Manoplas sagradas', 'epica', { t: 'gauntlets', c: '#f1f5f9' }],
  ['p_weapon', 'weapon', 'Martelo da luz', 'lendaria', { t: 'hammer', c: '#f1f5f9', c2: '#e0ad3a', g: '#fde68a' }],
  ['p_shield', 'shield', 'Escudo da aurora', 'lendaria', { t: 'holy', c: '#f1f5f9', c2: '#e0ad3a', g: '#fde68a' }],
  ['p_cape', 'cape', 'Capa branca', 'epica', { t: 'cape', c: '#f1f5f9', c2: '#e0ad3a' }],
  ['p_fx', 'effect', 'Luz sagrada', 'lendaria', { t: 'holy', c: '#fde68a' }],
], { shop: false, boss: false, theme: 'Sagrado' });
SET('sombrio', 'Guerreiro sombrio', 'lendaria', 'Placas negras com chifres, montante e névoa.', [
  ['d_head', 'head', 'Elmo chifrudo', 'lendaria', { t: 'horned', c: '#25262e', c2: '#d8d0b0', g: '#ef4444' }],
  ['d_chest', 'chest', 'Placas sombrias', 'lendaria', { t: 'plate', c: '#2b2d36', c2: '#7f1d1d', g: '#ef4444' }],
  ['d_legs', 'legs', 'Grevas sombrias', 'epica', { t: 'greaves', c: '#2b2d36' }],
  ['d_boots', 'boots', 'Sabatons sombrios', 'epica', { t: 'sabatons', c: '#2b2d36' }],
  ['d_gloves', 'gloves', 'Garras de aço negro', 'epica', { t: 'gauntlets', c: '#2b2d36' }],
  ['d_weapon', 'weapon', 'Montante do abismo', 'lendaria', { t: 'greatsword', c: '#3f3f46', c2: '#ef4444', g: '#ef4444' }],
  ['d_cape', 'cape', 'Manto rasgado', 'epica', { t: 'tattered', c: '#1c1018' }],
  ['d_fx', 'effect', 'Névoa sombria', 'lendaria', { t: 'shadow', c: '#3b1b5a' }],
]);
SET('explorador', 'Explorador', 'rara', 'Chapéu, casaco de campo e facão.', [
  ['e_head', 'head', 'Chapéu de explorador', 'rara', { t: 'explorer', c: '#8b6b3e' }],
  ['e_chest', 'chest', 'Casaco de campo', 'rara', { t: 'coat', c: '#a07a48', c2: '#5b4128' }],
  ['e_legs', 'legs', 'Calças cáqui', 'comum', { t: 'pants', c: '#7c6a4a' }],
  ['e_boots', 'boots', 'Botas de expedição', 'rara', { t: 'boots', c: '#4a3222' }],
  ['e_weapon', 'weapon', 'Facão', 'rara', { t: 'machete', c: '#cfd6df', c2: '#3a2a1a' }],
  ['e_acc', 'accessory', 'Bolsa de couro', 'comum', { t: 'satchel', c: '#6b4426' }],
]);
SET('futurista', 'Futurista', 'lendaria', 'Traje tecnológico, visor e lâmina de energia.', [
  ['f_head', 'head', 'Capacete com visor', 'epica', { t: 'visor', c: '#1f2937', c2: '#22d3ee', g: '#22d3ee' }],
  ['f_chest', 'chest', 'Traje tático', 'lendaria', { t: 'suit', c: '#1f2937', c2: '#22d3ee', g: '#22d3ee' }],
  ['f_legs', 'legs', 'Pernas tecnológicas', 'epica', { t: 'tech', c: '#1f2937', c2: '#22d3ee' }],
  ['f_boots', 'boots', 'Botas magnéticas', 'epica', { t: 'techboots', c: '#1f2937', c2: '#22d3ee' }],
  ['f_gloves', 'gloves', 'Luvas de fibra', 'rara', { t: 'gloves', c: '#111827' }],
  ['f_weapon', 'weapon', 'Lâmina de energia', 'lendaria', { t: 'laser', c: '#22d3ee', g: '#22d3ee' }],
  ['f_shield', 'shield', 'Escudo de energia', 'lendaria', { t: 'energy', c: '#22d3ee', g: '#22d3ee' }],
  ['f_fx', 'effect', 'Descargas elétricas', 'epica', { t: 'lightning', c: '#67e8f9' }],
]);
SET('celestial', 'Lendário celestial', 'mistica', 'Conjunto mítico obtido apenas por desafios especiais.', [
  ['c_head', 'head', 'Coroa eterna', 'mistica', { t: 'crown', c: '#fde68a', c2: '#f43f5e', g: '#fff1b0' }],
  ['c_chest', 'chest', 'Placas celestiais', 'mistica', { t: 'plate', c: '#fff7e0', c2: '#f5a524', g: '#fff1b0' }],
  ['c_legs', 'legs', 'Grevas celestiais', 'mistica', { t: 'greaves', c: '#fde68a' }],
  ['c_boots', 'boots', 'Sabatons celestiais', 'mistica', { t: 'sabatons', c: '#fde68a' }],
  ['c_gloves', 'gloves', 'Manoplas celestiais', 'mistica', { t: 'gauntlets', c: '#fff7e0' }],
  ['c_weapon', 'weapon', 'Espada da aurora', 'mistica', { t: 'sword', c: '#fff7e0', c2: '#f5a524', len: 58, g: '#fff1b0' }],
  ['c_shield', 'shield', 'Égide celestial', 'mistica', { t: 'holy', c: '#fff7e0', c2: '#f43f5e', g: '#fff1b0' }],
  ['c_cape', 'cape', 'Asas da aurora', 'mistica', { t: 'wings', c: '#fff1b0', g: '#fde68a' }],
  ['c_fx', 'effect', 'Aura mítica', 'mistica', { t: 'mythic', c: '#ff4d6d' }],
], { shop: false, boss: false, mission: 'desafio_semana_perfeita', theme: 'Celestial' });

// =====================================================================
//  Biblioteca de skins da atualização (desenhos em public/js/parts.js)
// =====================================================================
// ---------- COMUM ----------
SET('recruta', 'Recruta da Guarda', 'comum', 'Gibão acolchoado, chapéu de ferro e lança de patrulha.', P('rc', 'comum', [
  ['head', 'Chapéu de ferro', { t: 'kettle', c: '#8c939f' }],
  ['chest', 'Gibão acolchoado', { t: 'gambeson', c: '#b59b6d', c2: '#7a6342' }],
  ['legs', 'Calças de lã', { t: 'pants', c: '#5a4a36' }],
  ['boots', 'Botas de patrulha', { t: 'boots', c: '#3f2c1d' }],
  ['gloves', 'Luvas de couro cru', { t: 'gloves', c: '#6b4a2b' }],
  ['weapon', 'Lança de patrulha', { t: 'spear', c: '#c9ced6', c2: '#7a5332' }],
  ['shield', 'Broquel', { t: 'buckler', c: '#8c939f', c2: '#5d6470' }],
]), { theme: 'Medieval' });
SET('andarilho', 'Andarilho', 'comum', 'Manto de viagem, colete gasto e bordão de caminhada.', P('an', 'comum', [
  ['head', 'Capuz de viagem', { t: 'hood', c: '#5d5146' }],
  ['chest', 'Colete gasto', { t: 'vest', c: '#6b5a45', c2: '#b9a27a' }],
  ['legs', 'Calças remendadas', { t: 'pants', c: '#4b4033' }],
  ['boots', 'Faixas de caminhada', { t: 'wraps', c: '#8a7a63' }],
  ['cape', 'Manto curto', { t: 'mantle', c: '#4b4239', c2: '#2f2924' }],
  ['weapon', 'Bordão', { t: 'quarterstaff', c: '#7a5332' }],
  ['accessory', 'Bolsa do andarilho', { t: 'satchel', c: '#6b4426' }],
]), { theme: 'Viajante' });
SET('lenhador', 'Lenhador', 'comum', 'Camisa xadrez, gorro e machado de lenha.', P('ln', 'comum', [
  ['head', 'Gorro de lã', { t: 'cap', c: '#8e2b2b' }],
  ['chest', 'Camisa xadrez', { t: 'flannel', c: '#a12f2f', c2: '#3b1414' }],
  ['legs', 'Calças de brim', { t: 'pants', c: '#2f4a6b' }],
  ['boots', 'Botas de trabalho', { t: 'boots', c: '#5b3b22' }],
  ['gloves', 'Luvas grossas', { t: 'gloves', c: '#a07a48' }],
  ['weapon', 'Machado de lenha', { t: 'beardaxe', c: '#b8c0cb', c2: '#6b4426' }],
]), { theme: 'Floresta' });
SET('monge', 'Monge Errante', 'comum', 'Quimono de treino, faixa na testa e bastão.', P('mg', 'comum', [
  ['head', 'Faixa de concentração', { t: 'headband', c: '#c2410c' }],
  ['chest', 'Quimono de treino', { t: 'gi', c: '#e7dcc6', c2: '#c2410c' }],
  ['legs', 'Calças de treino', { t: 'pants', c: '#e0d4bb' }],
  ['boots', 'Sandálias', { t: 'sandals', c: '#7a5332' }],
  ['gloves', 'Faixas nas mãos', { t: 'wraps', c: '#efe6d2' }],
  ['weapon', 'Bastão do monge', { t: 'quarterstaff', c: '#9a6b3c', c2: '#c2410c' }],
  ['accessory', 'Contas de oração', { t: 'beads', c: '#7a3e1d' }],
]), { theme: 'Oriente' });
SET('marujo', 'Marujo', 'comum', 'Camisa listrada, bandana e sabre de abordagem.', P('mj', 'comum', [
  ['head', 'Bandana', { t: 'bandana', c: '#b91c1c' }],
  ['chest', 'Camisa listrada', { t: 'striped', c: '#f1f5f9', c2: '#1e3a8a' }],
  ['legs', 'Calças de convés', { t: 'pants', c: '#1f2a44' }],
  ['boots', 'Botas de convés', { t: 'boots', c: '#2a1d14' }],
  ['weapon', 'Sabre de abordagem', { t: 'saber', c: '#d4dae3', c2: '#c9a24a' }],
  ['accessory', 'Faixa vermelha', { t: 'scarf', c: '#b91c1c' }],
]), { theme: 'Mar' });
SET('ferreiro', 'Ferreiro', 'comum', 'Avental de couro, luvas de forja e martelo.', P('fr', 'comum', [
  ['head', 'Touca de forja', { t: 'cap', c: '#3a3a3a' }],
  ['chest', 'Avental de couro', { t: 'apron', c: '#6b4426', c2: '#9ca3af' }],
  ['legs', 'Calças de forja', { t: 'pants', c: '#3a3226' }],
  ['boots', 'Botas reforçadas', { t: 'boots', c: '#2a1d14' }],
  ['gloves', 'Luvas de forja', { t: 'gloves', c: '#4a3222' }],
  ['weapon', 'Martelo de forja', { t: 'smithhammer', c: '#6b7280', c2: '#5b3b24' }],
]), { theme: 'Ofício' });
SET('arqueiro', 'Arqueiro da Vila', 'comum', 'Gorro com pena, gibão verde e arco curto.', P('aq', 'comum', [
  ['head', 'Gorro com pena', { t: 'feathercap', c: '#3f6b2f', c2: '#dc2626' }],
  ['chest', 'Gibão verde', { t: 'leather', c: '#5b7a3a', c2: '#6b4426' }],
  ['legs', 'Calças de couro', { t: 'pants', c: '#4a3f2c' }],
  ['boots', 'Botas leves', { t: 'boots', c: '#5b4128' }],
  ['gloves', 'Braçadeira', { t: 'gloves', c: '#7a5a34' }],
  ['weapon', 'Arco curto', { t: 'bow', c: '#8b5a2b', c2: '#e5e7eb' }],
  ['accessory', 'Aljava simples', { t: 'quiver', c: '#6b4426' }],
]), { theme: 'Floresta' });
SET('escudeiro', 'Escudeiro', 'comum', 'Tabardo com brasão, elmo nasal e escudo heráldico.', P('es', 'comum', [
  ['head', 'Elmo de escudeiro', { t: 'nasal', c: '#8f98a6' }],
  ['chest', 'Tabardo heráldico', { t: 'tabard', c: '#1e40af', c2: '#f1cf85' }],
  ['legs', 'Calças de escudeiro', { t: 'pants', c: '#3a3a44' }],
  ['boots', 'Botas de couro', { t: 'boots', c: '#3f2c1d' }],
  ['gloves', 'Luvas de escudeiro', { t: 'gloves', c: '#5b4128' }],
  ['weapon', 'Espada de armas', { t: 'sword', c: '#cfd6df', c2: '#8a6a3a', len: 44 }],
  ['shield', 'Escudo heráldico', { t: 'heater', c: '#1e40af', c2: '#f1cf85' }],
]), { mission: 'm_primeira_semana', theme: 'Medieval' });

// ---------- RARA ----------
SET('viking', 'Saqueador Viking', 'rara', 'Pele de lobo, machado barbado e escudo pintado.', P('vk', 'rara', [
  ['head', 'Elmo de óculos', { t: 'viking', c: '#8f98a6', c2: '#6b4426' }],
  ['chest', 'Couro com pele', { t: 'furvest', c: '#5b4128', c2: '#d6cfc2' }],
  ['legs', 'Calças com faixas', { t: 'pants', c: '#4a3f33', c2: '#8a7a63' }],
  ['boots', 'Botas de pele', { t: 'furboots', c: '#5b4128', c2: '#d6cfc2' }],
  ['weapon', 'Machado barbado', { t: 'beardaxe', c: '#cfd6df', c2: '#5a3a22', big: true }],
  ['shield', 'Escudo pintado', { t: 'viking', c: '#7f1d1d', c2: '#e5e7eb' }],
  ['cape', 'Manto de pele', { t: 'furcape', c: '#3f3026', c2: '#d6cfc2' }],
]), { theme: 'Mitologia nórdica' });
SET('hoplita', 'Hoplita', 'rara', 'Couraça de bronze, elmo coríntio e escudo hoplon.', P('hp', 'rara', [
  ['head', 'Elmo coríntio', { t: 'corinthian', c: '#c9913a', c2: '#b91c1c' }],
  ['chest', 'Couraça de bronze', { t: 'cuirass', c: '#c9913a', c2: '#8a5a1f' }],
  ['legs', 'Saiote de tiras', { t: 'pteruges', c: '#e7dcc6', c2: '#8a5a1f' }],
  ['boots', 'Sandálias com grevas', { t: 'sandals', c: '#7a5332', c2: '#c9913a' }],
  ['weapon', 'Dóri', { t: 'spear', c: '#c9913a', c2: '#6a4528' }],
  ['shield', 'Hoplon', { t: 'hoplon', c: '#c9913a', c2: '#7f1d1d' }],
  ['cape', 'Capa escarlate', { t: 'cape', c: '#9b1c26', c2: '#5c0f16' }],
]), { theme: 'Mitologia grega' });
SET('ronin', 'Ronin', 'rara', 'Chapéu de palha, quimono desbotado e katana sem mestre.', P('rn', 'rara', [
  ['head', 'Jingasa de palha', { t: 'jingasa', c: '#c9a46a', c2: '#8a6a3a' }],
  ['chest', 'Quimono desbotado', { t: 'kimono', c: '#3b4a5c', c2: '#1f2937' }],
  ['legs', 'Hakama gasta', { t: 'hakama', c: '#2a2f3a' }],
  ['boots', 'Tabi de viagem', { t: 'tabi', c: '#e5e7eb' }],
  ['weapon', 'Katana sem mestre', { t: 'katana', c: '#e5e7eb', c2: '#111' }],
  ['accessory', 'Cachecol cinza', { t: 'scarf', c: '#6b7280' }],
]), { mission: 'm_metas_25', theme: 'Oriente' });

// ---------- ÉPICA ----------
SET('farao', 'Faraó do Sol', 'epica', 'Nemes listrado, colar de ouro, khopesh e disco solar.', P('fa', 'epica', [
  ['head', 'Nemes real', { t: 'nemes', c: '#f1cf85', c2: '#1e3a8a' }],
  ['chest', 'Colar usekh', { t: 'pharaoh', c: '#f5efe0', c2: '#d9a733', c3: '#1e3a8a' }],
  ['legs', 'Shendyt de linho', { t: 'shendyt', c: '#f5efe0', c2: '#d9a733' }],
  ['boots', 'Sandálias douradas', { t: 'sandals', c: '#d9a733' }],
  ['gloves', 'Braceletes de lápis-lazúli', { t: 'bracers', c: '#d9a733', g: '#38bdf8' }],
  ['weapon', 'Khopesh', { t: 'khopesh', c: '#e6c068', c2: '#1e3a8a' }],
  ['shield', 'Disco solar', { t: 'sundisc', c: '#e6c068', c2: '#f59e0b', g: '#fde68a' }],
  ['accessory', 'Ankh', { t: 'ankh', c: '#e6c068' }],
]), { theme: 'Mitologia egípcia' });
SET('peste', 'Doutor da Peste', 'epica', 'Máscara de bico, sobretudo negro e lanterna de miasma.', P('pt', 'epica', [
  ['head', 'Chapéu de aba larga', { t: 'plaguehat', c: '#1c1c22' }],
  ['mask', 'Máscara de bico', { t: 'beak', c: '#d6cfc2', c2: '#1c1c22' }],
  ['chest', 'Sobretudo encerado', { t: 'longcoat', c: '#24242c', c2: '#6b4a2b' }],
  ['legs', 'Calças negras', { t: 'pants', c: '#1c1c22' }],
  ['boots', 'Botas de couro negro', { t: 'boots', c: '#1a1410' }],
  ['gloves', 'Luvas enceradas', { t: 'gloves', c: '#2a1d14' }],
  ['weapon', 'Cajado-lanterna', { t: 'lanternstaff', c: '#3a2a1a', g: '#a3e635' }],
  ['effect', 'Miasma', { t: 'miasma', c: '#84cc16' }],
]), { boss: 'specter', theme: 'Sombrio' });
SET('kitsune', 'Lâmina da Raposa', 'epica', 'Máscara de kitsune, nove caudas de fogo-fátuo e odachi.', P('ks', 'epica', [
  ['mask', 'Máscara de kitsune', { t: 'kitsune', c: '#f8fafc', c2: '#dc2626' }],
  ['chest', 'Quimono de santuário', { t: 'kimono', c: '#f8fafc', c2: '#dc2626', pat: 'wave' }],
  ['legs', 'Hakama carmesim', { t: 'hakama', c: '#7f1d1d' }],
  ['boots', 'Tabi branco', { t: 'tabi', c: '#f8fafc' }],
  ['weapon', 'Odachi espiritual', { t: 'odachi', c: '#e5e7eb', c2: '#7f1d1d', g: '#60a5fa' }],
  ['accessory', 'Caudas espirituais', { t: 'tails', c: '#f8fafc', c2: '#dc2626' }],
  ['effect', 'Fogo de raposa', { t: 'foxfire', c: '#60a5fa' }],
]), { boss: 'shade', theme: 'Mitologia japonesa' });
SET('vapor', 'Engenheiro a Vapor', 'epica', 'Cartola com óculos, sobretudo de engrenagens e maça mecânica.', P('vp', 'epica', [
  ['head', 'Cartola com óculos', { t: 'goggles', c: '#3a2618', c2: '#c9913a' }],
  ['chest', 'Sobretudo de engrenagens', { t: 'gearcoat', c: '#6b4426', c2: '#c9913a' }],
  ['legs', 'Calças de oficina', { t: 'pants', c: '#3a3226' }],
  ['boots', 'Botas de latão', { t: 'boots', c: '#2a1d14' }],
  ['gloves', 'Luvas de mecânico', { t: 'gloves', c: '#4a3222' }],
  ['weapon', 'Maça mecânica', { t: 'gearmace', c: '#c9913a', c2: '#5b3b24' }],
  ['accessory', 'Caldeira portátil', { t: 'gearpack', c: '#c9913a' }],
  ['effect', 'Vapor', { t: 'steam', c: '#e5e7eb' }],
]), { mission: 'm_metas_100', theme: 'Steampunk' });

// ---------- LENDÁRIA ----------
SET('draconico', 'Cavaleiro Dracônico', 'lendaria', 'Escamas de dragão vermelho, elmo de crânio e asas membranosas.', P('dr', 'lendaria', [
  ['head', 'Elmo de crânio de dragão', { t: 'dragonhelm', c: '#7f1d1d', c2: '#f1cf85', g: '#f97316' }],
  ['chest', 'Couraça de escamas', { t: 'scale', c: '#991b1b', c2: '#f1cf85', g: '#f97316', sp: 'horn' }],
  ['legs', 'Grevas escamadas', { t: 'plated', c: '#7f1d1d', c2: '#f1cf85' }],
  ['boots', 'Garras de dragão', { t: 'claws', c: '#5b1414', c2: '#f1cf85' }],
  ['gloves', 'Manoplas de garra', { t: 'claws', c: '#7f1d1d', c2: '#f1cf85' }],
  ['weapon', 'Presa do dragão', { t: 'dragonblade', c: '#e5e7eb', c2: '#7f1d1d', g: '#f97316' }],
  ['shield', 'Escudo da serpe', { t: 'dragon', c: '#991b1b', c2: '#f1cf85', g: '#f97316' }],
  ['cape', 'Asas dracônicas', { t: 'dragonwings', c: '#7f1d1d', c2: '#3f0d0d' }],
  ['effect', 'Brasas dracônicas', { t: 'ember', c: '#ff6a3d' }],
]), { boss: 'golem', theme: 'Dracônico' });
SET('chamas', 'Senhor das Chamas', 'lendaria', 'Armadura de magma com veias incandescentes e coroa de fogo.', P('ch', 'lendaria', [
  ['head', 'Coroa de chamas', { t: 'flamecrown', c: '#2a1a14', g: '#ff7a2a' }],
  ['chest', 'Placas de magma', { t: 'magma', c: '#2a1a14', c2: '#ff7a2a', g: '#ff7a2a', sp: 'flame' }],
  ['legs', 'Grevas vulcânicas', { t: 'plated', c: '#2a1a14', g: '#ff7a2a' }],
  ['boots', 'Sabatons de obsidiana', { t: 'sabatons', c: '#2a1a14' }],
  ['gloves', 'Manoplas de brasa', { t: 'gauntlets', c: '#2a1a14' }],
  ['weapon', 'Montante de magma', { t: 'magmablade', c: '#2a1a14', g: '#ff7a2a' }],
  ['cape', 'Manto incandescente', { t: 'flamecape', c: '#3b1408' }],
  ['effect', 'Inferno', { t: 'inferno', c: '#ff7a2a' }],
]), { boss: 'wisp', theme: 'Fogo' });
SET('tempestade', 'Arauto da Tempestade', 'lendaria', 'Elmo alado, placas de trovão e tridente de relâmpagos.', P('tp', 'lendaria', [
  ['head', 'Elmo alado', { t: 'wingedhelm', c: '#cbd5e1', c2: '#e2e8f0', g: '#93c5fd' }],
  ['chest', 'Placas do trovão', { t: 'stormplate', c: '#334155', c2: '#93c5fd', g: '#60a5fa', sp: 'round' }],
  ['legs', 'Grevas do trovão', { t: 'plated', c: '#334155', g: '#60a5fa' }],
  ['boots', 'Sabatons de prata', { t: 'sabatons', c: '#64748b' }],
  ['gloves', 'Manoplas de prata', { t: 'gauntlets', c: '#64748b' }],
  ['weapon', 'Tridente do trovão', { t: 'trident', c: '#cbd5e1', c2: '#1e293b', g: '#93c5fd' }],
  ['cape', 'Capa de nuvens', { t: 'cape', c: '#1e3a8a', c2: '#0f172a' }],
  ['effect', 'Tempestade', { t: 'storm', c: '#93c5fd' }],
]), { mission: 'm_chefes_25', theme: 'Elemental' });
SET('druida', 'Druida Ancião', 'lendaria', 'Coroa de chifres, casca viva e cajado de vinhas.', P('dd', 'lendaria', [
  ['head', 'Coroa de galhadas', { t: 'antlers', c: '#d6c7a1', c2: '#4d7c0f' }],
  ['chest', 'Armadura de casca', { t: 'bark', c: '#5b4128', c2: '#4d7c0f', sp: 'leaf' }],
  ['legs', 'Calças de raízes', { t: 'pants', c: '#3f3326', c2: '#4d7c0f' }],
  ['boots', 'Faixas de musgo', { t: 'wraps', c: '#5b4128' }],
  ['gloves', 'Faixas de cipó', { t: 'wraps', c: '#6b5a45' }],
  ['weapon', 'Cajado de vinhas', { t: 'vinestaff', c: '#5b4128', c2: '#4d7c0f', g: '#a3e635' }],
  ['cape', 'Manto de folhas', { t: 'leafcape', c: '#3f6212', c2: '#1a2e05' }],
  ['effect', 'Folhas ao vento', { t: 'leaves', c: '#84cc16' }],
]), { theme: 'Natureza' });

// ---------- MÍSTICA ----------
SET('gelo', 'Soberano do Gelo Eterno', 'mistica', 'Armadura de cristal translúcido, lâmina glacial e nevasca perpétua.', P('gl', 'mistica', [
  ['head', 'Coroa glacial', { t: 'icecrown', c: '#e0f2fe', g: '#7dd3fc' }],
  ['chest', 'Couraça de cristal', { t: 'crystal', c: '#bae6fd', c2: '#e0f2fe', g: '#7dd3fc', sp: 'crystal' }],
  ['legs', 'Grevas de gelo', { t: 'plated', c: '#7fb8e6', g: '#e0f2fe' }],
  ['boots', 'Botas de cristal', { t: 'crystalboots', c: '#bae6fd' }],
  ['gloves', 'Manoplas de gelo', { t: 'gauntlets', c: '#bae6fd' }],
  ['weapon', 'Lâmina glacial', { t: 'iceblade', c: '#e0f2fe', g: '#7dd3fc' }],
  ['shield', 'Espelho de gelo', { t: 'mirror', c: '#bae6fd', g: '#e0f2fe' }],
  ['cape', 'Manto de geada', { t: 'icecape', c: '#0c4a6e', c2: '#bae6fd' }],
  ['effect', 'Nevasca eterna', { t: 'blizzard', c: '#e0f2fe' }],
]), { theme: 'Gelo' });
SET('arquidemonio', 'Arquidemônio', 'mistica', 'Chifres colossais, placas infernais, asas de demônio e fogo do abismo.', P('ad', 'mistica', [
  ['head', 'Chifres do abismo', { t: 'demonhorns', c: '#1c0f12', c2: '#3b0d12', g: '#ef4444' }],
  ['mask', 'Máscara oni', { t: 'oni', c: '#7f1d1d', g: '#fbbf24' }],
  ['chest', 'Placas infernais', { t: 'demon', c: '#1c0f12', c2: '#7f1d1d', g: '#ef4444', sp: 'spike' }],
  ['legs', 'Grevas infernais', { t: 'plated', c: '#1c0f12', g: '#ef4444' }],
  ['boots', 'Cascos de garra', { t: 'claws', c: '#1c0f12', c2: '#7f1d1d' }],
  ['gloves', 'Garras infernais', { t: 'claws', c: '#1c0f12', c2: '#ef4444' }],
  ['weapon', 'Lâmina profana', { t: 'demonblade', c: '#1c0f12', c2: '#7f1d1d', g: '#ef4444' }],
  ['cape', 'Asas demoníacas', { t: 'demonwings', c: '#2a0a10', c2: '#7f1d1d' }],
  ['effect', 'Fogo do abismo', { t: 'hellfire', c: '#ef4444' }],
]), { boss: 'tyrant', theme: 'Demoníaco' });
SET('oraculo', 'Oráculo Astral', 'mistica', 'Vestes de céu noturno, auréola flutuante e cajado de órbitas.', P('or', 'mistica', [
  ['head', 'Auréola astral', { t: 'halo', c: '#fde68a', c2: '#a78bfa', g: '#fde68a' }],
  ['chest', 'Vestes do firmamento', { t: 'astral', c: '#1e1b4b', c2: '#c4b5fd', g: '#a78bfa' }],
  ['legs', 'Calças estelares', { t: 'pants', c: '#1e1b4b' }],
  ['boots', 'Sapatilhas de nuvem', { t: 'shoes', c: '#312e81' }],
  ['weapon', 'Cajado das órbitas', { t: 'astralstaff', c: '#e0e7ff', c2: '#c4b5fd', g: '#a78bfa' }],
  ['accessory', 'Esferas orbitais', { t: 'orbs', c: '#c4b5fd' }],
  ['cape', 'Manto estrelado', { t: 'starcape', c: '#1e1b4b', c2: '#c4b5fd' }],
  ['effect', 'Nebulosa', { t: 'cosmic', c: '#a78bfa' }],
]), { mission: 'm_nivel_20', theme: 'Astral' });
SET('runico', 'Guardião Rúnico', 'mistica', 'Obsidiana de uma era esquecida, gravada com runas que respiram luz.', P('ru', 'mistica', [
  ['head', 'Elmo rúnico', { t: 'runehelm', c: '#27272a', c2: '#52525b', g: '#22d3ee' }],
  ['chest', 'Couraça rúnica', { t: 'rune', c: '#27272a', c2: '#3f3f46', g: '#22d3ee', sp: 'round' }],
  ['legs', 'Grevas rúnicas', { t: 'plated', c: '#27272a', g: '#22d3ee' }],
  ['boots', 'Sabatons de obsidiana', { t: 'sabatons', c: '#27272a' }],
  ['gloves', 'Manoplas rúnicas', { t: 'gauntlets', c: '#3f3f46' }],
  ['weapon', 'Lâmina rúnica', { t: 'runeblade', c: '#3f3f46', c2: '#18181b', g: '#22d3ee' }],
  ['shield', 'Égide rúnica', { t: 'runeshield', c: '#27272a', g: '#22d3ee' }],
  ['effect', 'Círculo de runas', { t: 'runes', c: '#22d3ee' }],
]), { boss: 'glutton', theme: 'Guerreiros antigos' });

// ---------- SECRETA ----------
SET('vazio', 'Eco do Vazio', 'secreta', 'Uma silhueta feita de céu sem estrelas. Dizem que há um rosto escondido entre as constelações.', P('vz', 'secreta', [
  ['head', 'Capuz do vazio', { t: 'voidhood', c: '#09090b', g: '#c084fc' }],
  ['mask', 'Rosto ausente', { t: 'voidface', g: '#e9d5ff' }],
  ['chest', 'Corpo do vazio', { t: 'void', c: '#09090b', g: '#c084fc' }],
  ['legs', 'Pernas do vazio', { t: 'void', c: '#09090b' }],
  ['boots', 'Passos do vazio', { t: 'void', c: '#09090b' }],
  ['weapon', 'Lâmina sem luz', { t: 'voidblade', g: '#c084fc' }],
  ['cape', 'Manto do horizonte', { t: 'voidcape', c: '#09090b', g: '#c084fc' }],
  ['effect', 'Singularidade', { t: 'void', c: '#c084fc' }],
]), { boss: 'tyrant', theme: 'Secreta' });
SET('relojoeiro', 'Relojoeiro do Tempo', 'secreta', 'Engrenagens que giram ao contrário quando o tempo dói. Apenas para quem venceu 100 dias.', P('rl', 'secreta', [
  ['head', 'Coroa do relógio', { t: 'chronocrown', c: '#d4a64a', c2: '#f8fafc', g: '#fde68a' }],
  ['chest', 'Mecanismo vivo', { t: 'chrono', c: '#2b2117', c2: '#d4a64a', g: '#fde68a', sp: 'gear' }],
  ['legs', 'Grevas de latão', { t: 'plated', c: '#2b2117', g: '#d4a64a' }],
  ['boots', 'Sabatons de latão', { t: 'sabatons', c: '#d4a64a' }],
  ['gloves', 'Manoplas do relojoeiro', { t: 'gauntlets', c: '#d4a64a' }],
  ['weapon', 'Ponteiro eterno', { t: 'clockspear', c: '#d4a64a', c2: '#2b2117', g: '#fde68a' }],
  ['cape', 'Asas de engrenagem', { t: 'gearwings', c: '#d4a64a' }],
  ['effect', 'Fluxo temporal', { t: 'chrono', c: '#fde68a' }],
]), { mission: 'streak_100', theme: 'Secreta' });
SET('prismatico', 'Espectro Prismático', 'secreta', 'Cristal vivo que decompõe a luz. Reservado a quem derrotou o Tirano doze vezes.', P('pr', 'secreta', [
  ['head', 'Coroa prismática', { t: 'prismcrown' }],
  ['mask', 'Viseira de prisma', { t: 'prism' }],
  ['chest', 'Couraça prismática', { t: 'prism', sp: 'crystal' }],
  ['legs', 'Grevas prismáticas', { t: 'prism' }],
  ['boots', 'Botas de prisma', { t: 'prism' }],
  ['gloves', 'Manoplas de prisma', { t: 'prism' }],
  ['weapon', 'Lâmina refratária', { t: 'prismblade' }],
  ['cape', 'Asas de cristal', { t: 'prismwings' }],
  ['effect', 'Refração', { t: 'prism' }],
]), { mission: 'm_finais_12', theme: 'Secreta' });

// Novos mascotes
I('pet_fox', 'pet', 'Raposa espiritual', 'epica', { t: 'fox', c: '#f8fafc', g: '#60a5fa' }, { price: null, unlock: { achievement: 'm_dias_30' } });
I('pet_frost', 'pet', 'Serpe de gelo', 'lendaria', { t: 'dragon', c: '#7dd3fc' });
I('pet_golem', 'pet', 'Golem de bolso', 'rara', { t: 'golem', c: '#78716c', g: '#22d3ee' });
I('pet_wisp', 'pet', 'Fogo-fátuo', 'rara', { t: 'wisp', c: '#a78bfa' });

// Desbloqueios especiais por conjunto
const unlockSet = (key, unlock) => ITEMS.filter((i) => i.set === key).forEach((i) => { i.unlock = unlock; i.price = null; });
unlockSet('paladino', { bosses: 5 });
unlockSet('celestial', { achievement: 'desafio_semana_perfeita' });
ITEMS.filter((i) => i.set === 'sombrio').forEach((i) => { i.unlock = { level: 10 }; });

// ---------- Títulos ----------
I('title_persistente', 'title', 'O Persistente', 'rara', { t: 'title' }, { price: null, unlock: { achievement: 'streak_7' } });
I('title_cacador', 'title', 'Caçador de Chefes', 'rara', { t: 'title' }, { price: null, unlock: { achievement: 'boss_1' } });
I('title_constante', 'title', 'Constante', 'epica', { t: 'title' }, { price: null, unlock: { achievement: 'streak_30' } });
I('title_inabalavel', 'title', 'Inabalável', 'lendaria', { t: 'title' }, { price: null, unlock: { achievement: 'final_1' } });
I('title_veterano', 'title', 'Veterano', 'rara', { t: 'title' }, { price: null, unlock: { level: 10 } });
I('title_lenda', 'title', 'Lenda Viva', 'mistica', { t: 'title' }, { price: null, unlock: { level: 25 } });
I('title_estudioso', 'title', 'Estudioso', 'rara', { t: 'title' }, { price: null, unlock: { achievement: 'attr_5' } });
I('title_incansavel', 'title', 'Incansável', 'epica', { t: 'title' }, { price: null, unlock: { achievement: 'm_dias_100' } });
I('title_tirano', 'title', 'Pesadelo do Tirano', 'lendaria', { t: 'title' }, { price: null, unlock: { achievement: 'm_finais_5' } });
I('title_colecionador', 'title', 'Colecionador', 'rara', { t: 'title' }, { price: null, unlock: { achievement: 'm_colecao_5' } });
I('title_curador', 'title', 'Curador de Lendas', 'lendaria', { t: 'title' }, { price: null, unlock: { achievement: 'm_colecao_15' } });
I('title_tempo', 'title', 'Senhor do Tempo', 'secreta', { t: 'title' }, { price: null, unlock: { achievement: 'streak_100' } });
I('title_prisma', 'title', 'Luz Partida', 'secreta', { t: 'title' }, { price: null, unlock: { achievement: 'm_finais_12' } });

const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
const FREE_ITEMS = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

// ---------- Conquistas e desafios ----------
/**
 * Conquistas e missões (mesmo sistema). Cada uma mede uma métrica calculada pelo servidor (metric) contra um alvo.
 * Recompensas: moedas, item, título e/ou skin completa (skin). Nenhuma missão exige uma categoria específica de meta:
 * todas medem constância nas metas que o próprio usuário escolheu.
 * Métricas: commitments, perfectDays, bestStreak, goalWeeks, milestones, bosses, finals, prs, workouts, records,
 * maxAttrLevel, charLevel, consistentRun, perfectWeeks, activeDays, skins.
 */
const ACHIEVEMENTS = [
  { key: 'first_activity', cat: 'Metas', name: 'Primeiro passo', desc: 'Cumpra seu primeiro compromisso.', metric: 'commitments', target: 1, coins: 15 },
  { key: 'first_day', cat: 'Consistência', name: 'Dia perfeito', desc: 'Cumpra todos os compromissos de um dia.', metric: 'perfectDays', target: 1, coins: 25 },
  { key: 'm_dias_7', cat: 'Consistência', name: 'Presença', desc: 'Registre progresso em 7 dias diferentes.', metric: 'activeDays', target: 7, coins: 40, mission: true },
  { key: 'm_dias_30', cat: 'Consistência', name: 'Hábito formado', desc: 'Registre progresso em 30 dias diferentes.', metric: 'activeDays', target: 30, coins: 120, item: 'pet_fox', mission: true },
  { key: 'm_dias_100', cat: 'Consistência', name: 'Incansável', desc: 'Registre progresso em 100 dias diferentes.', metric: 'activeDays', target: 100, coins: 400, title: 'title_incansavel', mission: true },
  { key: 'streak_7', cat: 'Ofensiva', name: 'Sete dias de ofensiva', desc: 'Alcance 7 dias de ofensiva.', metric: 'bestStreak', target: 7, coins: 50, item: 'fx_gold', title: 'title_persistente' },
  { key: 'streak_30', cat: 'Ofensiva', name: 'Trinta dias de ofensiva', desc: 'Alcance 30 dias de ofensiva.', metric: 'bestStreak', target: 30, coins: 150, title: 'title_constante' },
  { key: 'streak_100', cat: 'Ofensiva', name: 'Centenário', desc: 'Alcance 100 dias de ofensiva.', metric: 'bestStreak', target: 100, coins: 400, skin: 'relojoeiro', title: 'title_tempo', mission: true },
  { key: 'goal_1', cat: 'Metas', name: 'Meta cumprida', desc: 'Cumpra 100% de uma meta semanal.', metric: 'goalWeeks', target: 1, coins: 30 },
  { key: 'm_primeira_semana', cat: 'Metas', name: 'Juramento do escudeiro', desc: 'Cumpra 100% de 3 metas semanais.', metric: 'goalWeeks', target: 3, coins: 30, skin: 'escudeiro', mission: true },
  { key: 'goals_10', cat: 'Metas', name: 'Colecionador de metas', desc: 'Cumpra 10 metas semanais.', metric: 'goalWeeks', target: 10, coins: 100 },
  { key: 'm_metas_25', cat: 'Metas', name: 'Caminho do ronin', desc: 'Cumpra 25 metas semanais.', metric: 'goalWeeks', target: 25, coins: 100, skin: 'ronin', mission: true },
  { key: 'm_metas_100', cat: 'Metas', name: 'Engenhosidade', desc: 'Cumpra 100 metas semanais.', metric: 'goalWeeks', target: 100, coins: 300, skin: 'vapor', mission: true },
  { key: 'milestone_1', cat: 'Metas', name: 'Marco alcançado', desc: 'Alcance uma meta de carga ou de peso.', metric: 'milestones', target: 1, coins: 80 },
  { key: 'boss_1', cat: 'Chefes', name: 'Primeiro chefe derrotado', desc: 'Derrote um chefe.', metric: 'bosses', target: 1, coins: 60, item: 'wpn_flame', title: 'title_cacador' },
  { key: 'boss_10', cat: 'Chefes', name: 'Caçador de chefes', desc: 'Derrote 10 chefes.', metric: 'bosses', target: 10, coins: 200 },
  { key: 'm_chefes_25', cat: 'Chefes', name: 'Arauto da tempestade', desc: 'Derrote 25 chefes.', metric: 'bosses', target: 25, coins: 250, skin: 'tempestade', mission: true },
  { key: 'final_1', cat: 'Chefes', name: 'Constância absoluta', desc: 'Derrote o Boss Final (média ≥ 95%).', metric: 'finals', target: 1, coins: 120, item: 'fx_ember', title: 'title_inabalavel' },
  { key: 'm_finais_5', cat: 'Chefes', name: 'Pesadelo do Tirano', desc: 'Derrote o Boss Final 5 vezes.', metric: 'finals', target: 5, coins: 400, title: 'title_tirano', mission: true },
  { key: 'm_finais_12', cat: 'Desafios', name: 'Doze luas', desc: 'Derrote o Boss Final 12 vezes.', metric: 'finals', target: 12, coins: 600, skin: 'prismatico', title: 'title_prisma', mission: true, event: true },
  { key: 'pr_1', cat: 'Recordes', name: 'Primeiro recorde pessoal', desc: 'Supere sua maior carga em um exercício.', metric: 'prs', target: 1, coins: 30 },
  { key: 'pr_10', cat: 'Recordes', name: 'Quebra-recordes', desc: 'Bata 10 recordes pessoais.', metric: 'prs', target: 10, coins: 120 },
  { key: 'workout_10', cat: 'Registros', name: 'Frequentador', desc: 'Registre 10 treinos.', metric: 'workouts', target: 10, coins: 50 },
  { key: 'records_100', cat: 'Registros', name: 'Cronista', desc: 'Faça 100 registros detalhados.', metric: 'records', target: 100, coins: 120, item: 'fx_stars' },
  { key: 'attr_5', cat: 'Atributos', name: 'Especialização', desc: 'Leve um atributo ao nível 5.', metric: 'maxAttrLevel', target: 5, coins: 60, title: 'title_estudioso' },
  { key: 'attr_10', cat: 'Atributos', name: 'Especialista', desc: 'Leve um atributo ao nível 10.', metric: 'maxAttrLevel', target: 10, coins: 150 },
  { key: 'm_atributo_15', cat: 'Atributos', name: 'Mestria', desc: 'Leve um atributo ao nível 15.', metric: 'maxAttrLevel', target: 15, coins: 500, mission: true },
  { key: 'char_5', cat: 'Níveis', name: 'Aventureiro', desc: 'Alcance o nível 5 de personagem.', metric: 'charLevel', target: 5, coins: 60 },
  { key: 'char_10', cat: 'Níveis', name: 'Herói', desc: 'Alcance o nível 10 de personagem.', metric: 'charLevel', target: 10, coins: 150 },
  { key: 'm_nivel_20', cat: 'Níveis', name: 'Visão do oráculo', desc: 'Alcance o nível 20 de personagem.', metric: 'charLevel', target: 20, coins: 300, skin: 'oraculo', mission: true },
  { key: 'consistency_4w', cat: 'Consistência', name: 'Mês consistente', desc: 'Quatro semanas seguidas com média ≥ 80% nas metas.', metric: 'consistentRun', target: 4, coins: 150 },
  { key: 'm_colecao_5', cat: 'Coleção', name: 'Guarda-roupa', desc: 'Complete 5 skins.', metric: 'skins', target: 5, coins: 150, title: 'title_colecionador', mission: true },
  { key: 'm_colecao_15', cat: 'Coleção', name: 'Curador de lendas', desc: 'Complete 15 skins.', metric: 'skins', target: 15, coins: 600, title: 'title_curador', mission: true },
  { key: 'desafio_95x3', cat: 'Desafios', name: 'Desafio: Trilogia', desc: 'Derrote o Boss Final em 3 semanas.', metric: 'finals', target: 3, coins: 250, item: 'pet_phoenix', event: true },
  { key: 'desafio_semana_perfeita', cat: 'Desafios', name: 'Desafio: Semana perfeita', desc: 'Termine uma semana com 100% em todas as metas (mínimo 3).', metric: 'perfectWeeks', target: 1, coins: 300, skin: 'celestial', event: true },
];
const ACH_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

const BOSS_ARCHETYPES = {
  fisico: { archetype: 'golem', names: ['Golem da Inércia', 'Colosso do Sedentarismo'] },
  saude: { archetype: 'glutton', names: ['Fera da Gula', 'Hidra do Descuido'] },
  intelectual: { archetype: 'specter', names: ['Espectro da Distração', 'Lich do Esquecimento'] },
  disciplina: { archetype: 'shade', names: ['Sombra da Procrastinação', 'Arauto do Amanhã'] },
  social: { archetype: 'siren', names: ['Sereia do Isolamento', 'Eco do Silêncio'] },
  criatividade: { archetype: 'wisp', names: ['Fogo-fátuo do Bloqueio', 'Vazio da Página em Branco'] },
};

/**
 * Recompensas de chefes (sorteio feito apenas no servidor, uma vez por batalha vencida).
 * chance: probabilidade (em 10.000) de a vitória render uma skin. weights: distribuição da raridade sorteada (em 10.000).
 */
const LOOT = {
  boss: { chance: 2500, weights: { comum: 5500, rara: 3000, epica: 1100, lendaria: 350, mistica: 45, secreta: 5 } },
  final: { chance: 5500, weights: { comum: 2800, rara: 3300, epica: 2200, lendaria: 1150, mistica: 480, secreta: 70 } },
  exclusiveShare: 5000, // se houver skin exclusiva do chefe na raridade sorteada: 50% de chance de ser ela
};

/** Mapeamento de itens da versão anterior para os novos (migração). */
const LEGACY_ITEMS = {
  outfit_blue: 'chest_tunic_blue', outfit_crimson: 'chest_tunic_crimson', outfit_ranger: 'h_chest', outfit_mage: 'm_chest', outfit_royal: 'cape_royal',
  armor_leather: 'h_chest', armor_chain: 'g_chest', armor_plate: 'k_chest', armor_mystic: 'm_fx',
  acc_scarf: 'acc_scarf', acc_amulet: 'acc_amulet', acc_cape: 'cape_red', acc_gauntlets: 'k_gloves', acc_crown: 'c_head',
  wpn_iron: 'g_weapon', wpn_spear: 'wpn_spear', wpn_axe: 'wpn_axe', wpn_staff: 'm_weapon', wpn_great: 'd_weapon', wpn_flame: 'wpn_flame',
  fx_sparks: 'fx_sparks', fx_shadow: 'd_fx', fx_gold: 'fx_gold', fx_stars: 'fx_stars', fx_ember: 'fx_ember',
};
const LEGACY_HAIR = { hair_short: 'short', hair_long: 'long', hair_bald: 'bald', hair_spiky: 'spiky', hair_ponytail: 'ponytail', hair_mohawk: 'mohawk' };

module.exports = { LOOT, LEGACY_RARITY, SET_DISCOUNT, RARITIES, RARITY, SLOTS, APPEARANCE, DEFAULT_CHARACTER, ITEMS, ITEM_BY_ID, FREE_ITEMS, SETS, ACHIEVEMENTS, ACH_BY_KEY, BOSS_ARCHETYPES, LEGACY_ITEMS, LEGACY_HAIR };
