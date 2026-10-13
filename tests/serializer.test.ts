import { describe, expect, it } from "vitest";
import { CAMPOS_VITRINE } from "../src/serializers/estabelecimento.serializer";

describe("campos da vitrine pública", () => {
  it.each([
    "cpfResponsavel",
    "cnpj",
    "emailEstabelecimento",
    "nomeResponsavel",
    "ccmeiUrl",
    "usuarioId",
    "dados_atualizacao",
  ])("não inclui %s", (campo) => {
    expect(CAMPOS_VITRINE).not.toContain(campo);
  });

  it("inclui o que a vitrine exibe", () => {
    expect(CAMPOS_VITRINE).toEqual(
      expect.arrayContaining([
        "estabelecimentoId",
        "nomeFantasia",
        "contatoEstabelecimento",
        "logoUrl",
      ]),
    );
  });
});
