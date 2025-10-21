import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject, service} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  HttpErrors,
  Request,
  RestBindings,
  SchemaObject,
  del,
  get,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {SecurityBindings, UserProfile, securityId} from '@loopback/security';
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {
  CmsContent,
  CmsContentRevision,
} from '../models';
import {
  CmsContentRepository,
  CmsContentRevisionRepository,
} from '../repositories';
import {
  CmsContentRequest,
  CmsContentService,
} from '../services/cms-content.service';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const CMS_CONTENT_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    tenantId: {type: 'string'},
    section: {type: 'string'},
    blockType: {type: 'string'},
    slug: {type: 'string'},
    locale: {type: 'string'},
    status: {type: 'string'},
    title: {type: 'string'},
    body: {type: 'string'},
    imageUrl: {type: 'string'},
    excerpt: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
    order: {type: 'number'},
    metadata: {type: 'object'},
    seoTitle: {type: 'string'},
    seoDescription: {type: 'string'},
    publishAt: {type: 'string', format: 'date-time'},
    unpublishAt: {type: 'string', format: 'date-time'},
    publishedAt: {type: 'string', format: 'date-time'},
    publishedBy: {type: 'string'},
    version: {type: 'number'},
    isPublic: {type: 'boolean'},
    previewToken: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const CMS_CONTENT_CREATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['section', 'blockType'],
  properties: {
    section: {type: 'string'},
    blockType: {type: 'string'},
    slug: {type: 'string'},
    locale: {type: 'string'},
    title: {type: 'string'},
    body: {type: 'string'},
    imageUrl: {type: 'string'},
    excerpt: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
    order: {type: 'number'},
    metadata: {type: 'object'},
    seoTitle: {type: 'string'},
    seoDescription: {type: 'string'},
    publishAt: {type: 'string', format: 'date-time'},
    unpublishAt: {type: 'string', format: 'date-time'},
    isPublic: {type: 'boolean'},
  },
};

const CMS_CONTENT_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    section: {type: 'string'},
    blockType: {type: 'string'},
    slug: {type: 'string'},
    locale: {type: 'string'},
    title: {type: 'string'},
    body: {type: 'string'},
    imageUrl: {type: 'string'},
    excerpt: {type: 'string'},
    tags: {type: 'array', items: {type: 'string'}},
    order: {type: 'number'},
    metadata: {type: 'object'},
    seoTitle: {type: 'string'},
    seoDescription: {type: 'string'},
    publishAt: {type: 'string', format: 'date-time'},
    unpublishAt: {type: 'string', format: 'date-time'},
    isPublic: {type: 'boolean'},
  },
};

interface PublishRequest {
  publishAt?: string;
}

@authenticate('jwt')
export class CmsContentController {
  constructor(
    @repository(CmsContentRepository)
    private readonly cmsContentRepository: CmsContentRepository,
    @repository(CmsContentRevisionRepository)
    private readonly revisionRepository: CmsContentRevisionRepository,
    @service(CmsContentService)
    private readonly cmsContentService: CmsContentService,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
    @inject(SecurityBindings.USER, {optional: true})
    private readonly currentUserProfile?: UserProfile,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/cms/contents')
  @response(201, {
    description: 'Create CMS content draft',
    content: {'application/json': {schema: CMS_CONTENT_VIEW_SCHEMA}},
  })
  async createContent(
    @requestBody({content: {'application/json': {schema: CMS_CONTENT_CREATE_SCHEMA}}})
    body: CmsContentRequest,
  ): Promise<CmsContent> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const actorId = this.extractUserId();

    const content = await this.cmsContentService.createDraft(tenantId, body, actorId);
    this.logger.info(this.buildLogContext(tenantId, {contentId: content.id}), 'cms content created');
    return content;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @get('/tenant/cms/contents')
  @response(200, {
    description: 'List CMS contents for tenant',
    content: {'application/json': {schema: {type: 'array', items: CMS_CONTENT_VIEW_SCHEMA}}},
  })
  async listContents(
    @param.query.string('status') status?: string,
    @param.query.string('section') section?: string,
    @param.query.string('locale') locale?: string,
  ): Promise<CmsContent[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));

    const filter: Filter<CmsContent> = {
      where: {
        tenantId,
        ...(status ? {status} : {}),
        ...(section ? {section} : {}),
        ...(locale ? {locale} : {}),
      },
      order: ['order ASC', 'updatedAt DESC'],
    };

