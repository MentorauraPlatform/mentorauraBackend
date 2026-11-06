import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface AttachmentResult {
  id: string;
  messageId: string | null;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: Date;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'attachments');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Save uploaded file and record metadata
   */
  async saveAttachment(
    file: Express.Multer.File,
    messageId?: string,
  ): Promise<AttachmentResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Allowed mime types
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type (${file.mimetype}). Allowed types: images, PDF, documents, and ZIP archives.`,
      );
    }

    // Max 15MB
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds the 15MB limit');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const blockedExtensions = ['.html', '.htm', '.svg', '.js', '.mjs', '.cjs', '.sh', '.php', '.exe', '.bat', '.cmd'];
    if (blockedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension ${ext} is not allowed for security reasons.`);
    }
    const uniqueFileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const targetFilePath = path.join(this.uploadDir, uniqueFileName);

    await fs.promises.writeFile(targetFilePath, file.buffer);

    const fileUrl = `/api/v1/attachments/file/${uniqueFileName}`;

    const attachment = await this.prisma.messageAttachment.create({
      data: {
        messageId: messageId || null,
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        fileSize: file.size,
      },
    });

    this.logger.log(`Saved attachment ${attachment.id} (${file.originalname})`);
    return attachment;
  }

  /**
   * Link existing uploaded attachments to a sent message
   */
  async associateAttachments(attachmentIds: string[], messageId: string) {
    if (!attachmentIds || attachmentIds.length === 0) return;

    await this.prisma.messageAttachment.updateMany({
      where: { id: { in: attachmentIds } },
      data: { messageId },
    });
  }

  /**
   * Find attachment metadata by ID
   */
  async getAttachment(id: string): Promise<AttachmentResult> {
    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }

    return attachment;
  }

  /**
   * Get physical file path
   */
  getFilePath(filename: string): string {
    const safeFilename = path.basename(filename);
    const filePath = path.join(this.uploadDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File ${filename} not found`);
    }

    return filePath;
  }
}
