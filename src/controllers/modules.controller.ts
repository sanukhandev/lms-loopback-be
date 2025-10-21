import {authenticate} from '@loopback/authentication';
import {authorize} from '@loopback/authorization';
import {inject, service} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {
  HttpErrors,
  Request,
  Response,
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
import {AttachmentMetadata, AttachmentMetadataSchema, Course, Module} from '../models';
import {CourseRepository, ModuleRepository} from '../repositories';
import {DropboxAttachmentService} from '../services/dropbox-attachment.service';
import {DEFAULT_MAX_UPLOAD_SIZE, parseSingleFileUpload} from '../utils/multipart';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const MODULE_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    title: {type: 'string'},
    description: {type: 'string'},
    ordering: {type: 'number'},
    courseId: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
    attachments: {type: 'array', items: AttachmentMetadataSchema},
  },
};

const MODULE_CREATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['title'],
  properties: {
    title: {type: 'string', minLength: 1},
    description: {type: 'string'},
    ordering: {type: 'number'},
  },
};

const MODULE_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    title: {type: 'string', minLength: 1},
    description: {type: 'string'},
    ordering: {type: 'number'},
  },
};

interface ModuleCreateRequest {
  title: string;
  description?: string;
  ordering?: number;
}

interface ModuleUpdateRequest extends Partial<ModuleCreateRequest> { }

interface ModuleView {
  id?: string;
  title: string;
  description?: string;
  ordering?: number;
  courseId: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: AttachmentMetadata[];
}

