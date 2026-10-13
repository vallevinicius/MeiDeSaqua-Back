import axios from "axios";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FileStorageService from "../src/utils/FileStorageService";
import ProfanityFilter from "../src/utils/ProfanityFilter";
import { resolverArquivo } from "../src/utils/privateFiles";
import { sanitizeFilename } from "../src/utils/stringUtils";
import { containsEmoji } from "../src/utils/ValidationEmoji";
import { limparUploads, pngReal } from "./helpers";

describe("ProfanityFilter", () => {
  it.each(["merda", "MERDA", "isso é uma merda!", "puta que pariu"])(
    "detecta '%s'",
    (texto) => {
      expect(ProfanityFilter.contemPalavrao(texto)).toBe(true);
    },
  );

  it.each(["Ótimo atendimento", "Excelente produto", "Classe A", "Computador", "", "   "])(
    "não bloqueia '%s'",
    (texto) => {
      expect(ProfanityFilter.contemPalavrao(texto)).toBe(false);
    },
  );

  it("detecta palavrão com acentos e maiúsculas misturadas", () => {
    expect(ProfanityFilter.contemPalavrao("CaRaLhO")).toBe(true);
  });

  it("é consistente em chamadas repetidas", () => {
    for (let i = 0; i < 5; i++) expect(ProfanityFilter.contemPalavrao("merda")).toBe(true);
  });
});

describe("containsEmoji", () => {
  it.each(["😀", "oi 🚀", "ok ❤", "☀ dia"])("detecta emoji em '%s'", (t) => {
    expect(containsEmoji(t)).toBe(true);
  });
  it.each(["texto comum", "acentuação çãé", "", "123 !?#"])("não detecta em '%s'", (t) => {
    expect(containsEmoji(t)).toBe(false);
  });
});

describe("sanitizeFilename", () => {
  it.each([
    ["Gastronomia e Alimentação", "gastronomia_e_alimenta__o"],
    ["../../etc", "______etc"],
    ["A/B\\C", "a_b_c"],
    ["", ""],
  ])("'%s' -> '%s'", (entrada, esperado) => {
    expect(sanitizeFilename(entrada)).toBe(esperado);
  });

  it("nunca produz separador de caminho", () => {
    expect(sanitizeFilename("a/../b\\..\\c")).not.toMatch(/[\\/.]/);
  });
});

