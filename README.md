# EvoRPG — Alpha 1.1

Aplicativo web de evolução pessoal gamificado. Você cria **as metas que quiser**: nenhuma é obrigatória. Você registra o que fez de verdade, e o sistema calcula XP, atributos, ofensiva, chefes semanais e estatísticas. O personagem é totalmente personalizável, com itens cosméticos de 6 raridades.

Não há dependências externas. Usa Node.js 22.5+ com SQLite nativo (`node:sqlite`), HTML/CSS/JS puro, e gráficos, personagem e batalhas próprios em Canvas 2D. Não é preciso `npm install`.

---

## Como executar

```bash
node --version            # precisa ser 22.5 ou superior
cp .env.example .env      # opcional: preencha OPENAI_API_KEY para habilitar a IA
npm start                 # ou: node --disable-warning=ExperimentalWarning server/index.js
```

Abra `http://localhost:3000`, **crie sua conta** (nome, e-mail e senha) e depois o seu personagem. Cada conta tem os próprios dados.

- **Acesso pelo celular na mesma rede:** use `HOST=0.0.0.0`. O acesso aos dados exige login.
- **Bancos de versões anteriores** (Alpha 1.0 e 1.1): são migrados automaticamente para o esquema v3. Antes disso, uma cópia de segurança é feita em `data/*.bak-v*`.

## Testes

```bash
npm test
```

São 38 testes automatizados (`node:test`):

- **`test/rules.test.js`**: curvas de nível, multiplicadores de ofensiva, cumprimento (mín./máx./faixa), média do Boss Final com teto de 100% por meta, penalidades e roteiro de batalha.
- **`test/api.test.js`** (servidor real com banco temporário e data simulada):
  - ausência de metas obrigatórias;
  - conversão diária, semanal e mensal;
  - registros detalhados (força, hidratação, sessões);
  - recorde de carga e meta-marco;
  - penalidades;
  - cancelamento sem penalidade;
  - estatísticas e relatório calculado;
  - IA desligada (503);
  - Boss Final com 97% (vitória) e 93% (derrota);
  - exclusão de marcos do Boss Final;
  - cosméticos: compra, equipamento, bloqueio de itens não possuídos;
  - proteção contra recompensa duplicada.
- **`test/auth.test.js`**:
  - cadastro e validações;
  - cookie seguro, com o banco guardando só o hash do token e da senha;
  - isolamento de dados entre contas;
  - logout e login;
  - troca de senha encerrando as outras sessões;
  - limite de tentativas;
  - bloqueio de origem externa;
  - herança do banco antigo pela primeira conta.
- **`test/migration.test.js`**: migrações v1→v4 e v2→v4 preservando dados.
- **`test/update.test.js`** (atualização 1.1):
  - interpretação de metas em linguagem natural;
  - análise individual e coerente de atributos;
  - validação da resposta da IA;
  - pesos gravados pelo servidor, mesmo quando o cliente tenta enviar outros;
  - campos personalizados;
  - compra de skin completa e skins exclusivas;
  - regra de armas de duas mãos;
  - sorteio de recompensas de chefes;
  - missões com entrega de skin.

## Variáveis de ambiente (`.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | não | Habilita a avaliação de metas, o chat da aba Detalhes, as análises nos relatórios e o relatório de chefes. **Fica apenas no servidor.** |
| `OPENAI_MODEL` | não | Padrão `gpt-4o-mini` (modelo já definido no projeto; precisa suportar *structured outputs*). |
| `PORT` | não | Padrão `3000`. |
| `HOST` | não | Padrão `127.0.0.1`. Use `0.0.0.0` para acesso pela rede local. |
| `DATA_DIR` | não | Padrão `./data`. Guarda `auth.db` (contas e sessões) e `users/u<id>.db` (um banco por conta). |
| `DB_FILE` | não | Banco da versão sem contas (padrão `./data/evolve.db`). A primeira conta criada recebe uma cópia dele. |
| `COOKIE_SECURE` | não | `1` para enviar o cookie de sessão só por HTTPS. |

Sem `OPENAI_API_KEY`, tudo funciona exceto os recursos de IA. Os relatórios estatísticos continuam sendo calculados pelo servidor.

---

