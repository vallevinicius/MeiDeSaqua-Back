import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const verify = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, verify }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

const carregar = async (porta = "587") => {
  vi.resetModules();
  process.env.MAIL_PORT = porta;
  process.env.MAIL_USER = "no-reply@teste.com";
  process.env.MAIL_HOST = "smtp.teste";
  const real = await vi.importActual<typeof import("../src/utils/EmailService")>("../src/utils/EmailService");
  return real.default;
};

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue(undefined);
  verify.mockReset().mockResolvedValue(true);
  createTransport.mockClear();
});

describe("EmailService (SMTP simulado)", () => {
  it("porta 465 usa TLS implícito; 587 não", async () => {
    await carregar("465");
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true, port: 465 }));
    await carregar("587");
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: false, port: 587 }));
  });

  it("e-mail de confirmação leva o link com o token", async () => {
    const email = await carregar();
    await email.sendConfirmationEmail("a@b.com", "tok123");
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe("a@b.com");
    expect(msg.html).toContain("/confirmar-conta?token=tok123");
    expect(msg.from).toContain("no-reply@teste.com");
  });

  it("e-mail de redefinição de senha leva o link com o token", async () => {
    const email = await carregar();
    await email.sendPasswordResetEmail("a@b.com", "rst");
    expect(sendMail.mock.calls[0][0].html).toContain("/redefinir-senha?token=rst");
  });

  it("e-mail de troca de endereço leva o link com o token", async () => {
    const email = await carregar();
    await email.sendEmailChangeConfirmationEmail("novo@b.com", "chg");
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe("novo@b.com");
    expect(msg.html).toContain("/confirmar-novo-email?token=chg");
  });

  it("e-mail genérico repassa destinatário, assunto e corpo", async () => {
    const email = await carregar();
    await email.sendGenericEmail({ to: "x@y.com", subject: "Assunto", html: "<p>oi</p>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "x@y.com", subject: "Assunto", html: "<p>oi</p>" }),
    );
  });

  it("falha do SMTP é propagada ao chamador", async () => {
    const email = await carregar();
    sendMail.mockRejectedValue(new Error("SMTP caiu"));
    await expect(email.sendGenericEmail({ to: "x@y.com", subject: "s", html: "h" })).rejects.toThrow("SMTP caiu");
  });

  it("verifyConnection nunca lança, mesmo com SMTP fora do ar", async () => {
    const email = await carregar();
    await expect(email.verifyConnection()).resolves.toBeUndefined();
    verify.mockRejectedValue(new Error("sem rede"));
    await expect(email.verifyConnection()).resolves.toBeUndefined();
  });
});
