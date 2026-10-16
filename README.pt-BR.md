<div align="center">

# MEI de Saquá — API

**API REST do portal MEI de Saquá, que divulga os microempreendedores (MEIs) de Saquarema.**

🇺🇸 [Read in English](README.md)

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Sequelize](https://img.shields.io/badge/Sequelize-6-52B0E7?logo=sequelize&logoColor=white) ![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)

</div>

## Sobre

Backend de um portal público feito para a Prefeitura de Saquarema. Donos de negócio criam conta, cadastram o estabelecimento e aguardam aprovação do admin; visitantes navegam por categoria, buscam e avaliam. Admins moderam cadastros e comentários, gerenciam cursos oferecidos aos MEIs e recebem relatórios de campanha agendados por e-mail.

O front-end está em [MeideSaqua-Front](https://github.com/vallevinicius/MeideSaqua-Front).

## Funcionalidades

- Cadastro com confirmação por e-mail, login, refresh e logout, redefinição de senha e troca de e-mail
- Cadastro de estabelecimento com upload de imagens (comprimidas com `sharp`) e fluxo de aprovação
- Avaliações, cursos e busca por categoria
- Autenticação de admin separada, com segredo e duração de sessão próprios
- Relatório de campanha agendado e enviado por e-mail (`node-cron`)

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js, Express 5, TypeScript |
| Dados | MySQL + Sequelize |
| Autenticação | JWT (HS256) in httpOnly cookie or `Authorization` header, `bcryptjs` |
| Proteção | `helmet`, `express-rate-limit`, CORS allowlist |
| Arquivos | `multer` + `sharp` |
| Jobs / e-mail | `node-cron`, Nodemailer |
| Testes | Vitest + Supertest, `node:test` |

## Arquitetura

MVC em camadas: `routes → controllers → services → entities (models Sequelize)`.
```
src/
  routes/        auth, usuários, estabelecimentos, avaliações, cursos, arquivos, admin
  controllers/   camada HTTP: lê a requisição, chama o service, mapeia erros
  services/      regras de negócio
  entities/      models Sequelize
  middlewares/   auth, auth de admin, rate limiting
  schedulers/    jobs agendados (relatório de campanha)
  serializers/   formatação das respostas (sem vazar campos internos)
  config/        conexão com o banco e migrações de coluna idempotentes
```
Todas as rotas ficam sob `/api` (`/api/auth`, `/api/estabelecimentos`, `/api/avaliacoes`, `/api/cursos`, `/api/files`, `/api/users`, `/api/admin`).

## Segurança

- JWT verificado com algoritmo fixo (`HS256`) e `tokenVersion` por usuário: logout ou troca de senha revogam tokens antigos
- Requisições autenticadas por cookie que alteram estado precisam vir de origem permitida (proteção CSRF)
- Rate limiting global e por rota, headers do `helmet`, CORS restrito a `CORS_ORIGINS`
- IP do cliente ciente de proxy (`TRUST_PROXY_HOPS`)

## Como rodar

**Pré-requisitos:** Node.js 20+, MySQL 8

```bash
npm install
# crie um arquivo .env com as variáveis abaixo (ele é ignorado pelo git)
npm run dev        # http://localhost:3000 (ou PORT)
```
As tabelas são criadas/atualizadas na inicialização; colunas novas entram por migrações idempotentes em `src/config/migracoes.ts`.

### Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta HTTP (padrão 3000) |
| `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD` | Conexão MySQL |
| `JWT_SECRET` | Segredo dos tokens de usuário |
| `ADMIN_USER / ADMIN_PASSWORD / ADMIN_JWT_SECRET / ADMIN_SESSION_HOURS` | Credenciais do admin, segredo do token e duração da sessão |
| `CORS_ORIGINS / FRONTEND_URL / APP_URL` | Origens permitidas e URLs usadas nos e-mails |
| `COOKIE_DOMAIN / COOKIE_SECURE / COOKIE_SAMESITE` | Atributos do cookie de sessão |
| `TRUST_PROXY_HOPS` | Proxies reversos na frente da API |
| `MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS` | SMTP dos e-mails transacionais |
| `CAMPAIGN_REPORT_CRON / CAMPAIGN_REPORT_EMAIL / RELATORIO_ANZOL_EMAIL` | Agendamento e destinatários dos relatórios de campanha |

### Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | API com hot reload |
| `npm run build && npm start` | Compila para `dist/` e executa |
| `npm test` | Suíte Vitest + suíte `node:test` |

## Testes

21 arquivos de teste (Vitest + Supertest e `node:test`) cobrindo auth e sessão, estabelecimentos, avaliações, cursos, upload seguro de arquivos, e-mail, serializers, migrações e relatórios de admin. Rode `npm test`.

## Equipe

- [Vinícius Diller](https://github.com/viniciusdiller)
- [Vinicius do Valle](https://github.com/vallevinicius)
- Micael Robert
