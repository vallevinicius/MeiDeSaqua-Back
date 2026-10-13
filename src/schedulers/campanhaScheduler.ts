import cron from "node-cron";
import CampanhaReportService from "../services/CampanhaReportService";

export function iniciarCampanhaScheduler(): void {
  // Padrão: Terças e Sextas-feiras às 14:00 no horário de Brasília (America/Sao_Paulo)
  // Expressão cron: minuto 0, hora 14, qualquer dia do mês, qualquer mês, dias 2 (terça) e 5 (sexta)
  const cronExpression =
    process.env.CAMPAIGN_REPORT_CRON || "0 14 * * 2,5";

  console.log(
    `[SCHEDULER] Inicializando agendador de relatório de campanha Anzol (${cronExpression}, fuso America/Sao_Paulo)...`
  );

  cron.schedule(
    cronExpression,
    async () => {
      console.log(
        `[SCHEDULER] Executando rotina programada de envio do relatório de campanha Anzol...`
      );
      try {
        await CampanhaReportService.dispararRelatorio();
      } catch (error) {
        console.error(
          `[SCHEDULER_ERROR] Falha ao executar rotina do relatório de campanha:`,
          error
        );
      }
    },
    {
      timezone: "America/Sao_Paulo",
    }
  );
}