    return this.cmsContentRepository.find(filter);
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @get('/tenant/cms/contents/{id}')
  @response(200, {
    description: 'Get CMS content',
    content: {'application/json': {schema: CMS_CONTENT_VIEW_SCHEMA}},
  })
  async getContent(@param.path.string('id') id: string): Promise<CmsContent> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const content = await this.cmsContentRepository.findById(id);
    this.ensureOwnership(content, tenantId);
    return content;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @patch('/tenant/cms/contents/{id}')
  @response(200, {
    description: 'Update CMS content draft',
    content: {'application/json': {schema: CMS_CONTENT_VIEW_SCHEMA}},
  })
  async updateContent(
    @param.path.string('id') id: string,
    @requestBody({content: {'application/json': {schema: CMS_CONTENT_UPDATE_SCHEMA}}})
    body: Partial<CmsContentRequest>,
  ): Promise<CmsContent> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const actorId = this.extractUserId();
    const updated = await this.cmsContentService.updateDraft(tenantId, id, body, actorId);
    this.logger.info(this.buildLogContext(tenantId, {contentId: id}), 'cms content updated');
    return updated;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/cms/contents/{id}/publish')
  @response(200, {
    description: 'Publish CMS content',
    content: {'application/json': {schema: CMS_CONTENT_VIEW_SCHEMA}},
  })
  async publishContent(
    @param.path.string('id') id: string,
    @requestBody({content: {'application/json': {schema: {type: 'object', properties: {publishAt: {type: 'string', format: 'date-time'}}}}}})
    body: PublishRequest,
  ): Promise<CmsContent> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const actorId = this.extractUserId(true)!;
    const published = await this.cmsContentService.publish(tenantId, id, actorId, body.publishAt);
    this.logger.info(this.buildLogContext(tenantId, {contentId: id}), 'cms content published');
    return published;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/cms/contents/{id}/unpublish')
  @response(200, {
    description: 'Unpublish CMS content',
    content: {'application/json': {schema: CMS_CONTENT_VIEW_SCHEMA}},
  })
  async unpublishContent(@param.path.string('id') id: string): Promise<CmsContent> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const actorId = this.extractUserId(true)!;
    const draft = await this.cmsContentService.unpublish(tenantId, id, actorId);
    this.logger.info(this.buildLogContext(tenantId, {contentId: id}), 'cms content unpublished');
    return draft;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @del('/tenant/cms/contents/{id}')
  @response(204, {
    description: 'Archive CMS content',
  })
  async archiveContent(@param.path.string('id') id: string): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const actorId = this.extractUserId(true)!;
    await this.cmsContentService.archive(tenantId, id, actorId);
    this.logger.info(this.buildLogContext(tenantId, {contentId: id}), 'cms content archived');
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/cms/contents/{id}/preview-token')
  @response(200, {
    description: 'Generate preview token for CMS content',
    content: {'application/json': {schema: {type: 'object', properties: {previewToken: {type: 'string'}}}}},
  })
  async regeneratePreviewToken(
    @param.path.string('id') id: string,
  ): Promise<{previewToken: string}> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const token = await this.cmsContentService.generatePreviewToken(tenantId, id);
    this.logger.info(this.buildLogContext(tenantId, {contentId: id}), 'cms preview token regenerated');
    return {previewToken: token};
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @get('/tenant/cms/contents/{id}/revisions')
  @response(200, {
    description: 'List revisions for CMS content',
    content: {'application/json': {schema: {type: 'array', items: {type: 'object'}}}},
  })
  async listRevisions(@param.path.string('id') id: string): Promise<CmsContentRevision[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const content = await this.cmsContentRepository.findById(id);
    this.ensureOwnership(content, tenantId);

    return this.revisionRepository.find({
      where: {cmsContentId: id},
      order: ['version DESC'],
    });
  }

  private ensureOwnership(content: CmsContent, tenantId: string): void {
    if (sanitizeTenantId(content.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Content does not belong to this tenant');
    }
  }

  private extractUserId(strict = false): string | undefined {
    const userFromRequest = (this.request as Request & {user?: {id?: string}}).user;
    const profile = this.currentUserProfile;
    const userId =
      profile?.[securityId] ?? (profile as {id?: string} | undefined)?.id ?? userFromRequest?.id;

    if (!userId && strict) {
      throw new HttpErrors.InternalServerError('Authenticated user context missing');
    }

    return userId;
  }

  private buildLogContext(
    tenantId: string,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      tenantId,
      method: this.request.method,
      path: this.request.originalUrl ?? this.request.url,
      ...extra,
    };
  }
}
