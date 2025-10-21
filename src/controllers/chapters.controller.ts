import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject} from '@loopback/core';
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
import {Logger} from 'pino';
import {LoggingBindings} from '../bindings/keys';
import {Chapter, Module} from '../models';
import {ChapterRepository, CourseRepository, ModuleRepository} from '../repositories';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const CHAPTER_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    title: {type: 'string'},
    summary: {type: 'string'},
    contentType: {type: 'string'},
    contentUrl: {type: 'string'},
    durationMinutes: {type: 'number'},
    moduleId: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
  },
};

const CHAPTER_CREATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['title'],
  properties: {
    title: {type: 'string', minLength: 1},
    summary: {type: 'string'},
    contentType: {
      type: 'string',
      enum: ['live', 'recorded', 'article', 'resource'],
      default: 'recorded',
    },
    contentUrl: {type: 'string'},
    durationMinutes: {type: 'number', minimum: 0},
  },
};

const CHAPTER_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    title: {type: 'string', minLength: 1},
    summary: {type: 'string'},
    contentType: {
      type: 'string',
      enum: ['live', 'recorded', 'article', 'resource'],
    },
    contentUrl: {type: 'string'},
    durationMinutes: {type: 'number', minimum: 0},
  },
};

interface ChapterCreateRequest {
  title: string;
  summary?: string;
  contentType?: string;
  contentUrl?: string;
  durationMinutes?: number;
}

interface ChapterUpdateRequest extends Partial<ChapterCreateRequest> { }

interface ChapterView {
  id?: string;
  title: string;
  summary?: string;
  contentType?: string;
  contentUrl?: string;
  durationMinutes?: number;
  moduleId: string;
  createdAt?: string;
  updatedAt?: string;
}

@authenticate('jwt')
export class ChaptersController {
  constructor(
    @repository(ChapterRepository)
    private readonly chapterRepository: ChapterRepository,
    @repository(ModuleRepository)
    private readonly moduleRepository: ModuleRepository,
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/modules/{moduleId}/chapters')
  @response(201, {
    description: 'Create a chapter within a module',
    content: {'application/json': {schema: CHAPTER_VIEW_SCHEMA}},
  })
  async createChapter(
    @param.path.string('moduleId') moduleId: string,
    @requestBody({content: {'application/json': {schema: CHAPTER_CREATE_SCHEMA}}})
    body: ChapterCreateRequest,
  ): Promise<ChapterView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, tenantId);

    const chapter = await this.chapterRepository.create({
      title: body.title,
      summary: body.summary,
      contentType: body.contentType ?? 'recorded',
      contentUrl: body.contentUrl,
      durationMinutes: body.durationMinutes,
      moduleId,
    });

    this.logger.info(
      this.buildLogContext(tenantId, {
        moduleId,
        chapterId: chapter.id,
      }),
      'chapter created',
    );

    return this.toView(chapter);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/modules/{moduleId}/chapters')
  @response(200, {
    description: 'List chapters for a module',
    content: {
      'application/json': {
        schema: {type: 'array', items: CHAPTER_VIEW_SCHEMA},
      },
    },
  })
  async listChapters(
    @param.path.string('moduleId') moduleId: string,
  ): Promise<ChapterView[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, tenantId);

    const filter: Filter<Chapter> = {
      where: {moduleId},
      order: ['createdAt ASC'],
    };

    const chapters = await this.chapterRepository.find(filter);
    const result = chapters.map(chapter => this.toView(chapter));

    this.logger.info(
      this.buildLogContext(tenantId, {
        moduleId,
        resultCount: result.length,
      }),
      'chapters listed',
    );

    return result;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/modules/{moduleId}/chapters/{chapterId}')
  @response(200, {
    description: 'Retrieve a specific chapter',
    content: {'application/json': {schema: CHAPTER_VIEW_SCHEMA}},
  })
  async getChapter(
    @param.path.string('moduleId') moduleId: string,
    @param.path.string('chapterId') chapterId: string,
  ): Promise<ChapterView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const chapter = await this.chapterRepository.findById(chapterId);
    await this.ensureChapterAccess(chapter, moduleId, tenantId);

    this.logger.debug(
      this.buildLogContext(tenantId, {
        moduleId,
        chapterId,
      }),
      'chapter retrieved',
    );

