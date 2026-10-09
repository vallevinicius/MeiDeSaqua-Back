import { Response } from 'express';
import AuthService from '../services/AuthService';
import EstabelecimentoService from '../services/EstabelecimentoService';
import { AuthenticatedRequest } from '../interfaces/requests';

class UserController {
    public async updateUserProfile(req: AuthenticatedRequest, res: Response): Promise<Response> {
        try {
            const userId = req.user?.id; 
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            const updatedUser = await AuthService.updateUserProfile(userId, req.body);
            const { password, ...userDTO } = updatedUser.get({ plain: true });

            return res.json(userDTO);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    public async deleteUserProfile(req: AuthenticatedRequest, res: Response): Promise<Response> {
        try {
            const userId = req.user?.id; 
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            await AuthService.deleteUser(userId);
            return res.json({ message: "Perfil de utilizador excluído com sucesso." });
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    public async updateUserPassword(req: AuthenticatedRequest, res: Response): Promise<Response> {
        try {
            const userId = req.user?.id; 
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            await AuthService.updateUserPassword(userId, req.body);
            return res.json({ message: "Senha alterada com sucesso." });
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    public async getOwnEstabelecimentos(req: AuthenticatedRequest, res: Response): Promise<Response> {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            const estabelecimentos = await EstabelecimentoService.listarPorUsuarioId(userId);
            return res.json(estabelecimentos);
        } catch (error: any) {
            return res.status(400).json({ message: error.message });
        }
    }

    public async updateOwnEstabelecimento(req: AuthenticatedRequest, res: Response): Promise<Response> {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ message: "Não autorizado" });

            const estabelecimentoId = Number(req.params.id);
            if (Number.isNaN(estabelecimentoId)) {
                return res.status(400).json({ message: "ID do estabelecimento inválido." });
            }

            const estabelecimento = await EstabelecimentoService.solicitarAtualizacaoPorIdEUsuario(
                estabelecimentoId,
                userId,
                req.body,
            );

            return res.status(200).json({
                message: "Solicitação de atualização enviada para análise.",
                estabelecimento,
            });
        } catch (error: any) {
            if (error.message === "Estabelecimento não encontrado para este usuário.") {
                return res.status(404).json({ message: error.message });
            }
            return res.status(400).json({ message: error.message });
        }
    }
}

export default new UserController();