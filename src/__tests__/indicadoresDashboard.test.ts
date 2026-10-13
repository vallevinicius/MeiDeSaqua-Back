import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as jwt from "jsonwebtoken";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { AdminController } from "../controllers/AdminController";
import EstabelecimentoController from "../controllers/EstabelecimentoController";
import ContadorVisualizacao from "../entities/ContadorVisualizacao.entity";
import ContadorVisualizacaoDiario from "../entities/ContadorVisualizacaoDiario.entity";

process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "test_secret_key_1234567890";

describe("Matriz de Roles e Permissões (RBAC) - Painel Admin", () => {
  test("Deve bloquear requisição sem token com status 401", () => {
    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const req: any = { headers: {} };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };
    const next = () => {
      nextCalled = true;
    };

    adminAuthMiddleware(req, res, next);

    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
    assert.match(jsonBody?.message || "", /Token não fornecido/);
  });

  test("Deve bloquear token inválido ou adulterado com status 401", () => {
    let statusCode = 0;
    let nextCalled = false;

    const req: any = { headers: { authorization: "Bearer token_totalmente_invalido" } };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: () => {},
        };
      },
    };
    const next = () => {
      nextCalled = true;
    };

    adminAuthMiddleware(req, res, next);

    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
  });

  test("Deve bloquear usuário comum (role != admin) com status 403 (Privilege Escalation Prevention)", () => {
    let statusCode = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const userToken = jwt.sign(
      { userId: 123, role: "user" },
      process.env.ADMIN_JWT_SECRET as string
    );

    const req: any = { headers: { authorization: `Bearer ${userToken}` } };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };
    const next = () => {
      nextCalled = true;
    };

    adminAuthMiddleware(req, res, next);

    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
    assert.match(jsonBody?.message || "", /Permissão insuficiente/);
  });

  test("Deve permitir acesso com status 200/next para role admin legítima", () => {
    let nextCalled = false;

    const adminToken = jwt.sign(
      { username: "admin", role: "admin" },
      process.env.ADMIN_JWT_SECRET as string
    );

    const req: any = { headers: { authorization: `Bearer ${adminToken}` } };
    const res: any = {
      status: () => res,
      json: () => {},
    };
    const next = () => {
      nextCalled = true;
    };

    adminAuthMiddleware(req, res, next);

    assert.equal(nextCalled, true);
  });
});

describe("Validação de Boundaries e Periodização - getDashboardStats", () => {
  test("Deve rejeitar quando apenas startDate for fornecido sem endDate", async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = { query: { startDate: "2026-10-01" } };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await AdminController.getDashboardStats(req, res);

    assert.equal(statusCode, 400);
    assert.match(jsonBody?.message || "", /fornecidas juntas/);
  });

  test("Deve rejeitar formato de data inválido fora do padrão ISO AAAA-MM-DD", async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = {
      query: { startDate: "01/10/2026", endDate: "13/10/2026" },
    };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await AdminController.getDashboardStats(req, res);

    assert.equal(statusCode, 400);
    assert.match(jsonBody?.message || "", /Formato de data inválido/);
  });

  test("Deve rejeitar quando startDate for maior que endDate", async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = {
      query: { startDate: "2026-10-20", endDate: "2026-10-10" },
    };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    await AdminController.getDashboardStats(req, res);

    assert.equal(statusCode, 400);
    assert.match(jsonBody?.message || "", /superior à data final/);
  });
});