describe("resolverArquivo (anti path traversal)", () => {
  it.each([
    "uploads/a/b.webp",
    "/uploads/a/b.webp",
    "uploads-privados/a/b.pdf",
  ])("aceita %s", (caminho) => {
    expect(resolverArquivo(caminho)).toBe(path.resolve(caminho.replace(/^\//, "")));
  });

  it.each([
    "../fora.pdf",
    "uploads/../../fora.pdf",
    "uploads-privados/../../etc/passwd",
    "/etc/passwd",
    "package.json",
    "uploads",
    "uploads-outro/a.pdf",
    "",
  ])("recusa %s", (caminho) => {
    expect(resolverArquivo(caminho)).toBeNull();
  });
});

describe("FileStorageService", () => {
  beforeEach(limparUploads);

  it("save devolve a URL pública do arquivo e cria a pasta", async () => {
    const url = await FileStorageService.save({ filename: "abc.webp" } as any);
    expect(url).toBe("/uploads/abc.webp");
    expect(fs.existsSync(path.resolve("uploads"))).toBe(true);
  });

  it("saveBase64 grava imagem e devolve URL com APP_URL", async () => {
    process.env.APP_URL = "http://api.teste";
    const base64 = `data:image/png;base64,${(await pngReal()).toString("base64")}`;
    const url = await FileStorageService.saveBase64(base64);
    expect(url).toMatch(/^http:\/\/api\.teste\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(fs.readdirSync("uploads")).toHaveLength(1);
  });

  it("saveBase64 vazio devolve null e formato inválido lança erro", async () => {
    expect(await FileStorageService.saveBase64("")).toBeNull();
    await expect(FileStorageService.saveBase64("isso não é base64")).rejects.toThrow(/inválido/);
    await expect(FileStorageService.saveBase64("data:text/html;base64,PHNjcmlwdD4=")).rejects.toThrow(/inválido/);
  });

  it("deleteFolder remove a pasta pública e a privada do estabelecimento", async () => {
    fs.mkdirSync("uploads/gastronomia/loja", { recursive: true });
    fs.mkdirSync("uploads-privados/gastronomia/loja", { recursive: true });
    fs.mkdirSync("uploads/gastronomia/outra", { recursive: true });
    await FileStorageService.deleteFolder("Gastronomia", "Loja");
    expect(fs.existsSync("uploads/gastronomia/loja")).toBe(false);
    expect(fs.existsSync("uploads-privados/gastronomia/loja")).toBe(false);
    expect(fs.existsSync("uploads/gastronomia/outra")).toBe(true);
  });

  it("deleteFolder não escapa da pasta com nomes maliciosos", async () => {
    fs.mkdirSync("uploads/seguro", { recursive: true });
    fs.writeFileSync("uploads/seguro/a.txt", "x");
    await FileStorageService.deleteFolder("..", "..");
    expect(fs.existsSync("uploads/seguro/a.txt")).toBe(true);
  });
});

describe("CnpjService (consulta externa simulada)", () => {
  afterEach(() => vi.restoreAllMocks());

  const carregar = async () => {
    const real = await vi.importActual<typeof import("../src/services/CnpjService")>("../src/services/CnpjService");
    return real.default;
  };

  it("usa a BrasilAPI e limpa a máscara do CNPJ", async () => {
    const get = vi.spyOn(axios, "get").mockResolvedValue({ data: { municipio: "SAQUAREMA", opcao_pelo_mei: true } });
    const dados = await (await carregar()).consultarCnpj("12.345.678/0001-90");
    expect(get).toHaveBeenCalledWith("https://brasilapi.com.br/api/cnpj/v1/12345678000190");
    expect(dados.opcao_pelo_mei).toBe(true);
  });

  it("cai para o CNPJ.ws e converte o formato", async () => {
    vi.spyOn(axios, "get")
      .mockRejectedValueOnce(new Error("fora do ar"))
      .mockResolvedValueOnce({
        data: {
          simples: { mei: "S" },
          porte: { descricao: "Micro Empresa", id: "01" },
          estabelecimento: { cidade: { nome: "Saquarema" }, estado: { sigla: "RJ" }, situacao_cadastral: "Ativa" },
        },
      });
    const dados = await (await carregar()).consultarCnpj("12345678000190");
    expect(dados).toEqual({
      municipio: "Saquarema",
      uf: "RJ",
      situacao_cadastral: "ATIVA",
      porte: "Micro Empresa",
      opcao_pelo_mei: true,
    });
  });

  it("infere MEI por natureza 2135 e porte 01 quando o Simples vem nulo", async () => {
    vi.spyOn(axios, "get")
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({
        data: { simples: null, natureza_juridica: { id: 2135 }, porte: { id: "01", descricao: "ME" }, estabelecimento: {} },
      });
    const dados = await (await carregar()).consultarCnpj("1");
    expect(dados.opcao_pelo_mei).toBe(true);
    expect(dados.situacao_cadastral).toBe("DESCONHECIDA");
  });

  it("não infere MEI para outra natureza jurídica", async () => {
    vi.spyOn(axios, "get")
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({
        data: { simples: null, natureza_juridica: { id: 2062 }, porte: { id: "03" }, estabelecimento: {} },
      });
    const dados = await (await carregar()).consultarCnpj("1");
    expect(dados.opcao_pelo_mei).toBe(false);
  });

  it.each([
    [429, /Aguarde 1 minuto/],
    [404, /não encontrado em nenhuma base/],
    [500, /Erro de conexão/],
  ])("quando as duas bases falham com status %s devolve mensagem clara", async (status, mensagem) => {
    const erro = Object.assign(new Error("falha"), { isAxiosError: true, response: { status } });
    vi.spyOn(axios, "get").mockRejectedValue(erro);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    await expect((await carregar()).consultarCnpj("1")).rejects.toThrow(mensagem);
  });
});
