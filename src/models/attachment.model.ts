import {SchemaObject} from '@loopback/rest';

export interface AttachmentMetadata {
  id: string;
  fileName: string;
  displayName?: string;
  contentType?: string;
  size?: number;
  dropboxPath: string;
  dropboxFileId?: string;
  sharedLinkUrl?: string;
  uploadedAt: string;
  uploadedBy?: string;
  checksum?: string;
}

export const AttachmentMetadataSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'fileName', 'dropboxPath', 'uploadedAt'],
  properties: {
    id: {type: 'string'},
    fileName: {type: 'string'},
    displayName: {type: 'string'},
    contentType: {type: 'string'},
    size: {type: 'number'},
    dropboxPath: {type: 'string'},
    dropboxFileId: {type: 'string'},
    sharedLinkUrl: {type: 'string'},
    uploadedAt: {type: 'string', format: 'date-time'},
    uploadedBy: {type: 'string'},
    checksum: {type: 'string'},
  },
};
