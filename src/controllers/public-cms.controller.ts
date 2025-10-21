import {service} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {get, param, response} from '@loopback/rest';
import {CmsContent} from '../models';
import {CmsContentService} from '../services/cms-content.service';

export class PublicCmsController {
  constructor(
    @service(CmsContentService)
    private readonly cmsContentService: CmsContentService,
  ) { }

  @get('/public/tenants/{tenantId}/cms')
  @response(200, {
    description: 'List published CMS content for tenant',
    content: {'application/json': {schema: {type: 'array'}}},
  })
  async listPublished(
    @param.path.string('tenantId') tenantId: string,
    @param.query.string('section') section?: string,
    @param.query.string('locale') locale?: string,
  ): Promise<CmsContent[]> {
    const filter: Filter<CmsContent> = {
      where: {
        ...(section ? {section} : {}),
        ...(locale ? {locale} : {}),
      },
      order: ['order ASC', 'updatedAt DESC'],
    };

    return this.cmsContentService.listPublished(tenantId, filter);
  }

  @get('/public/tenants/{tenantId}/cms/{slug}')
  @response(200, {
    description: 'Get published CMS content by slug',
    content: {'application/json': {schema: {type: 'object'}}},
  })
  async getPublishedBySlug(
    @param.path.string('tenantId') tenantId: string,
    @param.path.string('slug') slug: string,
    @param.query.string('locale') locale = 'en',
  ): Promise<CmsContent | null> {
    const records = await this.cmsContentService.listPublished(tenantId, {
      where: {slug, locale},
      limit: 1,
    });

    if (!records.length) {
      return null;
    }

    return records[0];
  }
}
