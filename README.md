# Cafofo do Pet 🐾

App de agendamento de serviços para pets (banho, tosa e veterinário), com painel
administrativo para o pet shop. Web, responsivo, dois times de páginas (cliente e admin)
consumindo a mesma API REST.

- **Frontend:** HTML + CSS + JavaScript puro (sem build step/bundler), múltiplas páginas
  estáticas consumindo a API via `fetch`
- **Backend:** Node.js + Express (API REST, arquitetura em camadas rotas → middlewares → banco)
- **Banco de dados:** MySQL (via `mysql2/promise`, pool de conexões) — hospedado no
  desenvolvimento em uma instância gerenciada (Aiven)
- **Autenticação:** JWT (JSON Web Token), dois papéis distintos: cliente (login por telefone, sem código de verificação)
  e administrador (usuário/senha com hash bcrypt)

> **Requisito:** Node.js **18+** no backend. O projeto já não depende de `node:sqlite`
> (versão anterior) — hoje usa MySQL via `mysql2`.

## Estrutura do projeto

```
TCC-frontend-html-css-js/
├── backend/
│   ├── server.js              # bootstrap do Express: middlewares globais + registro de rotas
│   ├── db/
│   │   ├── database.js        # pool mysql2 + criação de schema (CREATE TABLE IF NOT EXISTS)
│   │   └── seed.js            # dados iniciais: serviços padrão + admin default
│   ├── middleware/
│   │   ├── auth.js            # JWT do cliente (signToken / requireAuth)
│   │   ├── adminAuth.js       # JWT do admin (signAdminToken / requireAdminAuth)
│   │   └── asyncHandler.js    # wrapper p/ propagar erros async ao error handler do Express
│   ├── routes/
│   │   ├── auth.js            # login por telefone, perfil do cliente
│   │   ├── pets.js             # CRUD de pets (+ upload de foto via multer)
│   │   ├── vaccines.js         # CRUD de vacinas (aninhado em pets/:petId)
│   │   ├── services.js         # catálogo de serviços + horários disponíveis (slots)
│   │   ├── addresses.js        # CRUD de endereços do cliente
│   │   ├── appointments.js     # criação/listagem/cancelamento de agendamentos
│   │   ├── adminAuth.js        # login do admin
│   │   └── admin.js            # dashboard, calendário, clientes, analytics
│   └── uploads/                # arquivos enviados (fotos de pet), servidos em /uploads
└── frontend/
    ├── index.html … sucesso.html   # jornada do cliente (uma página por etapa)
    ├── js/                          # api.js, config.js, guard.js + 1 script por página
    ├── css/style.css
    └── admin/                       # páginas e scripts do painel administrativo
```

## Como rodar localmente

Você vai precisar de **Node.js 18+** e de um banco **MySQL** acessível (local ou um serviço
gerenciado, ex. Aiven/PlanetScale/RDS). Abra dois terminais.

### 1. Backend

```bash
cd backend
npm install
```

Crie um arquivo `.env` (não versionado) com:

Para a configuração local, `npm run setup:env` cria esse arquivo a partir de `.env.example`
com um `JWT_SECRET` aleatório privado. Não sobrescreve um `.env` existente. Se já houver
um arquivo com o segredo antigo, gere um novo com
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
e atualize `JWT_SECRET` no arquivo. Em hospedagem, configure o segredo nas variáveis do serviço.

```
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=cafofo_do_pet
PORT=3333
JWT_SECRET=<segredo-privado-aleatorio-de-pelo-menos-32-bytes>
# opcionais:
# ADMIN_DEFAULT_PASSWORD=admin123
```

```bash
npm run dev
```

A API sobe em `http://localhost:3333`. Na primeira execução, `initDatabase()` cria as tabelas
(`CREATE TABLE IF NOT EXISTS`) e `seed()` insere os serviços padrão (Banho, Tosa) e um
administrador padrão (usuário `admin`, senha `admin123` ou o valor de `ADMIN_DEFAULT_PASSWORD`).

### 2. Frontend

O frontend é HTML/CSS/JS puro, sem build step. Basta servir a pasta `frontend/` como arquivos
estáticos — por exemplo, com a extensão Live Server do VS Code, `npx serve frontend` ou o
Apache do XAMPP apontando para essa pasta.

