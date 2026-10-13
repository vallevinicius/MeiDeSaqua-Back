import { Op } from "sequelize";
import ContadorVisualizacao from "../entities/ContadorVisualizacao.entity";
import HistoricoRelatorioCampanha from "../entities/HistoricoRelatorioCampanha.entity";
import EmailService from "../utils/EmailService";

export interface CampanhaReportMetrics {
  totalHome: number;
  totalOrganico: number;
  totalMei: number;
  totalUsuario: number;
  totalGeral: number;
  deltaHome: number;
  deltaOrganico: number;
  deltaMei: number;
  deltaUsuario: number;
  deltaGeral: number;
  ultimoEnvioEm: Date | null;
  destinatarios: string[];
}

export class CampanhaReportService {
  constructor() {}

  public getDestinatarios(): string[] {
    const raw =
      process.env.CAMPAIGN_REPORT_EMAIL ||
      process.env.RELATORIO_ANZOL_EMAIL ||
      "";

    return raw
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  public async coletarMetricas(): Promise<CampanhaReportMetrics> {
    const contadores = await ContadorVisualizacao.findAll({
      where: {
        identificador: {
          [Op.in]: [
            "HOME",
            "REDIRECIONAMENTO_ANZOL_MEI",
            "CAT_REDIRECIONAMENTO_ANZOL_MEI",
            "REDIRECIONAMENTO_ANZOL_USUARIO",
            "CAT_REDIRECIONAMENTO_ANZOL_USUARIO",
          ],
        },
      },
    });

    let totalHome = 0;
    let totalMei = 0;
    let totalUsuario = 0;

    for (const c of contadores) {
      if (c.identificador === "HOME") {
        totalHome += c.visualizacoes;
      } else if (
        c.identificador === "REDIRECIONAMENTO_ANZOL_MEI" ||
        c.identificador === "CAT_REDIRECIONAMENTO_ANZOL_MEI"
      ) {
        totalMei += c.visualizacoes;
      } else if (
        c.identificador === "REDIRECIONAMENTO_ANZOL_USUARIO" ||
        c.identificador === "CAT_REDIRECIONAMENTO_ANZOL_USUARIO"
      ) {
        totalUsuario += c.visualizacoes;
      }
    }

    const totalGeral = totalMei + totalUsuario;
    const totalOrganico = Math.max(0, totalHome - totalGeral);

    const ultimoEnvio = await HistoricoRelatorioCampanha.findOne({
      where: {
        tipoCampanha: "ANZOL",
        statusEnvio: "SUCESSO",
      },
      order: [["createdAt", "DESC"]],
    });

    let deltaHome = totalHome;
    let deltaOrganico = totalOrganico;
    let deltaMei = totalMei;
    let deltaUsuario = totalUsuario;
    let deltaGeral = totalGeral;
    let ultimoEnvioEm: Date | null = null;

    if (ultimoEnvio) {
      deltaHome = Math.max(0, totalHome - (ultimoEnvio.totalHome || 0));
      deltaOrganico = Math.max(0, totalOrganico - (ultimoEnvio.totalOrganico || 0));
      deltaMei = Math.max(0, totalMei - ultimoEnvio.totalMei);
      deltaUsuario = Math.max(0, totalUsuario - ultimoEnvio.totalUsuario);
      deltaGeral = Math.max(0, totalGeral - ultimoEnvio.totalGeral);
      ultimoEnvioEm = ultimoEnvio.createdAt;
    }

    return {
      totalHome,
      totalOrganico,
      totalMei,
      totalUsuario,
      totalGeral,
      deltaHome,
      deltaOrganico,
      deltaMei,
      deltaUsuario,
      deltaGeral,
      ultimoEnvioEm,
      destinatarios: this.getDestinatarios(),
    };
  }

  public gerarHtmlRelatorio(metricas: CampanhaReportMetrics): string {
    const dataHoraFormatada = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    const ultimoEnvioFormatado = metricas.ultimoEnvioEm
      ? new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(metricas.ultimoEnvioEm)
      : null;

    const subtituloComparacao = ultimoEnvioFormatado
      ? `Novos acessos comparados ao relatório anterior de <strong>${ultimoEnvioFormatado}</strong>`
      : "Primeiro relatório registrado — exibindo números acumulados da plataforma.";

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Métricas de Acessos e Campanha Anzol - MeideSaquá</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .container { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { background: #0284c7; padding: 24px 32px; text-align: center; }
          .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
          .header p { color: #e0f2fe; margin: 6px 0 0; font-size: 13px; }
          .body { padding: 32px; }
          .intro { font-size: 14px; color: #475569; margin-bottom: 24px; line-height: 1.5; }
          .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e2e8f0; }
          .section-title:first-of-type { margin-top: 0; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; }
          .card-title { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
          .card-value { font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 4px; display: inline-block; }
          .badge { display: inline-block; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 700; padding: 3px 8px; border-radius: 12px; margin-left: 8px; vertical-align: middle; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-purple { background: #f3e8ff; color: #6b21a8; }
          .card-destaque { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
          .card-destaque .card-title { color: #166534; }
          .card-destaque .card-value { color: #14532d; }
          .card-total { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; margin-top: 12px; }
          .card-total .card-title { color: #1d4ed8; }
          .card-total .card-value { color: #1e40af; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Relatório de Desempenho e Campanha</h1>
            <p>Portal MeideSaquá • ${dataHoraFormatada}</p>
          </div>
          <div class="body">
            <p class="intro">
              ${subtituloComparacao}
            </p>

            <!-- SEÇÃO 1: PÁGINA INICIAL (HOME) -->
            <div class="section-title">📊 Desempenho da Página Inicial (HOME)</div>

            <div class="card-total">
              <div class="card-title">Total de Visualizações da Home</div>
              <div>
                <span class="card-value">${metricas.totalHome.toLocaleString("pt-BR")}</span>
                <span class="badge badge-blue">+${metricas.deltaHome.toLocaleString("pt-BR")} novos</span>
              </div>
            </div>

            <div class="card-destaque">
              <div class="card-title">Acessos Orgânicos (Direto / Busca)</div>
              <div>
                <span class="card-value">${metricas.totalOrganico.toLocaleString("pt-BR")}</span>
                <span class="badge">+${metricas.deltaOrganico.toLocaleString("pt-BR")} novos</span>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Acessos via Campanha Anzol</div>
              <div>
                <span class="card-value">${metricas.totalGeral.toLocaleString("pt-BR")}</span>
                <span class="badge badge-purple">+${metricas.deltaGeral.toLocaleString("pt-BR")} no período</span>
              </div>
            </div>

            <!-- SEÇÃO 2: CAMPANHA ANZOL DETALHADA -->
            <div class="section-title">🎯 Detalhamento da Campanha Anzol</div>

            <div class="card">
              <div class="card-title">Cliques de MEI (Empreendedores)</div>
              <div>
                <span class="card-value">${metricas.totalMei.toLocaleString("pt-BR")}</span>
                <span class="badge">+${metricas.deltaMei.toLocaleString("pt-BR")} novos</span>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Cliques de Cidadão / Usuário</div>
              <div>
                <span class="card-value">${metricas.totalUsuario.toLocaleString("pt-BR")}</span>
                <span class="badge">+${metricas.deltaUsuario.toLocaleString("pt-BR")} novos</span>
              </div>
            </div>
          </div>
          <div class="footer">
            Disparo programado (Terças e Sextas às 14:00).<br>
            Secretaria Municipal de Governança, Estratégia e Transparência — Prefeitura de Saquarema.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  public async dispararRelatorio(): Promise<{
    sucesso: boolean;
    destinatarios: string[];
    metricas: CampanhaReportMetrics;
    mensagem: string;
  }> {
    const metricas = await this.coletarMetricas();

    if (metricas.destinatarios.length === 0) {
      const msgErro =
        "Nenhum destinatário configurado. Defina CAMPAIGN_REPORT_EMAIL no arquivo .env.";
      console.warn(`[RELATORIO_ANZOL] ${msgErro}`);

      await HistoricoRelatorioCampanha.create({
        tipoCampanha: "ANZOL",
        totalHome: metricas.totalHome,
        deltaHome: metricas.deltaHome,
        totalOrganico: metricas.totalOrganico,
        deltaOrganico: metricas.deltaOrganico,
        totalMei: metricas.totalMei,
        totalUsuario: metricas.totalUsuario,
        totalGeral: metricas.totalGeral,
        deltaMei: metricas.deltaMei,
        deltaUsuario: metricas.deltaUsuario,
        deltaGeral: metricas.deltaGeral,
        destinatarios: "(nenhum)",
        statusEnvio: "FALHA",
        erro: msgErro,
      });

      return {
        sucesso: false,
        destinatarios: [],
        metricas,
        mensagem: msgErro,
      };
    }

    const html = this.gerarHtmlRelatorio(metricas);
    const subject = `[MeideSaquá] Métricas: ${metricas.totalHome} na Home (${metricas.totalOrganico} orgânicos / ${metricas.totalGeral} Anzol)`;

    try {
      for (const dest of metricas.destinatarios) {
        await EmailService.sendGenericEmail({
          to: dest,
          subject,
          html,
        });
      }

      await HistoricoRelatorioCampanha.create({
        tipoCampanha: "ANZOL",
        totalHome: metricas.totalHome,
        deltaHome: metricas.deltaHome,
        totalOrganico: metricas.totalOrganico,
        deltaOrganico: metricas.deltaOrganico,
        totalMei: metricas.totalMei,
        totalUsuario: metricas.totalUsuario,
        totalGeral: metricas.totalGeral,
        deltaMei: metricas.deltaMei,
        deltaUsuario: metricas.deltaUsuario,
        deltaGeral: metricas.deltaGeral,
        destinatarios: metricas.destinatarios.join(", "),
        statusEnvio: "SUCESSO",
        erro: null,
      });

      console.log(
        `[RELATORIO_ANZOL] Relatório enviado com sucesso para: ${metricas.destinatarios.join(", ")}`
      );

      return {
        sucesso: true,
        destinatarios: metricas.destinatarios,
        metricas,
        mensagem: "Relatório de campanha enviado com sucesso.",
      };
    } catch (err: any) {
      const erroMsg = err?.message || String(err);
      console.error("[RELATORIO_ANZOL] Erro ao enviar relatório por e-mail:", erroMsg);

      await HistoricoRelatorioCampanha.create({
        tipoCampanha: "ANZOL",
        totalHome: metricas.totalHome,
        deltaHome: metricas.deltaHome,
        totalOrganico: metricas.totalOrganico,
        deltaOrganico: metricas.deltaOrganico,
        totalMei: metricas.totalMei,
        totalUsuario: metricas.totalUsuario,
        totalGeral: metricas.totalGeral,
        deltaMei: metricas.deltaMei,
        deltaUsuario: metricas.deltaUsuario,
        deltaGeral: metricas.deltaGeral,
        destinatarios: metricas.destinatarios.join(", "),
        statusEnvio: "FALHA",
        erro: erroMsg,
      });

      throw new Error(`Falha no envio de e-mail do relatório: ${erroMsg}`);
    }
  }
}

export default new CampanhaReportService();
