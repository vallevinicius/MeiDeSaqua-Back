import { Request, Response } from 'express';
import FileStorageService from '../utils/FileStorageService';

class FileController {
    public async uploadFile(req: Request, res: Response): Promise<Response> {
        try {
            let uploadedFile: Express.Multer.File | undefined;

            if (req.file) {
                uploadedFile = req.file;
            } else if (Array.isArray(req.files) && req.files.length > 0) {
                uploadedFile = req.files[0] as Express.Multer.File;
            } else if (req.files && !Array.isArray(req.files)) {
                const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] };
                const firstKey = Object.keys(filesMap)[0];
                uploadedFile = firstKey ? filesMap[firstKey]?.[0] : undefined;
            }

            if (!uploadedFile) {
                throw new Error("Nenhum ficheiro enviado.");
            }
            const url = await FileStorageService.save(uploadedFile);
            return res.status(200).json({ url });
        } catch (error: any) {
            return res.status(400).json({ message: `Falha ao fazer o upload da imagem: ${error.message}` });
        }
    }

    public async uploadMultipleFiles(req: Request, res: Response): Promise<Response> {
        try {
            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                throw new Error("Nenhum ficheiro enviado.");
            }

            const urlsPromises = files.map(file => FileStorageService.save(file));
            const urls = await Promise.all(urlsPromises);
            
            return res.status(200).json({ urls });
        } catch (error: any) {
            return res.status(400).json({ message: `Falha ao fazer o upload das imagens: ${error.message}` });
        }
    }
}

export default new FileController();