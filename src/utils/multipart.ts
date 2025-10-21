import {HttpErrors, Request, Response} from '@loopback/rest';
import multer, {MulterError} from 'multer';

export interface ParsedSingleFileUpload {
  file: UploadedFile;
  fields: Record<string, unknown>;
}

export interface SingleFileUploadOptions {
  fieldName?: string;
  maxFileSizeBytes?: number;
}

export const DEFAULT_MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  [key: string]: unknown;
}

export async function parseSingleFileUpload(
  request: Request,
  response: Response,
  options?: SingleFileUploadOptions,
): Promise<ParsedSingleFileUpload> {
  const fieldName = options?.fieldName ?? 'file';
  const maxFileSize = options?.maxFileSizeBytes && options.maxFileSizeBytes > 0
    ? options.maxFileSizeBytes
    : DEFAULT_MAX_UPLOAD_SIZE;

  const uploadHandler = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxFileSize,
    },
  }).single(fieldName);

  return new Promise((resolve, reject) => {
    uploadHandler(request, response, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError) {
          const multerError = err as MulterError;

          if (multerError.code === 'LIMIT_FILE_SIZE') {
            return reject(
              new HttpErrors.BadRequest(
                `Uploaded file exceeds the maximum size of ${Math.floor(maxFileSize / (1024 * 1024))}MB`,
              ),
            );
          }
          return reject(new HttpErrors.BadRequest(multerError.message));
        }

        return reject(new HttpErrors.BadRequest('Failed to process upload'));
      }

      const expressRequest = request as Request & {
        file?: UploadedFile;
        body?: Record<string, unknown>;
      };

      const file = expressRequest.file;
      if (!file) {
        return reject(
          new HttpErrors.BadRequest(
            `Expected file field "${fieldName}" in multipart form data`,
          ),
        );
      }

      const rawFields = {...(expressRequest.body ?? {})};
      resolve({file, fields: rawFields});
    });
  });
}
