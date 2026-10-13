import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import CampanhaReportService from "../services/CampanhaReportService";
import ContadorVisualizacao from "../entities/ContadorVisualizacao.entity";
import HistoricoRelatorioCampanha from "../entities/HistoricoRelatorioCampanha.entity";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { AdminController } from "../controllers/AdminController";
import * as jwt from "jsonwebtoken";

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "test_jwt_secret_key_12345";

describe("Testes Unitários: Relatório de Campanha Anzol", () => {
  before(async () => {
    await ContadorVisualizacao.sync();
    await HistoricoRelatorioCampanha.sync();
  });

  beforeEach(async () => {
    // Limpa dados de teste
    await ContadorVisualizacao.destroy({
      where: {
        identificador: [
          "REDIRECIONAMENTO_ANZOL_MEI",
          "CAT_REDIRECIONAMENTO_ANZOL_MEI",
          "REDIRECIONAMENTO_ANZOL_USUARIO",
          "CAT_REDIRECIONAMENTO_ANZOL_USUARIO",
        ],
      },
    });
    await HistoricoRelatorioCampanha.destroy({
      where: {
        tipoCampanha: "ANZOL",
      },
    });
  });

  test("Cenário 1: Primeiro relatório (sem histórico prévio) deve ter deltas iguais aos totais", async () => {
    await ContadorVisualizacao.create({
      identificador: "REDIRECIONAMENTO_ANZOL_MEI",
      visualizacoes: 42,
    });
    await ContadorVisualizacao.create({
      identificador: "REDIRECIONAMENTO_ANZOL_USUARIO",
      visualizacoes: 18,
    });

    const metricas = await CampanhaReportService.coletarMetricas();

    assert.equal(metricas.totalMei, 42);
    assert.equal(metricas.totalUsuario, 18);
    assert.equal(metricas.totalGeral, 60);
    assert.equal(metricas.deltaMei, 42);
    assert.equal(metricas.deltaUsuario, 18);
    assert.equal(metricas.deltaGeral, 60);
    assert.equal(metricas.ultimoEnvioEm, null);
  });

  test("Cenário 2: Segundo relatório com histórico anterior deve calcular a diferença exata (delta)", async () => {
    // 1. Simula envio anterior salvo no histórico
    await HistoricoRelatorioCampanha.create({
      tipoCampanha: "ANZOL",
      totalMei: 30,
      totalUsuario: 10,
      totalGeral: 40,
      deltaMei: 30,
      deltaUsuario: 10,
      deltaGeral: 40,
      destinatarios: "gestao@saquarema.rj.gov.br",
      statusEnvio: "SUCESSO",
    });

    // 2. Novos totais no banco
    await ContadorVisualizacao.create({
      identificador: "REDIRECIONAMENTO_ANZOL_MEI",
      visualizacoes: 50, // +20 cliques
    });
    await ContadorVisualizacao.create({
      identificador: "REDIRECIONAMENTO_ANZOL_USUARIO",
      visualizacoes: 15, // +5 cliques
    });

    const metricas = await CampanhaReportService.coletarMetricas();

    assert.equal(metricas.totalMei, 50);
    assert.equal(metricas.totalUsuario, 15);
    assert.equal(metricas.totalGeral, 65);
    assert.equal(metricas.deltaMei, 20); // 50 - 30 = 20
    assert.equal(metricas.deltaUsuario, 5); // 15 - 10 = 5
    assert.equal(metricas.deltaGeral, 25); // 65 - 40 = 25
    assert.notEqual(metricas.ultimoEnvioEm, null);
  });

  test("Cenário 3: Geração de HTML deve conter todos os cards, badges e rodapé institucional", () => {
    const html = CampanhaReportService.gerarHtmlRelatorio({
      totalMei: 100,
      totalUsuario: 50,
      totalGeral: 150,
      deltaMei: 12,
      deltaUsuario: 8,
      deltaGeral: 20,
      ultimoEnvioEm: new Date("2026-10-10T14:00:00Z"),
      destinatarios: ["gestao@saquarema.rj.gov.br"],
    });

    assert.match(html, /Relatório de Campanha: Anzol/);
    assert.match(html, /Cliques de MEI/);
    assert.match(html, /\+12 novos/);
    assert.match(html, /\+8 novos/);
    assert.match(html, /\+20 no período/);
    assert.match(html, /Terças e Sextas às 14:00/);
  });

  test("Cenário 4: Disparo sem destinatários configurados deve falhar de forma segura e registrar no histórico", async () => {
    const oldEmail = process.env.CAMPAIGN_REPORT_EMAIL;
    const oldAnzol = process.env.RELATORIO_ANZOL_EMAIL;
    delete process.env.CAMPAIGN_REPORT_EMAIL;
    delete process.env.RELATORIO_ANZOL_EMAIL;

    try {
      const resultado = await CampanhaReportService.dispararRelatorio();
      assert.equal(resultado.sucesso, false);
      assert.equal(resultado.destinatarios.length, 0);
      assert.match(resultado.mensagem, /Nenhum destinatário configurado/);

      const ultimoRegistro = await HistoricoRelatorioCampanha.findOne({
        order: [["createdAt", "DESC"]],
      });
      assert.notEqual(ultimoRegistro, null);
      assert.equal(ultimoRegistro?.statusEnvio, "FALHA");
    } finally {
      if (oldEmail) process.env.CAMPAIGN_REPORT_EMAIL = oldEmail;
      if (oldAnzol) process.env.RELATORIO_ANZOL_EMAIL = oldAnzol;
    }
  });

  test("Cenário 5: Rota administrativa de disparo deve bloquear requisições sem autenticação (401)", async () => {
    let statusCode = 0;
    let nextCalled = false;

    const req: any = { headers: {} };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: () => {} };
      },
    };
    const next = () => {
      nextCalled = true;
    };

    adminAuthMiddleware(req, res, next);

    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
  });
});