Por padrão as páginas chamam a API em `http://<mesmo-host-da-página>:3333/api`
(ver `frontend/js/config.js` — isso funciona tanto em `localhost` quanto acessando pelo IP da
máquina na rede, ex. pelo celular). Se precisar apontar para outra URL, defina
`window.CAFOFO_API_URL = "https://sua-api/api"` num `<script>` antes de importar `js/config.js`.

Abra `frontend/index.html` (jornada do cliente) ou `frontend/admin/login.html` (painel
administrativo) pelo servidor estático escolhido.

## Desenvolvimento local com XAMPP

O XAMPP fornece o **MySQL** (banco) e o **Apache** (frontend estático); a API continua sendo o
Node/Express.

1. No painel do XAMPP, inicie **Apache** e **MySQL**.
2. Backend: `cd backend && npm install && npm run setup:env && npm run dev`.
   O `.env.example` já vem com os padrões do XAMPP (`root`, sem senha) e o banco
   `cafofo_do_pet` é criado automaticamente na primeira execução (tabelas + seed também).
   Veja/edite os dados em http://localhost/phpmyadmin.
3. Frontend: copie/linke a pasta `frontend/` para `C:\xampp\htdocs\cafofo` (ou aponte o
   `DocumentRoot`/um `Alias` do Apache para ela) e abra http://localhost/cafofo/index.html
   (admin: http://localhost/cafofo/admin/login.html).
   Para não copiar a cada mudança, crie um link simbólico (PowerShell como admin):
   `New-Item -ItemType SymbolicLink -Path C:\xampp\htdocs\cafofo -Target "<caminho>\frontend"`.

O frontend chama a API em `http://localhost:3333/api` (CORS já liberado), então nada muda no
código ao alternar entre XAMPP e produção. Em produção (Vercel/Render) defina as variáveis do
`.env` no painel do host; para bancos gerenciados que exigem TLS (ex: Aiven) use `DB_SSL=true`.

## Arquitetura

```mermaid
flowchart LR
    subgraph Cliente["Navegador — Cliente"]
        FC["frontend/*.html<br/>+ js/*.js"]
    end
    subgraph Admin["Navegador — Admin"]
        FA["frontend/admin/*.html<br/>+ admin/js/*.js"]
    end
    subgraph API["Backend Express (server.js)"]
        MW["Middlewares globais<br/>cors, express.json, static /uploads"]
        R1["routes/auth.js"]
        R2["routes/pets.js"]
        R3["routes/vaccines.js"]
        R4["routes/services.js"]
        R5["routes/addresses.js"]
        R6["routes/appointments.js"]
        R7["routes/adminAuth.js"]
        R8["routes/admin.js"]
        AUTH["middleware/auth.js<br/>requireAuth (JWT cliente)"]
        AADMIN["middleware/adminAuth.js<br/>requireAdminAuth (JWT admin)"]
    end
    DB[("MySQL<br/>pool mysql2/promise")]
    UP[("backend/uploads<br/>fotos de pet")]

    FC -- "fetch + Bearer token" --> MW
    FA -- "fetch + Bearer token" --> MW
    MW --> R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8
    R2 & R3 & R5 & R6 --> AUTH
    R8 --> AADMIN
    R1 & R2 & R3 & R4 & R5 & R6 & R7 & R8 --> DB
    R2 -- "multer" --> UP
    UP -. "servido em /uploads" .-> FC
```

## Fluxo do cliente (login + agendamento)

```mermaid
sequenceDiagram
    participant U as Cliente (navegador)
    participant API as API Express
    participant DB as MySQL

    U->>API: POST /api/auth/login {phone, name}
    API->>DB: busca o user pelo telefone (cria se não existir)
    API-->>U: { token JWT, user }

    Note over U: token salvo em localStorage (js/api.js)

    U->>API: GET /api/pets (Authorization: Bearer token)
    API->>API: requireAuth valida JWT
    API->>DB: SELECT pets WHERE user_id = ?
    API-->>U: lista de pets

    U->>API: GET /api/services/:id/slots?date=...
    API->>DB: horários já ocupados naquele dia/serviço
    API-->>U: grade 08:00–18:00 a cada 30min, com available

    U->>API: POST /api/appointments {pet_id, service_id, date, time, checkin_mode, checkout_mode}
    API->>DB: checa conflito de horário, calcula total (serviço + taxa de busca/entrega)
    API-->>U: agendamento criado (201)
```

## Fluxo do administrador

```mermaid
sequenceDiagram
    participant A as Admin (navegador)
    participant API as API Express
    participant DB as MySQL

    A->>API: POST /api/admin/auth/login {username, password}
    API->>DB: SELECT admin WHERE username = ?
    API->>API: bcrypt.compare(password, password_hash)
    API-->>A: { token JWT com role:"admin" }

    A->>API: GET /api/admin/appointments/today (Bearer token)
    API->>API: requireAdminAuth confere role === "admin"
    API->>DB: agendamentos do dia (JOIN users, pets, services)
    API-->>A: lista para o dashboard

    A->>API: GET /api/admin/clients/pending
    API->>DB: usuários com status = 'pendente'
    API-->>A: lista para aprovação/reprovação

    A->>API: PATCH /api/admin/clients/:id/status {status}
    API->>DB: UPDATE users SET status = ?
    API-->>A: cliente atualizado

    A->>API: GET /api/admin/analytics
    API->>DB: agregações (demanda, receita, taxa de busca, clientes) últimos 12 meses
    API-->>A: dados para gráficos (analise.html)
```

## Modelo de dados

```mermaid
erDiagram
    users ||--o{ pets : possui
    users ||--o{ addresses : possui
    users ||--o{ appointments : agenda
    pets ||--o{ vaccines : possui
    pets ||--o{ appointments : "e o pet do"
    services ||--o{ appointments : "e o servico do"
    addresses ||--o{ appointments : "opcional, para busca/entrega"

    users {
        varchar id PK
        varchar phone UK
        varchar name
        varchar status "pendente|aprovado|reprovado"
    }
    admins {
        varchar id PK
        varchar username UK
        varchar password_hash
        varchar name
    }
    pets {
        varchar id PK
        varchar user_id FK
        varchar name
        varchar breed
        int age_years
        varchar size
        varchar photo_url
    }
    vaccines {
        varchar id PK
        varchar pet_id FK
        varchar name
        varchar applied_at
        varchar next_dose_at
    }
    services {
        varchar id PK
        varchar name
        int price_cents
        int duration_min
    }
    addresses {
        varchar id PK
        varchar user_id FK
        varchar street
        varchar city
        tinyint is_default
    }
    appointments {
        varchar id PK
        varchar user_id FK
        varchar pet_id FK
        varchar service_id FK
        varchar address_id FK
        varchar date
        varchar time
        varchar status "agendado|cancelado"
        int total_cents
    }
```

## Conceitos e padrões usados

- **REST sobre Express**: cada recurso (`pets`, `services`, `appointments`, ...) tem seu próprio
  `Router` em `backend/routes/`, montado em `server.js` com um prefixo (`app.use("/api/pets", ...)`).
- **Middleware chain**: `router.use(requireAuth)` no topo de um arquivo de rotas protege
  *todas* as rotas daquele router de uma vez, em vez de repetir o middleware rota a rota.
- **JWT (JSON Web Token) com dois papéis**: o mesmo mecanismo (`jsonwebtoken`) assina tokens
  diferentes para cliente (`signToken`) e admin (`signAdminToken`, com `role: "admin"` no
  payload). `requireAuth` rejeita tokens de admin e vice-versa, isolando os dois domínios de
  acesso mesmo compartilhando o segredo (`JWT_SECRET`).
- **Hash de senha com bcrypt**: a senha do admin nunca é guardada em texto puro —
  `bcrypt.hash` no seed, `bcrypt.compare` no login.
- **Async error handling**: `asyncHandler` envolve cada handler assíncrono e encaminha
  exceções para o middleware de erro do Express (`app.use((err, req, res, next) => ...)`),
  evitando `try/catch` repetido em toda rota.
- **Pool de conexões (mysql2/promise)**: `db.all/get/run` em `db/database.js` é uma camada de
  compatibilidade fina sobre o pool, mantendo a mesma API que o projeto usava antes com
  SQLite (facilita ler o código, já que toda query segue `db.get(sql, params)`).
- **Migração leve por `IF NOT EXISTS`/try-catch**: `initDatabase()` roda `CREATE TABLE IF NOT
  EXISTS` sempre e tenta um `ALTER TABLE` idempotente (ignorando erro de coluna duplicada) —
  substitui um sistema de migrations formal, adequado ao porte do projeto.
- **Upload de arquivos com multer**: fotos de pet chegam como `multipart/form-data`, são
  salvas em `backend/uploads` com nome aleatório (`uuid`) e servidas estaticamente via
  `express.static`; o front resolve a URL relativa (`/uploads/x.jpg`) para absoluta com
  `resolveAssetUrl`, pois a API pode estar em origem diferente do frontend estático.
- **Route guard no frontend sem framework**: `frontend/js/guard.js` reproduz o papel de um
  `ProtectedRoute`/`AuthProvider` de SPA — cada página protegida chama `requireAuth()` no
  topo do script, que valida o token contra `GET /api/auth/me` antes de renderizar.
- **Token em `localStorage`, estado de navegação em `sessionStorage`**: o JWT persiste entre
  sessões do navegador; dados temporários do fluxo de agendamento (serviço escolhido) ficam em `sessionStorage` e são limpos no `logout()`.
- **Detecção de conflito de horário**: `POST /api/appointments` confere se já existe um
  agendamento não cancelado para o mesmo serviço/data/hora antes de criar (evita overbooking
  em corrida de requisições simultâneas, checando no próprio `INSERT`).
- **Regra de negócio simples para slots**: `GET /api/services/:id/slots` gera uma grade fixa
  (08:00–18:00, a cada 30min) e marca como indisponível o que já está ocupado, em vez de um
  sistema de agenda configurável — dimensionado para o escopo do TCC.
- **Sem build step no frontend**: HTML/CSS/JS puro, uma página por tela, importado via
  `<script type="module">`; `frontend/js/config.js` resolve a URL da API dinamicamente a
  partir do host que serviu a página, o que permite testar tanto em `localhost` quanto pelo
  IP da máquina na rede (ex. celular na mesma Wi-Fi), sem variável de ambiente de build.

## Variáveis de ambiente (backend/.env)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_HOST` | sim | Host do MySQL |
| `DB_PORT` | não (padrão 3306) | Porta do MySQL |
| `DB_USER` | sim | Usuário do MySQL |
| `DB_PASSWORD` | sim | Senha do MySQL |
| `DB_NAME` | sim | Nome do banco |
| `PORT` | não (padrão 3333) | Porta em que a API sobe |
| `JWT_SECRET` | sim | Segredo privado aleatório de pelo menos 32 bytes. A API rejeita configuração ausente/curta e o segredo público antigo. Trocar o segredo invalida sessões anteriores. |
| `ADMIN_DEFAULT_PASSWORD` | não (padrão `admin123`) | Senha do admin criado pelo seed, se ainda não existir nenhum admin |

## Login do cliente

Não há código de verificação: o cliente informa nome e telefone e `POST /api/auth/login`
entra na conta (ou cria uma nova) e devolve o JWT. Atenção: sem verificação, quem souber o
telefone de alguém consegue entrar na conta dele — adequado para desenvolvimento/TCC, mas
reintroduza uma verificação (SMS/WhatsApp) antes de uso real.

## Principais endpoints da API

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | — | Loga/cria usuário pelo telefone, devolve JWT |
| GET/PATCH | `/api/auth/me` | cliente | Perfil do usuário logado |
| GET/POST | `/api/pets` | cliente | Lista/cria pets (com foto) |
| PUT/DELETE | `/api/pets/:id` | cliente | Edita/arquiva pet; preserva atendimentos e histórico financeiro |
| GET/POST | `/api/pets/:petId/vaccines` | cliente | Vacinas de um pet |
| PATCH/DELETE | `/api/vaccines/:id` | cliente | Edita/remove vacina |
| GET | `/api/services` | — | Catálogo de serviços |
| GET | `/api/services/:id/slots?date=` | — | Horários disponíveis no dia |
| GET/POST/DELETE | `/api/addresses` | cliente | Endereços do cliente |
| GET/POST | `/api/appointments` | cliente | Lista/cria agendamentos |
| PATCH | `/api/appointments/:id/cancel` | cliente | Cancela agendamento |
| POST | `/api/admin/auth/login` | — | Login do admin, devolve JWT com `role: admin` |
| GET | `/api/admin/auth/me` | admin | Perfil do admin logado |
| GET | `/api/admin/appointments`, `/today`, `/calendar` | admin | Agenda do pet shop |
| GET | `/api/admin/clients`, `/clients/pending` | admin | Lista de clientes / pendentes de aprovação |
| PATCH | `/api/admin/clients/:id/status` | admin | Aprova/reprova cliente |
| GET | `/api/admin/analytics` | admin | Métricas dos últimos 12 meses (demanda, receita, etc.) |

## Pacotes de banho e pagamento presencial

O aplicativo registra estimativas e a forma de pagamento prevista na loja. Não processa cobranças nem confirma recebimentos.

Cada pet pode ter apenas um atendimento em andamento: qualquer registro `em_analise` ou `agendado` bloqueia uma nova solicitação, independentemente do dia, horário, serviço ou uso de pacote. A liberação ocorre após conclusão, recusa ou cancelamento; a passagem da data, por si só, não altera o status. A seleção de pets e a ação de agendar pelo pacote ficam desabilitadas, mas a ficha continua acessível para consulta e edição. A API aplica a mesma regra na estimativa e, sob trava do pet, na criação transacional, protegendo contra outras abas e requisições simultâneas. O histórico existente é preservado.

Validação desta regra: `node evidencias_testes/qa/pet-active-booking.mjs`, na raiz do workspace, usa banco temporário, API real e Chrome. Oito grupos cobrem estados, liberação, pacote/avulso, sessões antigas, interface e doze requisições simultâneas em dias e serviços distintos. Resultados em `evidencias_testes/resultados/qa_pet_agendamento_unico.json`. Os testes de pacotes passam a simular a conclusão de cada banho antes de reservar o seguinte.

- No painel **Pacotes dos Pets** (`frontend/admin/pacotes.html`), selecione cliente/pet e plano, informe o valor combinado, busca/entrega incluídas e antecedência para cancelamento (padrão: 24 horas). Cadastre o contrato e depois clique em **Ativar por 30 dias**.
- A ativação é manual e inicia 30 dias de calendário no fuso do pet shop. A data de início está incluída e a data final armazenada é exclusiva; a interface exibe o último dia válido. Exemplo: ativação em 13/10 permite banhos até 11/11, inclusive.
- Cada contrato pertence a um único pet e ao serviço de banho escolhido, compatível com seu porte. Um pet não pode ter contratos ativos com períodos sobrepostos. Para renovar, crie outro contrato.
- São quatro créditos, com no máximo um banho por semana de segunda a domingo. Solicitações em análise já reservam crédito e semana; concluir o atendimento consome o crédito. Cancelar ou recusar libera a reserva, preservando o histórico. Requisições simultâneas são protegidas por transações e bloqueios no banco.
- Em **Meus Pacotes**, o cliente vê validade, condições e saldo. Também pode escolher atendimento avulso ao agendar. O calendário desabilita dias fora do contrato e semanas ocupadas.
- Busca e entrega são configuradas separadamente no contrato. O frete permanece R$ 15 por agendamento quando algum trajeto solicitado não está coberto. Endereço é obrigatório sempre que houver transporte, inclusive quando incluído.
- O resumo consulta `POST /api/appointments/estimate` e mostra apenas os adicionais quando o banho está coberto. Para valores maiores que zero, exige Pix, dinheiro, cartão de débito ou cartão de crédito como forma de pagamento **prevista**. Valores zero não exigem essa seleção.
- Cancelamentos de pacote pelo cliente exigem a antecedência do contrato. Fora do prazo, a interface orienta contato com a loja; o administrador pode resolver pelo detalhe do agendamento. Não há perda automática de créditos por falta ou cancelamento tardio.
- Os detalhes administrativos permitem concluir atendimentos após seu horário e cancelar agendamentos. Os relatórios mostram **Valores estimados**: o valor do contrato entra uma vez na ativação, junto aos valores avulsos/adicionais dos agendamentos confirmados/concluídos, sem repetir o preço do banho coberto. Cancelar um contrato ativado preserva esse valor histórico combinado; esses totais não representam caixa recebido.

Ao reiniciar a API, `initDatabase()` cria `package_plans`, `customer_packages` e `package_usages` e acrescenta os campos de pacote, cobertura e pagamento a `appointments`. A migração é aditiva: agendamentos existentes permanecem avulsos e sua forma de pagamento fica não informada. O seed cria planos de referência a partir dos serviços de banho; o administrador pode cadastrar planos próprios e ajustar o valor de cada contrato.

Rotas novas:

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/packages` | Cliente: seus contratos e usos |
| POST | `/api/appointments/estimate` | Cliente: estimativa sem reservar crédito |
| GET/POST | `/api/admin/packages` | Admin: consultar/cadastrar contratos |
| GET | `/api/admin/packages/options` | Admin: pets, planos e serviços |
| POST | `/api/admin/packages/plans` | Admin: cadastrar plano |
| PATCH | `/api/admin/packages/:id/status` | Admin: ativar/cancelar contrato |

Validação: `npm test` na pasta `backend` executa as regras de negócio. `node evidencias_testes/qa/packages.mjs`, a partir da raiz do workspace, testa migração, API, concorrência e jornada no Chrome com MariaDB temporário. Esse script usa os binários do XAMPP (`QA_MYSQL_BIN` permite outro diretório) e Playwright da pasta de QA, sem acessar o banco do `.env`. Resultados em `evidencias_testes/resultados/qa_pacotes.json`. As suítes antigas de agendamento devem incluir `payment_method` quando houver valor estimado e respeitar a conclusão apenas após o horário do atendimento.

## Preparação da automação de notificações pelo WhatsApp

Aprovar, recusar ou cancelar um agendamento prepara uma mensagem destinada exclusivamente à automação do WhatsApp. Conteúdo, saída e decisão são gravados na mesma transação; repetir a mesma ação não duplica a mensagem. Cancelamentos feitos pelo cliente também entram na fila. Solicitações em análise e conclusões de atendimento não geram mensagem neste módulo.

O app não possui painel de notificações, contador, leitura de mensagens ou consulta periódica de avisos. O cliente consulta a decisão abrindo ou recarregando **Meus Agendamentos**. A tela de sucesso orienta esse acompanhamento. As rotas de cliente `/api/notifications` e `/api/notifications/:id/read` foram removidas.

Na inicialização, a migração aditiva cria `notifications` (conteúdo para automação) e `notification_deliveries` (saída), sem gerar mensagens retroativas. Cada mensagem tem uma saída WhatsApp em `aguardando_integracao`, com telefone do tutor e zero tentativas. **Nenhuma mensagem é enviada ao WhatsApp nesta versão**. O campo legado `read_at`, se existir em uma base anterior, é preservado e ignorado; novas bases não criam esse campo. Mensagens antigas e seus registros não são apagados.

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/admin/notification-deliveries` | Admin: últimas 100 saídas e indicação de WhatsApp desativado |

O ponto de extensão é `backend/services/whatsapp.js`. Seu transporte permanece desativado e `send()` rejeita chamadas com `WHATSAPP_NOT_CONFIGURED`; não simula sucesso. A futura integração deve implementar o transporte, configurar credenciais no servidor, validar o telefone e a autorização de contato, definir o formato de mensagem aceito pelo provedor e adicionar um worker para processar as saídas. O worker deverá usar o ID da saída como chave de idempotência quando suportado, tratar timeout e retentativas, gravar ID externo/erro/tentativas e atualizar `sent_at` somente após confirmação de aceite pelo provedor. Entrega e leitura externas exigem confirmação própria do provedor. Não basta alterar `enabled` para ativar o envio.

Antes de ativar o canal, defina quais registros pendentes ainda são relevantes: não envie automaticamente avisos antigos de aprovação já cancelada ou de atendimentos passados. Não há worker, credenciais, chamada de API externa, lembrete antecipado ou sincronização com Google Agenda implementados. O registro preparado mantém uma cópia do telefone da decisão; políticas de retenção e atualização do contato devem integrar a ativação operacional.

Validação: `npm test` em `backend` e `node evidencias_testes/qa/notifications.mjs` na raiz. A suíte integrada usa MariaDB temporário e Chrome, sem acessar o banco do `.env` e sem enviar mensagens. Evidências atuais em `evidencias_testes/resultados/qa_whatsapp_preparacao.json` e `qa_whatsapp_sem_avisos_mobile.png`. `qa_notificacoes.json` e sua captura são registros históricos da versão anterior com avisos internos.

## Próximos passos sugeridos

- Reintroduzir verificação do telefone (SMS/WhatsApp) no login.
- Hospedar o backend (Render, Railway, Fly.io) e o frontend estático (Vercel, Netlify, GitHub
  Pages) com HTTPS.
- Migrar uploads de `backend/uploads` (disco local) para um storage externo (S3, Cloudinary)
  antes de rodar em ambiente com múltiplas instâncias/deploys efêmeros.
- Ampliar os testes automatizados para os demais fluxos do aplicativo.
- Migrations formais (ex. `node-pg-migrate`/`umzug`) caso o schema cresça além do que o
  `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` idempotente do `initDatabase()` suporta bem.
