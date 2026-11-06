import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Messaging Attachments')
@Controller({ path: 'attachments', version: '1' })
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload an attachment for a conversation message' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or file too large' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const attachment = await this.attachmentsService.saveAttachment(file);
    return { data: attachment };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get attachment metadata by ID' })
  async getAttachment(@Param('id') id: string) {
    const attachment = await this.attachmentsService.getAttachment(id);
    return { data: attachment };
  }

  @Get('file/:filename')
  @Public()
  @ApiOperation({ summary: 'Retrieve / stream uploaded attachment file' })
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = this.attachmentsService.getFilePath(filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.sendFile(filePath);
  }
}