## Contas: cadastro e login
- **Cadastro:** nome, e-mail e senha (mínimo de 8 caracteres, com letras e números). **Login** por e-mail e senha.
- **Sessão:** fica salva por 30 dias e é renovada com o uso. Dá para sair pela barra lateral ou pelo Perfil, e trocar a senha no Perfil (isso encerra as outras sessões abertas).
- **Dados separados:** cada conta tem seu próprio banco SQLite (`data/users/u<id>.db`). Uma conta nunca vê os dados de outra, e todas as rotas de dados exigem login.
- **Segurança:**
  - senhas guardadas com scrypt e sal aleatório;
  - o cookie é `HttpOnly` e `SameSite=Lax`, e `Secure` quando o acesso é por HTTPS ou `COOKIE_SECURE=1`;
  - o banco guarda só o hash SHA-256 do token de sessão;
  - pedidos de outros sites são recusados (verificação de origem);
  - login e cadastro têm limite de tentativas;
  - quando o e-mail ou a senha estão errados, a mensagem e o tempo de resposta são os mesmos.
- **Quem já usava a versão anterior:** a primeira conta criada recebe uma **cópia** do progresso existente (`data/evolve.db`). O arquivo original não é alterado.
- **Senha da versão anterior:** o `APP_PASSWORD` (senha única no navegador) foi substituído pelo login.

## Novidades da Alpha 1.1

### Criação de metas em linguagem natural
- **Como funciona:** o usuário escreve a meta do jeito dele (ex.: “Quero estudar matemática durante duas horas por dia”) e o sistema monta um rascunho com categoria, frequência, quantidade, unidade, dias, assunto ou exercício, prazo e campos sugeridos.
- **Revisão:** os campos aparecem já preenchidos e editáveis. As opções avançadas ficam recolhidas em “Mais opções”: descrição, critérios, observações e **campos personalizados**.
- **Valores sugeridos:** quando o texto é vago (“Quero melhorar minha alimentação”), o sistema completa com um valor sugerido e destaca isso. A análise também propõe uma versão mensurável da meta.
- **Interpretação:**
  - com `OPENAI_API_KEY`, quem interpreta é a IA (saída em JSON com esquema estrito);
  - sem a chave, um interpretador local determinístico (`server/interpret.js`) faz o trabalho.

### Análise individual de cada meta (atributos definidos pela análise)
- **O que é avaliado:** clareza, dificuldade, complexidade, frequência, viabilidade, consistência e relevância, cada uma com nota de 1 a 10 e comentário.
- **Atributos:** a análise define a **distribuição proporcional de XP** entre os atributos, com justificativa para cada um. Exemplos:
  - musculação → Físico, Saúde e Disciplina;
  - caminhada → Saúde e Físico;
  - inglês → Intelectual, Social e Disciplina;
  - escrever um livro → Criatividade, Disciplina e Intelectual.
- **Proteções contra manipulação:**
  - o cliente nunca envia pesos: o servidor guarda a análise e a referencia por um *token*;
  - a resposta da IA é validada (atributos válidos, notas de 1 a 10, fator de XP entre 0,9 e 1,1);
  - a resposta da IA é combinada com a referência da categoria: o atributo principal da categoria mantém no mínimo 30%;
  - metas equivalentes recebem a mesma análise (análise local determinística e cache para a IA);
  - os pesos ficam fixos na meta, sem alteração retroativa.
- **Metas antigas:** continuam usando a distribuição da categoria. Nenhum histórico foi recalculado de forma diferente.
- **Análise anterior por IA:** o botão “Avaliar com IA” continua disponível na edição de metas.

### Campos personalizados
Cada meta pode ter até 6 campos extras (número ou texto), por exemplo “Palavras escritas”, “Capítulo” ou “Humor”. Eles aparecem no formulário de registro, nos históricos, nas estatísticas da página da meta e nos dados enviados ao chat da aba Detalhes. Para quantidades genéricas, a unidade pode ganhar um nome (“palavras”, “músicas”).

### Skins: 6 raridades e 37 skins completas
- **Raridades:** Comum, Rara, Épica, Lendária, Mística e Secreta, cada uma com moldura, brilho e animação próprios. Na Lendária ou acima, o personagem ganha presença visual:
  - **Lendária:** brasas douradas;
  - **Mística:** aurora;
  - **Secreta:** prisma.
- **Biblioteca:** cerca de 320 itens em camadas, com silhuetas próprias (não são apenas recolorações). Os desenhos estão em `public/js/parts.js`. A lista completa de skins está na seção “Skins” abaixo.
- **Animação especial:** o personagem ergue a arma e libera o efeito da skin, que fica mais intenso.
- **Detalhes ocultos nas skins secretas:**
  - o “Rosto ausente” forma uma constelação de vez em quando;
  - o mecanismo do Relojoeiro gira ao contrário quando o personagem sofre dano.
