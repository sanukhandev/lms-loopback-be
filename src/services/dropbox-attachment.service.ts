import {BindingScope, inject, injectable} from '@loopback/core';
import {EntityNotFoundError, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {createHash, randomUUID} from 'crypto';
import {Logger} from 'pino';
import {fetch} from 'undici';
import {LoggingBindings} from '../bindings/keys';
import {
  AttachmentMetadata,
  Chapter,
  Course,
  Module,
  Tenant,
} from '../models';
import {
  ChapterRepository,
  CourseRepository,
  ModuleRepository,
  TenantRepository,
} from '../repositories';
import {sanitizeTenantId} from '../utils/tenant';

const DROPBOX_TOKEN_ENDPOINT = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_UPLOAD_ENDPOINT = 'https://content.dropboxapi.com/2/files/upload';
const DROPBOX_SHARED_LINK_ENDPOINT =
  'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings';
const DROPBOX_LIST_SHARED_LINKS_ENDPOINT =
  'https://api.dropboxapi.com/2/sharing/list_shared_links';

interface DropboxUploadMetadata {
  id?: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
}

interface DropboxSharedLinkResponse {
  url?: string;
}

interface DropboxListSharedLinksResponse {
  links?: Array<{url?: string}>;
}

interface DropboxErrorResponse {
  error?: {
    '.tag'?: string;
  };
}

interface DropboxTokenResponse {
  access_token?: string;
}

export interface AttachmentUploadPayload {
  buffer: Buffer;
  fileName: string;
  size: number;
  contentType?: string;
  displayName?: string;
}

interface DropboxContext {
  tenant: Tenant;
  accessToken: string;
  rootPathSegments: string[];
  sanitizedTenantId: string;
}

interface DropboxUploadResult {
  path: string;
  id?: string;
  size?: number;
  sharedLinkUrl?: string;
  fileName: string;
}

@injectable({scope: BindingScope.TRANSIENT})
export class DropboxAttachmentService {
  constructor(
    @repository(TenantRepository)
    private readonly tenantRepository: TenantRepository,
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @repository(ModuleRepository)
    private readonly moduleRepository: ModuleRepository,
    @repository(ChapterRepository)
    private readonly chapterRepository: ChapterRepository,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async uploadCourseAttachment(
    tenantId: string,
    courseId: string,
    file: AttachmentUploadPayload,
    actorId?: string,
  ): Promise<AttachmentMetadata> {
    const context = await this.prepareDropboxContext(tenantId);
    const course = await this.findCourseForTenant(courseId, context.tenant.id!);

    const pathSegments = ['tenants', context.sanitizedTenantId, 'courses', courseId];
    const uploadResult = await this.uploadToDropbox(
      context,
      pathSegments,
      file,
      'course',
      courseId,
    );

    const attachment = this.buildAttachmentMetadata(file, uploadResult, actorId);

    const attachments = [...(course.attachments ?? []), attachment];
    const now = new Date().toISOString();
    await this.courseRepository.updateById(courseId, {
      attachments,
      updatedAt: now,
    });
    await this.touchDropboxSync(context.tenant, now);

    this.logger.info(
      {
        tenantId: context.tenant.id,
        courseId,
        dropboxPath: attachment.dropboxPath,
        attachmentId: attachment.id,
      },
      'course attachment uploaded to dropbox',
    );

    return attachment;
  }

  async uploadModuleAttachment(
    tenantId: string,
    moduleId: string,
    file: AttachmentUploadPayload,
    actorId?: string,
  ): Promise<AttachmentMetadata> {
    const context = await this.prepareDropboxContext(tenantId);
    const {module, course} = await this.findModuleForTenant(
      moduleId,
      context.tenant.id!,
    );

    const pathSegments = [
      'tenants',
      context.sanitizedTenantId,
      'courses',
      String(course.id),
      'modules',
      moduleId,
    ];
    const uploadResult = await this.uploadToDropbox(
      context,
      pathSegments,
      file,
      'module',
      moduleId,
    );

    const attachment = this.buildAttachmentMetadata(file, uploadResult, actorId);

    const attachments = [...(module.attachments ?? []), attachment];
    const now = new Date().toISOString();
    await this.moduleRepository.updateById(moduleId, {
      attachments,
      updatedAt: now,
    });
    await this.touchDropboxSync(context.tenant, now);

    this.logger.info(
      {
        tenantId: context.tenant.id,
        courseId: course.id,
        moduleId,
        dropboxPath: attachment.dropboxPath,
        attachmentId: attachment.id,
      },
      'module attachment uploaded to dropbox',
    );

    return attachment;
  }

  async uploadChapterAttachment(
    tenantId: string,
    moduleId: string,
    chapterId: string,
    file: AttachmentUploadPayload,
    actorId?: string,
  ): Promise<AttachmentMetadata> {
    const context = await this.prepareDropboxContext(tenantId);
    const {chapter, module, course} = await this.findChapterForTenant(
      moduleId,
      chapterId,
      context.tenant.id!,
    );

    const pathSegments = [
      'tenants',
      context.sanitizedTenantId,
      'courses',
      String(course.id),
      'modules',
      String(module.id),
      'chapters',
      chapterId,
    ];
    const uploadResult = await this.uploadToDropbox(
      context,
      pathSegments,
      file,
      'chapter',
      chapterId,
    );

    const attachment = this.buildAttachmentMetadata(file, uploadResult, actorId);

    const attachments = [...(chapter.attachments ?? []), attachment];
    const now = new Date().toISOString();
    await this.chapterRepository.updateById(chapterId, {
      attachments,
      updatedAt: now,
    });
    await this.touchDropboxSync(context.tenant, now);

    this.logger.info(
      {
        tenantId: context.tenant.id,
        courseId: course.id,
        moduleId: module.id,
        chapterId,
        dropboxPath: attachment.dropboxPath,
        attachmentId: attachment.id,
      },
      'chapter attachment uploaded to dropbox',
    );

    return attachment;
  }

  private async prepareDropboxContext(tenantId: string): Promise<DropboxContext> {
    const tenant = await this.loadTenantRecord(tenantId);
    const sanitizedTenantId = sanitizeTenantId(tenantId);

    if (!tenant.dropboxConfig) {
      throw new HttpErrors.BadRequest('Dropbox integration is not configured for this tenant');
    }

    const {
      appKey,
      appSecret,
      refreshToken,
      status,
      rootPath,
    } = tenant.dropboxConfig;

    if (status !== 'connected') {
      throw new HttpErrors.BadRequest('Dropbox integration is not connected');
    }

    if (!appKey || !appSecret || !refreshToken) {
      throw new HttpErrors.BadRequest('Dropbox credentials are incomplete');
    }

    const accessToken = await this.exchangeToken(appKey, appSecret, refreshToken);
    const rootPathSegments = this.normalizeRootPath(rootPath);

    return {
      tenant,
      accessToken,
      rootPathSegments,
      sanitizedTenantId,
    };
  }

  private async loadTenantRecord(tenantId: string): Promise<Tenant> {
    const variantSet = new Set<string>();
    variantSet.add(tenantId);

    const sanitized = sanitizeTenantId(tenantId);
    variantSet.add(sanitized);

    variantSet.add(tenantId.replace(/_/g, '-'));
    variantSet.add(tenantId.replace(/-/g, '_'));
    variantSet.add(sanitized.replace(/_/g, '-'));
    variantSet.add(sanitized.replace(/-/g, '_'));
    variantSet.add(tenantId.replace(/[-_.]/g, ''));
    variantSet.add(sanitized.replace(/[_]/g, '').replace(/\./g, ''));

    const candidates = Array.from(variantSet).filter(Boolean);
    const normalizedCandidates = new Set(
      candidates.map(value => sanitizeTenantId(value)),
    );
    const collapsedCandidates = new Set(
      Array.from(normalizedCandidates).map(value => value.replace(/[-_.]/g, '')),
    );

    for (const candidate of candidates) {
      try {
        return await this.tenantRepository.findById(candidate);
      } catch (error) {
        if (!(error instanceof EntityNotFoundError)) {
          throw error;
        }
      }
    }

    for (const slugCandidate of candidates) {
      const tenant = await this.tenantRepository.findOne({where: {slug: slugCandidate}});
      if (tenant) {
        return tenant;
      }
    }

    const fallbackTenants = await this.tenantRepository.find({limit: 250});
    for (const tenant of fallbackTenants) {
      const tenantSlug = tenant.slug ? sanitizeTenantId(tenant.slug) : undefined;
      if (tenantSlug && (normalizedCandidates.has(tenantSlug) || collapsedCandidates.has(tenantSlug.replace(/[-_.]/g, '')))) {
        return tenant;
      }

      if (tenant.domain) {
        const normalizedDomain = sanitizeTenantId(tenant.domain);
        if (
          normalizedCandidates.has(normalizedDomain) ||
          collapsedCandidates.has(normalizedDomain.replace(/[-_.]/g, '')) ||
          (() => {
            const firstLabel = tenant.domain.split('.')[0];
            if (!firstLabel) {
              return false;
            }
            const normalizedFirstLabel = sanitizeTenantId(firstLabel);
            return (
              normalizedCandidates.has(normalizedFirstLabel) ||
              collapsedCandidates.has(normalizedFirstLabel.replace(/[-_.]/g, ''))
            );
          })()
        ) {
          return tenant;
        }
      }

      if (tenant.hostnames && tenant.hostnames.length > 0) {
        for (const host of tenant.hostnames) {
          const normalizedHost = sanitizeTenantId(host);
          const collapsedHost = normalizedHost.replace(/[-_.]/g, '');
          const firstLabel = host.split('.')[0];
          const normalizedFirstLabel = firstLabel ? sanitizeTenantId(firstLabel) : undefined;

          if (
            normalizedCandidates.has(normalizedHost) ||
            collapsedCandidates.has(collapsedHost) ||
            (normalizedFirstLabel &&
              (normalizedCandidates.has(normalizedFirstLabel) ||
                collapsedCandidates.has(normalizedFirstLabel.replace(/[-_.]/g, ''))))
          ) {
            return tenant;
          }
        }
      }
    }

    throw new HttpErrors.NotFound('Tenant not found');
  }

  private async uploadToDropbox(
    context: DropboxContext,
    pathSegments: string[],
    file: AttachmentUploadPayload,
    resourceType: 'course' | 'module' | 'chapter',
    resourceId: string,
  ): Promise<DropboxUploadResult> {
    const fileName = this.sanitizeFileName(file.fileName);
    const path = this.buildDropboxPath(
      context.rootPathSegments,
      pathSegments,
      fileName,
    );

    const uploadResponse = await fetch(DROPBOX_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path,
          mode: 'add',
          autorename: true,
          mute: true,
          strict_conflict: false,
        }),
      },
      body: file.buffer,
    });

    const uploadBody = (await uploadResponse.json()) as DropboxUploadMetadata;
    if (!uploadResponse.ok) {
      this.logger.error(
        {
          tenantId: context.tenant.id,
          resourceType,
          resourceId,
          error: uploadBody,
        },
        'dropbox upload failed',
      );
      throw new HttpErrors.BadRequest('Dropbox upload failed');
    }

    let sharedLinkUrl: string | undefined;
    try {
      sharedLinkUrl = await this.ensureSharedLink(
        context.accessToken,
        uploadBody.path_lower ?? uploadBody.path_display ?? path,
      );
    } catch (error) {
      this.logger.warn(
        {
          tenantId: context.tenant.id,
          resourceType,
          resourceId,
          error,
        },
        'failed to create dropbox shared link',
      );
    }

    return {
      path: uploadBody.path_display ?? path,
      id: uploadBody.id,
      size: uploadBody.size,
      sharedLinkUrl,
      fileName,
    };
  }

  private buildAttachmentMetadata(
    file: AttachmentUploadPayload,
    uploadResult: DropboxUploadResult,
    actorId?: string,
  ): AttachmentMetadata {
    const uploadedAt = new Date().toISOString();
    const checksum = this.computeChecksum(file.buffer);

    return {
      id: randomUUID(),
      fileName: uploadResult.fileName,
      displayName: file.displayName ?? file.fileName,
      contentType: file.contentType,
      size: uploadResult.size ?? file.size,
      dropboxPath: uploadResult.path,
      dropboxFileId: uploadResult.id,
      sharedLinkUrl: uploadResult.sharedLinkUrl,
      uploadedAt,
      uploadedBy: actorId,
      checksum,
    };
  }

  private async findCourseForTenant(
    courseId: string,
    tenantId: string,
  ): Promise<Course> {
    const course = await this.courseRepository.findById(courseId);
    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== sanitizeTenantId(tenantId)) {
      throw new HttpErrors.Forbidden('Course does not belong to this tenant');
    }

    return course;
  }

  private async findModuleForTenant(
    moduleId: string,
    tenantId: string,
  ): Promise<{module: Module; course: Course}> {
    const module = await this.moduleRepository.findById(moduleId);
    const course = await this.courseRepository.findById(String(module.courseId));

    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== sanitizeTenantId(tenantId)) {
      throw new HttpErrors.Forbidden('Module does not belong to this tenant');
    }

    return {module, course};
  }

  private async findChapterForTenant(
    moduleId: string,
    chapterId: string,
    tenantId: string,
  ): Promise<{chapter: Chapter; module: Module; course: Course}> {
    const chapter = await this.chapterRepository.findById(chapterId);
    if (String(chapter.moduleId) !== String(moduleId)) {
      throw new HttpErrors.Forbidden('Chapter does not belong to the specified module');
    }

    const {module, course} = await this.findModuleForTenant(moduleId, tenantId);
    return {chapter, module, course};
  }

  private async ensureSharedLink(
    accessToken: string,
    path: string,
  ): Promise<string | undefined> {
    const createResponse = await fetch(DROPBOX_SHARED_LINK_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        settings: {
          requested_visibility: 'public',
          audience: 'public',
        },
      }),
    });

    if (createResponse.ok) {
      const body = (await createResponse.json()) as DropboxSharedLinkResponse;
      return body.url ?? undefined;
    }

    let errorTag: string | undefined;
    try {
      const errorBody = (await createResponse.json()) as DropboxErrorResponse;
      errorTag = errorBody.error?.['.tag'];
    } catch {
      return undefined;
    }

    if (errorTag !== 'shared_link_already_exists') {
      return undefined;
    }

    const listResponse = await fetch(DROPBOX_LIST_SHARED_LINKS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path,
        direct_only: true,
      }),
    });

    if (!listResponse.ok) {
      return undefined;
    }

    const listBody = (await listResponse.json()) as DropboxListSharedLinksResponse;
    const links = Array.isArray(listBody.links) ? listBody.links : [];
    const firstLink = links.find(link => Boolean(link?.url));
    return firstLink?.url ?? undefined;
  }

  private async exchangeToken(
    appKey: string,
    appSecret: string,
    refreshToken: string,
  ): Promise<string> {
    const response = await fetch(DROPBOX_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${appKey}:${appSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const body = (await response.json()) as DropboxTokenResponse;
    if (!response.ok || !body.access_token) {
      this.logger.error({error: body}, 'failed to exchange dropbox refresh token');
      throw new HttpErrors.BadRequest('Unable to obtain Dropbox access token');
    }

    return body.access_token;
  }

  private normalizeRootPath(rootPath?: string): string[] {
    if (!rootPath) {
      return [];
    }

    return rootPath
      .split('/')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0 && segment !== '.' && segment !== '..')
      .map(segment => this.sanitizeSegment(segment));
  }

  private buildDropboxPath(
    rootSegments: string[],
    pathSegments: string[],
    fileName: string,
  ): string {
    const segments = [
      ...rootSegments,
      ...pathSegments.map(segment => this.sanitizeSegment(segment)),
    ];
    const normalized = segments
      .map(segment => segment.replace(/^\/+|\/+$/g, ''))
      .filter(segment => segment.length > 0);
    return `/${[...normalized, fileName].join('/')}`;
  }

  private sanitizeSegment(segment: string): string {
    return segment
      .replace(/\\/g, '/')
      .split('/')
      .filter(part => part.length > 0 && part !== '.' && part !== '..')
      .map(part => part.replace(/[^a-zA-Z0-9._-]/g, '-'))
      .join('-');
  }

  private sanitizeFileName(fileName: string): string {
    const rawName = fileName.split(/[/\\]/).pop() ?? 'attachment';
    const trimmed = rawName.trim().slice(0, 255);
    const lastDot = trimmed.lastIndexOf('.');
    const base = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
    const extension = lastDot > 0 ? trimmed.slice(lastDot) : '';

    const sanitizedBase = base.replace(/[^a-zA-Z0-9_-]/g, '_') || 'attachment';
    const sanitizedExtension = extension.replace(/[^a-zA-Z0-9.]/g, '');

    const result = `${sanitizedBase}${sanitizedExtension}`.slice(0, 255);
    return result || `attachment_${Date.now()}`;
  }

  private computeChecksum(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async touchDropboxSync(tenant: Tenant, timestamp: string): Promise<void> {
    if (!tenant.id || !tenant.dropboxConfig) {
      return;
    }

    await this.tenantRepository.updateById(tenant.id, {
      dropboxConfig: {...tenant.dropboxConfig, lastSyncedAt: timestamp},
      updatedAt: timestamp,
    });
  }
}
