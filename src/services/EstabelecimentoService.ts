import { Op } from "sequelize";
import sequelize from "../config/database";
import Estabelecimento, {
  StatusEstabelecimento,
} from "../entities/Estabelecimento.entity";
import ImagemProduto from "../entities/ImagemProduto.entity";
import Avaliacao from "../entities/Avaliacao.entity";
import CnpjService from "./CnpjService";
import Usuario from "../entities/Usuario.entity";
import FileStorageService from "../utils/FileStorageService";
import { CAMPOS_VITRINE } from "../serializers/estabelecimento.serializer";

class EstabelecimentoService {
  public async cadastrarEstabelecimentoComImagens(
    dados: any,
  ): Promise<Estabelecimento> {
    if (!dados.cnpj) {
      throw new Error("O campo CNPJ é obrigatório.");
    }

    try {
      const dadosCnpj = await CnpjService.consultarCnpj(dados.cnpj);
      if (dadosCnpj.opcao_pelo_mei !== true) {
        throw new Error(
          `O CNPJ não corresponde a um MEI. O porte identificado foi: "${dadosCnpj.porte}".`,
        );
      }
      const situacao = String(dadosCnpj.situacao_cadastral);

      if (situacao !== "ATIVA" && situacao !== "2") {
        const mapaStatus: { [key: string]: string } = {
          "1": "NULA",
          "01": "NULA",
          "3": "SUSPENSA",
          "03": "SUSPENSA",
          "4": "INAPTA",
          "04": "INAPTA",
          "8": "BAIXADA",
          "08": "BAIXADA",
        };
        const statusLegivel = mapaStatus[situacao] || situacao;

        throw new Error(
          `O CNPJ está com a situação "${statusLegivel}". Apenas CNPJs com situação "ATIVA" são permitidos. Em caso de dúvidas, entre em contato com a Sala do Empreendedor.`,
        );
      }

      const nomeCidade = dadosCnpj.municipio?.toUpperCase();
      if (nomeCidade !== "SAQUAREMA") {
        throw new Error(
          `Este CNPJ pertence à cidade de ${
            dadosCnpj.municipio || "desconhecida"
          }. Apenas CNPJs de Saquarema são permitidos. Em caso de dúvidas, entre em contato com a Sala do Empreendedor.`,
        );
      }
    } catch (error: any) {
      throw new Error(error.message);
    }

    const transaction = await sequelize.transaction();
    try {
      const emailExistente = await Estabelecimento.findOne({
        where: { emailEstabelecimento: dados.emailEstabelecimento },
        transaction,
      });
      if (emailExistente) {
        throw new Error("E-mail já cadastrado no sistema.");
      }

      const cnpjExistente = await Estabelecimento.findOne({
        where: { cnpj: dados.cnpj },
        transaction,
      });
      if (cnpjExistente) {
        throw new Error("CNPJ já cadastrado no sistema.");
      }

      const dadosParaCriacao = {
        nomeFantasia: dados.nomeFantasia,
        cnpj: dados.cnpj,
        categoria: dados.categoria,
        nomeResponsavel: dados.nome_responsavel,
        cpfResponsavel: dados.cpf_responsavel,
        cnae: dados.cnae,
        emailEstabelecimento: dados.emailEstabelecimento,
        contatoEstabelecimento: dados.contatoEstabelecimento,
        endereco: dados.endereco,
        descricao: dados.descricao,
        descricaoDiferencial: dados.descricaoDiferencial,
        areasAtuacao: dados.areasAtuacao,
        tagsInvisiveis: dados.tagsInvisiveis,
        website: dados.website,
        instagram: dados.instagram,
        logoUrl: dados.logo,
        ccmeiUrl: dados.ccmei,
        venda: dados.venda,
        escala: dados.escala,
      };

      const estabelecimento = await Estabelecimento.create(dadosParaCriacao, {
        transaction,
      });

      if (dados.produtos && dados.produtos.length > 0) {
        const imagens = dados.produtos.map((url: string) => ({
          url,
          estabelecimentoId: estabelecimento.estabelecimentoId,
        }));
        await ImagemProduto.bulkCreate(imagens, { transaction });
      }

      await transaction.commit();
      return estabelecimento;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public async solicitarAtualizacaoPorCnpj(
    cnpj: string,
    dadosAtualizacao: any,
  ): Promise<Estabelecimento> {
    const estabelecimento = await Estabelecimento.findOne({ where: { cnpj } });

    if (!estabelecimento) {
      throw new Error("Estabelecimento não encontrado.");
    }

    estabelecimento.status = StatusEstabelecimento.PENDENTE_ATUALIZACAO;
    estabelecimento.dados_atualizacao = dadosAtualizacao;
    await estabelecimento.save();

    return estabelecimento;
  }

  public async solicitarExclusaoPorCnpj(
    dadosExclusao: any, // Recebe o objeto completo do controller
  ): Promise<void> {
    const { cnpj } = dadosExclusao; // Extrai o CNPJ dos dados

    const estabelecimento = await Estabelecimento.findOne({ where: { cnpj } });

    if (!estabelecimento) {
      throw new Error("Estabelecimento não encontrado.");
    }

    estabelecimento.status = StatusEstabelecimento.PENDENTE_EXCLUSAO;
    // Guarda todos os dados da solicitação no campo JSON
    estabelecimento.dados_atualizacao = dadosExclusao;
    await estabelecimento.save();
  }

  public async listarTodosParaAdmin(): Promise<Estabelecimento[]> {
    return Estabelecimento.findAll({
      where: {
        status: StatusEstabelecimento.ATIVO,
      },
      include: [
        {
          model: ImagemProduto,
          as: "produtosImg",
          attributes: ["url"],
        },
      ],
    });
  }

  public async listarTodos(): Promise<Estabelecimento[]> {
    return Estabelecimento.findAll({
      attributes: CAMPOS_VITRINE,
      where: {
        status: StatusEstabelecimento.ATIVO,
      },
      include: [
        {
          model: ImagemProduto,
          as: "produtosImg",
          attributes: ["url"],
        },
      ],
    });
  }

  public async buscarPorNome(nome: string): Promise<Estabelecimento[]> {
    return Estabelecimento.findAll({
      attributes: CAMPOS_VITRINE,
      where: {
        nomeFantasia: {
          [Op.like]: `%${nome}%`,
        },
        status: StatusEstabelecimento.ATIVO,
      },
      include: [
        {
          model: ImagemProduto,
          as: "produtosImg",
          attributes: ["url"],
        },
      ],
    });
  }

  public async buscarPorId(id: number): Promise<Estabelecimento | null> {
    try {
      const estabelecimento = await Estabelecimento.findOne({
        attributes: CAMPOS_VITRINE,
        where: {
          estabelecimentoId: id,
          status: StatusEstabelecimento.ATIVO,
        },
        // Não precisamos de 'include' aqui,
        // pois vamos buscar as associações separadamente para montar o objeto
      });

      if (!estabelecimento) {
        return null;
      }

      // 1. Buscar imagens
      const imagens = await ImagemProduto.findAll({
        where: { estabelecimentoId: estabelecimento.estabelecimentoId },
        attributes: ["url"],
      });

      // 2. Buscar avaliações (com a nova lógica de aninhamento)
      const avaliacoes = await Avaliacao.findAll({
        where: {
          estabelecimentoId: estabelecimento.estabelecimentoId,
          parent_id: null, // Buscar APENAS comentários principais
        },
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["nomeCompleto", "usuarioId", "username"], // Ajuste os atributos conforme necessário
          },
          {
            model: Avaliacao,
            as: "respostas",
            required: false,
            include: [
              {
                model: Usuario,
                as: "usuario",
                attributes: ["nomeCompleto", "usuarioId", "username"], // Ajuste os atributos
              },
            ],
          },
        ],
        order: [
          ["avaliacoesId", "DESC"], // Pais mais novos primeiro
          [{ model: Avaliacao, as: "respostas" }, "avaliacoesId", "ASC"], // Respostas em ordem cronológica
        ],
      });

      // 3. Montar o JSON de resposta (similar ao ODS Service)
      const estabelecimentoJSON = estabelecimento.toJSON();

      // Anexa as imagens e avaliações
      (estabelecimentoJSON as any).produtosImg = imagens;
      (estabelecimentoJSON as any).avaliacoes = avaliacoes;

      // 4. Calcular a média (movido do controller para o service)
      if (avaliacoes && avaliacoes.length > 0) {
        // Filtra para garantir que só notas de comentários principais sejam contadas
        const notasPrincipais = avaliacoes
          .map((a) => a.nota)
          .filter((n) => n !== null) as number[];

        if (notasPrincipais.length > 0) {
          const somaDasNotas = notasPrincipais.reduce(
            (acc, nota) => acc + nota,
            0,
          );
          (estabelecimentoJSON as any).media = parseFloat(
            (somaDasNotas / notasPrincipais.length).toFixed(1),
          );
        } else {
          (estabelecimentoJSON as any).media = 0; // Caso só haja respostas sem nota (improvável)
        }
      } else {
        (estabelecimentoJSON as any).media = 0;
      }

      return estabelecimentoJSON as Estabelecimento;
    } catch (error) {
      console.error("[EstabelecimentoService] Erro ao buscarPorId:", error);
      throw error;
    }
  }