- **Armas de duas mãos** (montantes, cajados, arcos, odachi, tridente) não combinam com escudo: o servidor ajusta e informa.

### Como obter skins
1. **Loja:** organizada por raridade, com prévia animada, descrição, peças, preço e indicação de posse. A skin completa custa 80% da soma das peças que faltam. As Secretas nunca são vendidas.
2. **Chefes:** cada vitória dá direito a um sorteio, feito **no servidor** com gerador criptográfico, uma única vez por batalha e registrado em `reward_drops`. Derrota não dá recompensa.
   - **Boss 1 e Boss 2:** 25% de chance de skin. A raridade sai na proporção Comum 55%, Rara 30%, Épica 11%, Lendária 3,5%, Mística 0,45% e Secreta 0,05%.
   - **Boss Final:** 55% de chance de skin. A proporção é Comum 28%, Rara 33%, Épica 22%, Lendária 11,5%, Mística 4,8% e Secreta 0,7%.
   - **Exclusivas:** algumas skins só caem de um chefe específico (por exemplo, o Doutor da Peste do Espectro da Distração e o Eco do Vazio do Tirano). Quando há uma exclusiva na raridade sorteada, ela tem 50% de chance de ser a escolhida.
   - **Sem skin disponível:** se você já tiver todas as skins daquela raridade, o sistema procura em raridades menores. Se não sobrar nenhuma, a vitória vira moedas.
3. **Missões:** medem constância nas metas escolhidas pelo usuário, sem exigir nenhuma atividade específica. Algumas entregam skins completas:
   - 3 metas semanais → Escudeiro;
   - 25 → Ronin;
   - 100 → Engenheiro a Vapor;
   - 25 chefes → Arauto da Tempestade;
   - nível 20 → Oráculo Astral;
   - 100 dias de ofensiva → Relojoeiro do Tempo (secreta);
   - 12 Boss Finais → Espectro Prismático (secreta).

   Outras missões dão moedas, títulos ou mascotes. O progresso é calculado pelo servidor.

### Migração v3 → v4 (segura, apenas acréscimos)
- **Backup:** antes de migrar, é feita uma cópia em `data/*.v3-backup-*.db`.
- **Novas colunas em `goals`:** `source_text`, `weights`, `analysis`, `analysis_source`, `xp_factor`, `custom_fields`.
- **Novas tabelas:** `reward_drops` e `goal_analysis_cache`.
- **Dados preservados:** inventário, personagem, XP e moedas. Os IDs de itens antigos foram mantidos e as raridades antigas foram mapeadas para as novas.

## Funcionalidades

### Metas (aba Metas)
- **Nenhuma meta obrigatória.** Há 10 modelos opcionais.
- **Categorias:**
  - exercício: musculação, calistenia, caminhada, corrida, ciclismo, natação, esporte, carga em exercício;
  - saúde: água, calorias, proteínas, carboidratos, gorduras, sono, meditação, peso;
  - mente: leitura, estudo, idiomas;
  - social, criatividade, projetos, produtividade e hábitos livres.
- **Campos da meta:** nome, descrição, objetivo, categoria, unidade, frequência (por dia, vezes por semana, por semana, por mês ou até o prazo), dias programados, prazo, valor-alvo, observações e critérios de conclusão.
- **Tipos de meta:**
  - quantitativas: mínimo, máximo ou faixa;
  - de sessão/qualitativas: hábitos;
  - **marcos**: carga em um exercício ou peso corporal.
- **Conversão automática** para os valores diário, semanal e mensal. A prévia aparece antes de salvar.
- **Avaliação por IA** (realismo, sugestões, valor sugerido). O usuário aprova. O servidor valida limites e usa um *token* para impedir pontuações forjadas.
- **O usuário não escolhe atributos nem XP.** O sistema define os pesos pela categoria e a intensidade pela dificuldade.
- **Edição:**
  - nome e descrição mudam na hora;
  - valor-alvo e frequência valem a partir do próximo ciclo (segunda-feira) e ficam versionados;
  - encerrar uma meta não gera penalidade.

### Registros detalhados
Cada tipo de registro tem um formulário próprio. Os dados ficam em JSON por tipo (`records.kind` + `data`), então o banco aceita novos tipos sem migração.

