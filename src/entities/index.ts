// Copie e cole TUDO isto no seu arquivo: src/entities/index.ts

import Usuario from "./Usuario.entity";
import Estabelecimento from "./Estabelecimento.entity";
import Avaliacao from "./Avaliacao.entity";
import ImagemProduto from "./ImagemProduto.entity";
import ContadorVisualizacao from "./ContadorVisualizacao.entity";
import Curso from "./Curso.entity";

// Usuário <-> Estabelecimento
Usuario.hasMany(Estabelecimento, {
  foreignKey: "usuarioId",
  as: "estabelecimentos",
});
Estabelecimento.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Usuário <-> Avaliação
Usuario.hasMany(Avaliacao, { foreignKey: "usuarioId", as: "avaliacoes" });
Avaliacao.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Estabelecimento <-> Avaliação
Estabelecimento.hasMany(Avaliacao, {
  foreignKey: "estabelecimentoId",
  as: "avaliacoes",
});
Avaliacao.belongsTo(Estabelecimento, {
  foreignKey: "estabelecimentoId",
  as: "estabelecimento",
});

// Estabelecimento <-> ImagemProduto
Estabelecimento.hasMany(ImagemProduto, {
  foreignKey: "estabelecimentoId",
  as: "produtosImg",
});
ImagemProduto.belongsTo(Estabelecimento, { foreignKey: "estabelecimentoId" });

// --- ADICIONE ESTE BLOCO DE VOLTA ---
// Avaliação <-> Avaliação (para respostas)
// Um comentário PAI pode ter várias RESPOSTAS
Avaliacao.hasMany(Avaliacao, {
  foreignKey: "parentId", // <-- Deve bater com o 'field' 'parent_id' na entidade
  as: "respostas",
  onDelete: "CASCADE",
});

// Uma RESPOSTA pertence a um comentário PAI
Avaliacao.belongsTo(Avaliacao, {
  foreignKey: "parentId",
  as: "pai",
});
// --- FIM DA ADIÇÃO ---

export {
  Usuario,
  Estabelecimento,
  Avaliacao,
  ImagemProduto,
  ContadorVisualizacao,
  Curso,
};