  public async alterarStatusAtivo(
    id: number,
    ativo: boolean,
  ): Promise<Estabelecimento> {
    const estabelecimento = await Estabelecimento.findByPk(id);
    if (!estabelecimento) {
      throw new Error("Estabelecimento não encontrado.");
    }
    estabelecimento.ativo = ativo;

    estabelecimento.status = ativo
      ? StatusEstabelecimento.ATIVO
      : StatusEstabelecimento.INATIVO;

    await estabelecimento.save();
    return estabelecimento;
  }

  public async listarParaAdminGeral(): Promise<Estabelecimento[]> {
    return Estabelecimento.findAll({
      include: [
        {
          model: ImagemProduto,
          as: "produtosImg",
          attributes: ["url"],
        },
      ],
    });
  }
  public async listarPendentes(): Promise<{
    cadastros: Estabelecimento[];
    atualizacoes: Estabelecimento[];
    exclusoes: Estabelecimento[];
  }> {
    const commonOptions = {
      include: [
        {
          model: ImagemProduto,
          as: "produtosImg",
          attributes: ["url"],
        },
      ],
    };

    const cadastros = await Estabelecimento.findAll({
      where: { status: StatusEstabelecimento.PENDENTE_APROVACAO },
      ...commonOptions,
    });

    const atualizacoes = await Estabelecimento.findAll({
      where: { status: StatusEstabelecimento.PENDENTE_ATUALIZACAO },
      ...commonOptions,
    });

    const exclusoes = await Estabelecimento.findAll({
      where: { status: StatusEstabelecimento.PENDENTE_EXCLUSAO },
      ...commonOptions,
    });

    return { cadastros, atualizacoes, exclusoes };
  }

  public async deletarDefinitivamente(id: number): Promise<void> {
    const estabelecimento = await Estabelecimento.findByPk(id);

    if (!estabelecimento) {
      throw new Error("Estabelecimento não encontrado para exclusão.");
    }

    await FileStorageService.deleteFolder(
      estabelecimento.categoria,
      estabelecimento.nomeFantasia,
    );

    await estabelecimento.destroy();
  }
}

export default new EstabelecimentoService();