- **Força:** exercícios, séries, repetições, carga, descanso e grupo muscular. Tem autocompletar e "Repetir último treino".
- **Cardio:** modalidade, distância, tempo, passos e ritmo calculado.
- **Leitura:** livro, autor (preenchido automaticamente), páginas e tempo.
- **Estudo:** assunto, tempo, conteúdo, exercícios e desempenho.
- **Refeição:** tipo, descrição, kcal e macronutrientes.
- **Hidratação:** quantidade, unidade e horário, com botões rápidos (+250 ml, +500 ml, +1 L).
- **Sono:** horários e qualidade.
- **Corpo:** peso e cintura.
- **Sessões:** para hábitos, idiomas, projetos e outros.

Registros podem ser editados ou excluídos por até 30 dias. Dias sem registro contam 0%, mas não são falha.

### Progressão
- **6 atributos:** Saúde, Físico, Intelectual, Disciplina, Social e Criatividade. Disciplina exige 60% mais XP por nível.
- **Ofensiva com multiplicador:** 1,05x com 3 dias, até 1,5x.
- **Bônus:** dia perfeito, regularidade de sono e recordes pessoais.
- **XP por superação:** até +20% acima do alvo.
- **Penalidades limitadas** por falha marcada. Não há penalidade para metas encerradas, dias de descanso ou exceções justificadas.
- **Livro-razão de XP e moedas** com chaves únicas. O recálculo é determinístico, então não há recompensa duplicada.

### Chefes (aba Chefes)
- **Boss 1 e Boss 2:** metas escolhidas para o ciclo (travadas a partir de segunda-feira).
- **Boss Final:** média aritmética simples de todas as metas do ciclo, com teto de 100% por meta. Vence com **≥ 95%**.
  - Marcos não entram no cálculo.
  - É permitida 1 suspensão justificada por ciclo.
- **Batalhas animadas em Canvas.** O dano vem dos registros, sem aleatoriedade.
- **Relatório semanal** calculado pelo servidor, mais uma análise opcional por IA.

### Evolução (aba Evolução)
- **Visão geral** por período (7, 30 ou 90 dias, ou todo o período):
  - XP e comparação com o período anterior;
  - consistência, dias perfeitos e ofensiva;
  - evolução dos atributos;
  - XP acumulado;
  - desempenho semanal com a linha de 95%;
  - metas com melhor evolução.
- **Página individual por meta**, com estatísticas próprias do tipo:
  - **Força:** carga máxima e 1RM estimado por exercício, volume semanal, recordes, exercícios estagnados e séries por grupo.
  - **Cardio:** distância, tempo e ritmo.
  - **Leitura:** páginas, livros e ritmo.
  - **Estudo:** horas por assunto.
  - **Nutrição:** média por refeição.
  - **Hidratação:** distribuição por horário.
  - **Sono:** média, horários e variação.
  - **Marcos:** progresso até o alvo.

  Não há gráficos irrelevantes: cada bloco só aparece quando há dados daquele tipo.

### Detalhes (aba Detalhes — IA)
- **Chat por meta** com histórico de conversas e perguntas sugeridas por tipo.
  - A IA recebe **apenas** as estatísticas e os registros daquela meta.
  - Cada afirmação é marcada como **registrado**, **calculado**, **estimativa** ou **recomendação**.
  - As instruções proíbem inventar dados.
- **Relatórios estruturados:**
  - conteúdo: resumo, estatísticas com origem, comparação, pontos positivos, pontos de atenção, tendências, recomendações e limitações;
  - a parte calculada é sempre gerada pelo servidor, mesmo sem IA;
  - os relatórios ficam salvos.

### Personagem (aba Personagem)
- **Aparência:** 3 corpos, 8 tons de pele, rostos, olhos e cor dos olhos, 12 cabelos e cores, e barbas.
- **Cerca de 320 itens em 13 espaços:** cabeça, máscara, peitoral, pernas, botas, luvas, arma, escudo, capa, acessório, efeito, mascote e título.
- **37 skins (conjuntos):**
  - **Comum:** Recruta da Guarda, Andarilho, Lenhador, Monge Errante, Marujo, Ferreiro, Arqueiro da Vila, Escudeiro.
  - **Rara:** Guerreiro medieval, Assassino, Caçador, Explorador, Saqueador Viking, Hoplita, Ronin.
  - **Épica:** Cavaleiro, Samurai, Mago, Faraó do Sol, Doutor da Peste, Lâmina da Raposa, Engenheiro a Vapor.
  - **Lendária:** Paladino, Guerreiro sombrio, Futurista, Cavaleiro Dracônico, Senhor das Chamas, Arauto da Tempestade, Druida Ancião.
  - **Mística:** Lendário celestial, Soberano do Gelo Eterno, Arquidemônio, Oráculo Astral, Guardião Rúnico.
  - **Secreta:** Eco do Vazio, Relojoeiro do Tempo, Espectro Prismático.
