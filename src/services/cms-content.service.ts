import {BindingScope, inject, injectable} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {randomBytes} from 'crypto';
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

export interface CmsContentRequest {
  section: string;
  blockType: string;
  slug?: string;
  locale?: string;
  title?: string;
  body?: string;
  imageUrl?: string;
  excerpt?: string;
  tags?: string[];
  order?: number;
  metadata?: Record<string, unknown>;
  seoTitle?: string;
  seoDescription?: string;
  publishAt?: string;
  unpublishAt?: string;
  isPublic?: boolean;
}

@injectable({scope: BindingScope.TRANSIENT})
export class CmsContentService {
  constructor(
    @repository(CmsContentRepository)
    private readonly cmsContentRepository: CmsContentRepository,
    @repository(CmsContentRevisionRepository)
    private readonly revisionRepository: CmsContentRevisionRepository,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  async createDraft(
    tenantId: string,
    payload: CmsContentRequest,
    actorId?: string,
  ): Promise<CmsContent> {
    await this.ensureUniqueSlug(tenantId, payload.slug, payload.locale ?? 'en');
    const normalizedSlug = payload.slug ? this.normalizeSlug(payload.slug) : undefined;
    const tags = payload.tags?.map(tag => tag.trim()).filter(Boolean);

    const content = await this.cmsContentRepository.create({
      ...payload,
      slug: normalizedSlug,
      tags,
      tenantId,
      locale: payload.locale ?? 'en',
      status: 'draft',
      version: 1,
      previewToken: this.createPreviewTokenString(),
    });

    await this.saveRevision(content, actorId);
    return content;
  }

  async updateDraft(
    tenantId: string,
    id: string,
    payload: Partial<CmsContentRequest>,
    actorId?: string,
  ): Promise<CmsContent> {
    const content = await this.loadForTenant(tenantId, id);

    if (payload.slug || payload.locale) {
      const nextSlug = payload.slug ?? content.slug;
      const nextLocale = payload.locale ?? content.locale ?? 'en';
      await this.ensureUniqueSlug(tenantId, nextSlug, nextLocale, id);
    }

    const normalizedSlug = payload.slug ? this.normalizeSlug(payload.slug) : undefined;
    const tags = payload.tags?.map(tag => tag.trim()).filter(Boolean);
    const version = (content.version ?? 1) + 1;
    await this.cmsContentRepository.updateById(id, {
      ...payload,
      slug: normalizedSlug ?? payload.slug ?? content.slug,
      tags: tags ?? payload.tags ?? content.tags,
      version,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.cmsContentRepository.findById(id);
    await this.saveRevision(updated, actorId);

    return updated;
  }

  async publish(
    tenantId: string,
    id: string,
    actorId: string,
    publishAt?: string,
  ): Promise<CmsContent> {
    const content = await this.loadForTenant(tenantId, id);
    if (content.status === 'archived') {
      throw new HttpErrors.BadRequest('Archived content cannot be published');
    }

    const publishTimestamp = publishAt ?? new Date().toISOString();
    await this.cmsContentRepository.updateById(id, {
      status: publishAt ? 'scheduled' : 'published',
      publishAt: publishAt ?? undefined,
      publishedAt: publishAt ? undefined : publishTimestamp,
      publishedBy: actorId,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.cmsContentRepository.findById(id);
    await this.saveRevision(updated, actorId);
    return updated;
  }

  async unpublish(
    tenantId: string,
    id: string,
    actorId: string,
  ): Promise<CmsContent> {
    const content = await this.loadForTenant(tenantId, id);
    if (content.status === 'archived') {
      return content;
    }

    await this.cmsContentRepository.updateById(id, {
      status: 'draft',
      publishedAt: undefined,
      publishAt: undefined,
      unpublishAt: undefined,
      updatedAt: new Date().toISOString(),
    });

    const updated = await this.cmsContentRepository.findById(id);
    await this.saveRevision(updated, actorId);
    return updated;
  }

  async archive(tenantId: string, id: string, actorId: string): Promise<void> {
    const content = await this.loadForTenant(tenantId, id);
    if (content.status === 'archived') {
      return;
    }

    await this.cmsContentRepository.updateById(id, {
      status: 'archived',
      updatedAt: new Date().toISOString(),
    });

    await this.saveRevision(
      await this.cmsContentRepository.findById(id),
      actorId,
    );
  }

  async listPublished(
    tenantId: string,
    filter?: Filter<CmsContent>,
  ): Promise<CmsContent[]> {
    const now = new Date().toISOString();
    const baseWhere = {
      tenantId,
      status: 'published',
      isPublic: true,
      or: [
        {publishAt: undefined},
        {publishAt: {lte: now}},
      ],
      or2: [
        {unpublishAt: undefined},
        {unpublishAt: {gt: now}},
      ],
    };

    const finalFilter: Filter<CmsContent> = {
      where: {...baseWhere, ...(filter?.where ?? {})},
      order: filter?.order ?? ['order ASC', 'createdAt DESC'],
      fields: filter?.fields,
      limit: filter?.limit,
      offset: filter?.offset,
    };

    // LoopBack doesn't support two OR keys, flatten logic manually.
    finalFilter.where = {
      and: [
        {tenantId},
        {status: 'published'},
        {isPublic: true},
        {
          or: [{publishAt: undefined}, {publishAt: {lte: now}}],
        },
        {
          or: [{unpublishAt: undefined}, {unpublishAt: {gt: now}}],
        },
        ...(filter?.where ? [filter.where] : []),
      ],
    } as Record<string, unknown>;

    return this.cmsContentRepository.find(finalFilter);
  }

  async generatePreviewToken(tenantId: string, id: string): Promise<string> {
    const content = await this.cmsContentRepository.findById(id);
    if (content.tenantId !== tenantId) {
      throw new HttpErrors.Forbidden('Content does not belong to this tenant');
    }

    const previewToken = this.createPreviewTokenString();
    await this.cmsContentRepository.updateById(id, {
      previewToken,
      updatedAt: new Date().toISOString(),
    });

    return previewToken;
  }

  private async loadForTenant(tenantId: string, id: string): Promise<CmsContent> {
    const content = await this.cmsContentRepository.findById(id);
    if (!content || content.tenantId !== tenantId) {
      throw new HttpErrors.Forbidden('Content does not belong to this tenant');
    }

    return content;
  }

  private async ensureUniqueSlug(
    tenantId: string,
    slug: string | undefined,
    locale: string,
    currentId?: string,
  ): Promise<void> {
    if (!slug) {
      return;
    }

    const normalizedSlug = slug.trim().toLowerCase();
    const existing = await this.cmsContentRepository.findOne({
      where: {
        tenantId,
        slug: normalizedSlug,
        locale,
        id: currentId ? {neq: currentId} : undefined,
      },
    });

    if (existing) {
      throw new HttpErrors.BadRequest('Slug already in use for this locale');
    }
  }

  private async saveRevision(
    content: CmsContent,
    actorId?: string,
  ): Promise<CmsContentRevision> {
    const snapshot: Record<string, unknown> = {
      ...content,
      id: undefined,
    };

    const revision = await this.revisionRepository.create({
      cmsContentId: content.id!,
      tenantId: content.tenantId,
      version: content.version ?? 1,
      snapshot,
      createdBy: actorId,
    });

    this.logger.debug(
      {contentId: content.id, version: revision.version},
      'cms content revision saved',
    );

    return revision;
  }

  private createPreviewTokenString(): string {
    return randomBytes(12).toString('hex');
  }

  private normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase().replace(/\s+/g, '-');
  }
}
