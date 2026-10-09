import nodemailer from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter;

  constructor() {
    const port = Number(process.env.MAIL_PORT);
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      // Porta 465 usa TLS implícito (SMTPS). 587/25 iniciam em texto puro e
      // fazem STARTTLS. Usar secure:false na 465 causa "Greeting never received".
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  /**
   * Verifica a conexão/credenciais SMTP. Não lança: apenas loga, para o servidor
   * subir mesmo com o e-mail indisponível e falhar de forma visível cedo.
   */
  public async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      console.log("Conexão SMTP verificada com sucesso.");
    } catch (err: any) {
      console.error(
        "SMTP indisponível - envio de e-mails vai falhar:",
        err?.message ?? err
      );
    }
  }

  public async sendConfirmationEmail(to: string, token: string): Promise<void> {
    const confirmationUrl = `https://meidesaqua.saquarema.rj.gov.br/confirmar-conta?token=${token}`;
    const message = {
      from: `"Meidesaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Confirmação de Cadastro - Meidesaqua",
      html: `Obrigado por se cadastrar! Por favor, clique no link abaixo para ativar sua conta:<br><br>
                   <a href="${confirmationUrl}">${confirmationUrl}</a><br><br>
                   Se você não se cadastrou em nosso site, por favor ignore este e-mail.`,
    };
    await this.transporter.sendMail(message);
  }

  public async sendPasswordResetEmail(
    to: string,
    token: string
  ): Promise<void> {
    const resetUrl = `https://meidesaqua.saquarema.rj.gov.br/redefinir-senha?token=${token}`;
    const message = {
      from: `"Meidesaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Redefinição de Senha - Meidesaqua",
      html: `Recebemos um pedido para redefinir a senha da sua conta.<br><br>
                   Por favor, clique no link abaixo para criar uma nova senha:<br>
                   <a href="${resetUrl}">${resetUrl}</a><br><br>
                   Se você não solicitou esta alteração, por favor ignore este e-mail.`,
    };
    await this.transporter.sendMail(message);
  }

  public async sendEmailChangeConfirmationEmail(
    to: string,
    token: string
  ): Promise<void> {
    const confirmationUrl = `https://meidesaqua.saquarema.rj.gov.br/confirmar-novo-email?token=${token}`;
    const message = {
      from: `"Meidesaqua" <${process.env.MAIL_USER}>`,
      to: to,
      subject: "Confirmação de Alteração de E-mail - Meidesaqua",
      html: `Recebemos um pedido para alterar o e-mail da sua conta para este endereço.<br><br>
                   Por favor, clique no link abaixo para confirmar a alteração:<br>
                   <a href="${confirmationUrl}">${confirmationUrl}</a><br><br>
                   Se você não solicitou esta alteração, por favor ignore este e-mail.`,
    };
    await this.transporter.sendMail(message);
  }

  public async sendGenericEmail(options: EmailOptions): Promise<void> {
    const message = {
      from: `"MeideSaquá" <${process.env.MAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    };
    await this.transporter.sendMail(message);
  }
}

export default new EmailService();