- **6 raridades:** Comum, Rara, Épica, Lendária, Mística e Secreta (veja “Novidades da Alpha 1.1”).
- **Formas de desbloqueio:** moedas, conquistas, chefes derrotados, nível ou eventos. Todos os itens são **apenas cosméticos**.
- **Animações:** parado, caminhar, ataque, dano, vitória, derrota e equipar. A prévia aparece ao passar o mouse sobre um item.
- **22 conquistas** que liberam moedas, itens, títulos e mascotes.
- **Adicionar novas skins ou itens:** use `SET(...)` em `server/catalog.js`, informando as peças e a origem (loja, chefe ou missão). Se a skin precisar de um desenho novo, registre o desenhista em `public/js/parts.js`. O renderizador também aceita `{ t: 'image', src: '/sprites/…' }` para *sprites* em PNG.

---

## Estrutura do projeto

```
server/
  index.js      servidor HTTP, .env, arquivos estáticos, CSP, sessão → banco do usuário
  auth.js       contas, senhas (scrypt), sessões, limite de tentativas
  routes.js     API REST (validação de toda entrada)
  engine.js     motor: metas versionadas, ciclos, XP, ofensiva, chefes, marcos, conquistas
  rules.js      regras puras (curvas, multiplicadores, cumprimento, Boss Final)
  goaltypes.js  categorias de meta, unidades, frequências, modelos
  interpret.js  interpretação de metas em linguagem natural e análise individual (local) + validação da IA
  records.js    tipos de registro (validação, métricas, agregação, estatísticas de exercícios)
  stats.js      estatísticas da aba Evolução e pacotes de dados para a IA
  catalog.js    raridades, aparência, itens, skins, conquistas, arquétipos de chefe
  ai.js         OpenAI (avaliação, chat, relatórios) — chave só no servidor
  db.js         esquema SQLite v3 e migrações
  util.js       datas, validadores, erros
public/
  index.html, css/style.css
  js/app.js       navegação, estado, feedback
  js/hero.js      renderizador do personagem em camadas + animações
  js/parts.js     biblioteca de peças das skins (troncos, elmos, armas, escudos, asas, efeitos)
  js/sprites.js   chefes; js/gfx.js utilitários de desenho
  js/charts.js    gráficos em Canvas
  js/records.js   formulários adaptativos de registro
  js/goalform.js  campos/prévia de metas
  js/views/       inicio, metas, chefes, evolucao, detalhes, personagem, perfil
test/             testes automatizados
data/             banco SQLite (criado na primeira execução)
```

## Segurança
- A chave da OpenAI fica apenas no backend. O frontend nunca a recebe.
- **CSP restritiva:** `script-src 'self'`, sem scripts inline.
- **Proteções no servidor:** proteção contra requisições cross-site, limite de taxa nas chamadas de IA, login obrigatório para todos os dados e limite de tentativas de login.
- **XP, moedas e dano dos chefes:** são calculados exclusivamente pelo servidor.
- **Dados mostrados:** nenhum dado fictício é exibido como real. Estimativas, como o 1RM e o "Mensal (est.)", aparecem identificadas.

## Pendências e limitações conhecidas
- **IA:** não foi testada com uma chave real neste ambiente, por falta de acesso à rede. Estão cobertos por testes o caminho sem chave e a validação da resposta da IA (por meio de respostas simuladas).
- **Pesos de metas antigas:** metas criadas antes da 1.1 mantêm a distribuição da categoria. Ainda não há botão para reanalisá-las, porque isso alteraria a distribuição de XP dali em diante.
- **Recuperação de senha:** não há “esqueci minha senha”, porque o servidor não envia e-mails. Hoje a única saída é trocar a senha estando logado.
- **Visuais:** os personagens e chefes são vetoriais em Canvas. Ainda não há *sprites* desenhados à mão, mas o renderizador já está preparado para recebê-los.
- **Gráficos:** são próprios, em Canvas, no lugar do Chart.js, porque não havia acesso ao npm/CDN.
- **Eventos sazonais:** o sistema já suporta itens com desbloqueio por evento, mas não há calendário de eventos.
- **Funcionamento offline:** não há PWA nem notificações.