@authenticate('jwt')
export class ModulesController {
  constructor(
    @repository(ModuleRepository)
    private readonly moduleRepository: ModuleRepository,
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
    @service(DropboxAttachmentService)
    private readonly dropboxAttachmentService: DropboxAttachmentService,
    @inject(SecurityBindings.USER, {optional: true})
    private readonly currentUserProfile?: UserProfile,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/courses/{courseId}/modules')
  @response(201, {
    description: 'Create a module for the given course',
    content: {'application/json': {schema: MODULE_VIEW_SCHEMA}},
  })
  async createModule(
    @param.path.string('courseId') courseId: string,
    @requestBody({content: {'application/json': {schema: MODULE_CREATE_SCHEMA}}})
    body: ModuleCreateRequest,
  ): Promise<ModuleView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(courseId);
    this.ensureCourseAccess(course, tenantId);

    const module = await this.moduleRepository.create({
      title: body.title,
      description: body.description,
      ordering: body.ordering,
      courseId,
    });

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        moduleId: module.id,
      }),
      'module created',
    );

    return this.toView(module);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/courses/{courseId}/modules')
  @response(200, {
    description: 'List modules for a course',
    content: {
      'application/json': {
        schema: {type: 'array', items: MODULE_VIEW_SCHEMA},
      },
    },
  })
  async listModules(
    @param.path.string('courseId') courseId: string,
  ): Promise<ModuleView[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(courseId);
    this.ensureCourseAccess(course, tenantId);

    const filter: Filter<Module> = {
      where: {courseId},
      order: ['ordering ASC', 'createdAt ASC'],
    };

    const modules = await this.moduleRepository.find(filter);
    const result = modules.map(module => this.toView(module));

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        resultCount: result.length,
      }),
      'modules listed',
    );

    return result;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @get('/tenant/courses/{courseId}/modules/{moduleId}')
  @response(200, {
    description: 'Retrieve a specific module',
    content: {'application/json': {schema: MODULE_VIEW_SCHEMA}},
  })
  async getModule(
    @param.path.string('courseId') courseId: string,
    @param.path.string('moduleId') moduleId: string,
  ): Promise<ModuleView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, courseId, tenantId);

    this.logger.debug(
      this.buildLogContext(tenantId, {
        courseId,
        moduleId,
      }),
      'module retrieved',
    );

    return this.toView(module);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @patch('/tenant/courses/{courseId}/modules/{moduleId}')
  @response(200, {
    description: 'Update a module',
    content: {'application/json': {schema: MODULE_VIEW_SCHEMA}},
  })
  async updateModule(
    @param.path.string('courseId') courseId: string,
    @param.path.string('moduleId') moduleId: string,
    @requestBody({content: {'application/json': {schema: MODULE_UPDATE_SCHEMA}}})
    body: ModuleUpdateRequest,
  ): Promise<ModuleView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, courseId, tenantId);

    const updateData: Partial<Module> = {};
    if (body.title) {
      updateData.title = body.title;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.ordering !== undefined) {
      updateData.ordering = body.ordering;
    }

    if (Object.keys(updateData).length === 0) {
      this.logger.debug(
        this.buildLogContext(tenantId, {
          courseId,
          moduleId,
          noChanges: true,
        }),
        'module update skipped',
      );
      return this.toView(module);
    }

    updateData.updatedAt = new Date().toISOString();
    await this.moduleRepository.updateById(moduleId, updateData);

    const updated = await this.moduleRepository.findById(moduleId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        moduleId,
        updatedFields: Object.keys(updateData),
      }),
      'module updated',
    );

    return this.toView(updated);
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @post('/tenant/courses/{courseId}/modules/{moduleId}/attachments')
  @response(201, {
    description: 'Upload an attachment for a module',
    content: {'application/json': {schema: AttachmentMetadataSchema}},
  })
  async uploadModuleAttachment(
    @param.path.string('courseId') courseId: string,
    @param.path.string('moduleId') moduleId: string,
    @requestBody.file({
      required: true,
      description: 'Multipart form with a single "file" field for the attachment',
    })
    request: Request,
    @inject(RestBindings.Http.RESPONSE)
    response: Response,
  ): Promise<AttachmentMetadata> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, courseId, tenantId);

    const {file, fields} = await parseSingleFileUpload(request, response, {
      maxFileSizeBytes: this.getAttachmentMaxSize(),
    });

    const displayName =
      this.extractFieldValue(fields['displayName']) ??
      this.extractFieldValue(fields['name']) ??
      undefined;

    const attachment = await this.dropboxAttachmentService.uploadModuleAttachment(
      tenantId,
      moduleId,
      {
        buffer: file.buffer,
        fileName: file.originalname,
        size: file.size,
        contentType: file.mimetype,
        displayName,
      },
      this.getActorId(),
    );

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        moduleId,
        attachmentId: attachment.id,
        dropboxPath: attachment.dropboxPath,
      }),
      'module attachment uploaded',
    );

    return attachment;
  }

  @authorize({allowedRoles: ['tenantAdmin', 'instructor']})
  @del('/tenant/courses/{courseId}/modules/{moduleId}')
  @response(204, {
    description: 'Delete a module',
  })
  async deleteModule(
    @param.path.string('courseId') courseId: string,
    @param.path.string('moduleId') moduleId: string,
  ): Promise<void> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const module = await this.moduleRepository.findById(moduleId);
    await this.ensureModuleAccess(module, courseId, tenantId);

    await this.moduleRepository.deleteById(moduleId);
    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId,
        moduleId,
      }),
      'module deleted',
    );
  }

  private async ensureModuleAccess(
    module: Module,
    courseId: string,
    tenantId: string,
  ): Promise<void> {
    const moduleCourseId = this.normalizeId(module.courseId);
    if (moduleCourseId !== courseId) {
      throw new HttpErrors.Forbidden('Module does not belong to the specified course');
    }

    const course = await this.courseRepository.findById(moduleCourseId);
    this.ensureCourseAccess(course, tenantId);
  }

  private ensureCourseAccess(course: Course, tenantId: string): void {
    if (!course.tenantId) {
      throw new HttpErrors.BadRequest('Course record is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Course does not belong to this tenant');
    }
  }

  private toView(module: Module): ModuleView {
    return {
      id: module.id,
      title: module.title,
      description: module.description,
      ordering: module.ordering,
      courseId: this.normalizeId(module.courseId),
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      attachments: module.attachments,
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

  private extractFieldValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      const first = value[0];
      return typeof first === 'string' ? first : undefined;
    }
    return undefined;
  }

  private getAttachmentMaxSize(): number {
    const raw = process.env.ATTACHMENT_MAX_BYTES;
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_MAX_UPLOAD_SIZE;
    }
    return parsed;
  }

  private getActorId(): string | undefined {
    const profile = this.currentUserProfile;
    if (!profile) {
      return undefined;
    }
    return profile[securityId];
  }
}