    return this.toView(chapter);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @patch('/tenant/modules/{moduleId}/chapters/{chapterId}')
  @response(200, {
    description: 'Update a chapter',
    content: {'application/json': {schema: CHAPTER_VIEW_SCHEMA}},
  })
  async updateChapter(
    @param.path.string('moduleId') moduleId: string,
    @param.path.string('chapterId') chapterId: string,
    @requestBody({content: {'application/json': {schema: CHAPTER_UPDATE_SCHEMA}}})
    body: ChapterUpdateRequest,
  ): Promise<ChapterView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const chapter = await this.chapterRepository.findById(chapterId);
    await this.ensureChapterAccess(chapter, moduleId, tenantId);

    const updateData: Partial<Chapter> = {};
    if (body.title) {
      updateData.title = body.title;
    }
    if (body.summary !== undefined) {
      updateData.summary = body.summary;
    }
    if (body.contentType !== undefined) {
      updateData.contentType = body.contentType;
    }
    if (body.contentUrl !== undefined) {
      updateData.contentUrl = body.contentUrl;
    }
    if (body.durationMinutes !== undefined) {
      updateData.durationMinutes = body.durationMinutes;
    }

    if (Object.keys(updateData).length === 0) {
      this.logger.debug(
        this.buildLogContext(tenantId, {
          moduleId,
          chapterId,
          noChanges: true,
        }),
        'chapter update skipped',
      );
      return this.toView(chapter);
    }

    updateData.updatedAt = new Date().toISOString();
    await this.chapterRepository.updateById(chapterId, updateData);

    const updated = await this.chapterRepository.findById(chapterId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        moduleId,
        chapterId,
        updatedFields: Object.keys(updateData),
      }),
      'chapter updated',
    );

    return this.toView(updated);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @del('/tenant/modules/{moduleId}/chapters/{chapterId}')
  @response(204, {
    description: 'Delete a chapter',
  })
  async deleteChapter(
    @param.path.string('moduleId') moduleId: string,
    @param.path.string('chapterId') chapterId: string,
  ): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const chapter = await this.chapterRepository.findById(chapterId);
    await this.ensureChapterAccess(chapter, moduleId, tenantId);

    await this.chapterRepository.deleteById(chapterId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        moduleId,
        chapterId,
      }),
      'chapter deleted',
    );
  }

  private async ensureChapterAccess(
    chapter: Chapter,
    moduleId: string,
    tenantId: string,
  ): Promise<void> {
    const chapterModuleId = this.normalizeId(chapter.moduleId);
    const targetModuleId = this.normalizeId(moduleId);
    if (chapterModuleId !== targetModuleId) {
      throw new HttpErrors.Forbidden('Chapter does not belong to the specified module');
    }

    const module = await this.moduleRepository.findById(chapterModuleId);
    await this.ensureModuleAccess(module, tenantId);
  }

  private async ensureModuleAccess(
    module: Module,
    tenantId: string,
  ): Promise<void> {
    const moduleCourseId = this.normalizeId(module.courseId);
    const course = await this.courseRepository.findById(moduleCourseId);
    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course record is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Target module does not belong to this tenant');
    }
  }

  private toView(chapter: Chapter): ChapterView {
    return {
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      contentType: chapter.contentType,
      contentUrl: chapter.contentUrl,
      durationMinutes: chapter.durationMinutes,
      moduleId: this.normalizeId(chapter.moduleId),
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    };
  }

  private buildLogContext(
    tenantId: string,
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      tenantId,
      method: this.request.method,
      path: this.request.originalUrl ?? this.request.url,
      correlationId: this.getCorrelationId(),
      ...extra,
    };
  }

  private getCorrelationId(): string | undefined {
    const requestId = this.request.headers['x-request-id'];
    if (Array.isArray(requestId)) {
      return requestId[0];
    }

    const correlationId = this.request.headers['x-correlation-id'];
    if (Array.isArray(correlationId)) {
      return correlationId[0];
    }

    return requestId ?? correlationId;
  }

  private normalizeId(id: unknown): string {
    if (typeof id === 'string') {
      return id;
    }

    if (id && typeof id === 'object' && 'toString' in id) {
      return String(id);
    }

    return String(id ?? '');
  }
}
