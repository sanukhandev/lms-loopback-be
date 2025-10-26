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
  get,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {SecurityBindings, UserProfile, securityId} from '@loopback/security';
import {Logger} from 'pino';
import {CommissionCalculator, LoggingBindings, PaymentBindings} from '../bindings/keys';
import {AttachmentMetadata, AttachmentMetadataSchema, Course} from '../models';
import {CourseRepository, UserRepository} from '../repositories';
import {DropboxAttachmentService} from '../services/dropbox-attachment.service';
import {DEFAULT_MAX_UPLOAD_SIZE, parseSingleFileUpload} from '../utils/multipart';
import {extractTenantId, sanitizeTenantId} from '../utils/tenant';

const COURSE_VIEW_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    id: {type: 'string'},
    title: {type: 'string'},
    description: {type: 'string'},
    category: {type: 'string'},
    price: {type: 'number'},
    salePrice: {type: 'number'},
    platformFee: {type: 'number'},
    published: {type: 'boolean'},
    status: {type: 'string'},
    startDate: {type: 'string', format: 'date-time'},
    endDate: {type: 'string', format: 'date-time'},
    tenantId: {type: 'string'},
    instructorId: {type: 'string'},
    createdAt: {type: 'string', format: 'date-time'},
    updatedAt: {type: 'string', format: 'date-time'},
    attachments: {type: 'array', items: AttachmentMetadataSchema},
  },
};

const COURSE_CREATE_SCHEMA: SchemaObject = {
  type: 'object',
  required: ['title'],
  properties: {
    title: {type: 'string', minLength: 1},
    description: {type: 'string'},
    category: {type: 'string'},
    price: {type: 'number', minimum: 0},
    salePrice: {type: 'number', minimum: 0},
    platformFee: {type: 'number', minimum: 0, readOnly: true},
    published: {type: 'boolean'},
    status: {
      type: 'string',
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    startDate: {type: 'string', format: 'date-time'},
    endDate: {type: 'string', format: 'date-time'},
    instructorId: {type: 'string'},
  },
};

const COURSE_UPDATE_SCHEMA: SchemaObject = {
  type: 'object',
  properties: {
    title: {type: 'string', minLength: 1},
    description: {type: 'string'},
    category: {type: 'string'},
    price: {type: 'number', minimum: 0},
    salePrice: {type: 'number', minimum: 0},
    platformFee: {type: 'number', minimum: 0, readOnly: true},
    published: {type: 'boolean'},
    status: {
      type: 'string',
      enum: ['draft', 'published', 'archived'],
    },
    startDate: {type: 'string', format: 'date-time'},
    endDate: {type: 'string', format: 'date-time'},
    instructorId: {type: 'string'},
  },
};

interface CourseCreateRequest {
  title: string;
  description?: string;
  category?: string;
  price?: number;
  salePrice?: number;
  published?: boolean;
  status?: string;
  startDate?: string;
  endDate?: string;
  instructorId?: string;
}

interface CourseUpdateRequest extends Partial<CourseCreateRequest> { }

interface CourseView {
  id?: string;
  title: string;
  description?: string;
  category?: string;
  price?: number;
  salePrice?: number;
  platformFee?: number;
  published?: boolean;
  status?: string;
  startDate?: string;
  endDate?: string;
  tenantId: string;
  instructorId?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments?: AttachmentMetadata[];
}

@authenticate('jwt')
export class CoursesController {
  constructor(
    @repository(CourseRepository)
    private readonly courseRepository: CourseRepository,
    @repository(UserRepository)
    private readonly userRepository: UserRepository,
    @inject(RestBindings.Http.REQUEST)
    private readonly request: Request,
    @inject(LoggingBindings.LOGGER)
    private readonly logger: Logger,
    @inject(PaymentBindings.COMMISSION_SERVICE)
    private readonly commissionCalculator: CommissionCalculator,
    @service(DropboxAttachmentService)
    private readonly dropboxAttachmentService: DropboxAttachmentService,
    @inject(SecurityBindings.USER, {optional: true})
    private readonly currentUserProfile?: UserProfile,
  ) { }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/courses')
  @response(201, {
    description: 'Create a course within the current tenant',
    content: {'application/json': {schema: COURSE_VIEW_SCHEMA}},
  })
  async createCourse(
    @requestBody({content: {'application/json': {schema: COURSE_CREATE_SCHEMA}}})
    body: CourseCreateRequest,
  ): Promise<CourseView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    this.validateDates(body.startDate, body.endDate);

    let instructorId: string | undefined;
    if (body.instructorId) {
      const instructor = await this.userRepository.findById(body.instructorId);
      this.ensureInstructorEligibility(instructor, tenantId);
      instructorId = instructor.id;
    }

    const platformFee = this.calculatePlatformFee(body.price, body.salePrice);

    const course = await this.courseRepository.create({
      title: body.title,
      description: body.description,
      category: body.category,
      price: body.price,
      salePrice: body.salePrice,
      platformFee,
      published: body.published ?? false,
      status: this.validateStatus(body.status) ?? 'draft',
      startDate: body.startDate,
      endDate: body.endDate,
      tenantId,
      instructorId,
    });

    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId: course.id,
        instructorId,
        status: course.status,
        published: course.published,
        price: course.price,
        salePrice: course.salePrice,
        platformFee: course.platformFee,
      }),
      'course created',
    );

    return this.toView(course);
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @post('/tenant/courses/{courseId}/attachments')
  @response(201, {
    description: 'Upload an attachment for a course',
    content: {'application/json': {schema: AttachmentMetadataSchema}},
  })
  async uploadCourseAttachment(
    @param.path.string('courseId') courseId: string,
    @requestBody.file({
      required: true,
      description: 'Multipart form containing a single "file" field for the attachment',
    })
    request: Request,
    @inject(RestBindings.Http.RESPONSE)
    response: Response,
  ): Promise<AttachmentMetadata> {
    const rawTenantId = extractTenantId(this.request);
    const tenantId = sanitizeTenantId(rawTenantId);
    const {file, fields} = await parseSingleFileUpload(request, response, {
      maxFileSizeBytes: this.getAttachmentMaxSize(),
    });

    const displayName =
      this.extractFieldValue(fields['displayName']) ??
      this.extractFieldValue(fields['name']) ??
      undefined;

    const attachment = await this.dropboxAttachmentService.uploadCourseAttachment(
      rawTenantId,
      courseId,
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
        attachmentId: attachment.id,
        dropboxPath: attachment.dropboxPath,
      }),
      'course attachment uploaded',
    );

    return attachment;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @get('/tenant/courses')
  @response(200, {
    description: 'List courses for the current tenant',
    content: {
      'application/json': {
        schema: {type: 'array', items: COURSE_VIEW_SCHEMA},
      },
    },
  })
  async listCourses(
    @param.query.string('status') status?: string,
    @param.query.boolean('published') published?: boolean,
  ): Promise<CourseView[]> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const filter: Filter<Course> = {
      where: {
        tenantId,
      },
      order: ['createdAt DESC'],
    };

    if (status) {
      filter.where = {
        ...filter.where,
        status,
      };
    }

    if (published !== undefined) {
      filter.where = {
        ...filter.where,
        published,
      };
    }

    const courses = await this.courseRepository.find(filter);
    const result = courses.map(course => this.toView(course));

    this.logger.info(
      this.buildLogContext(tenantId, {
        statusFilter: status,
        publishedFilter: published,
        resultCount: result.length,
      }),
      'courses listed',
    );

    return result;
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @get('/tenant/courses/{id}')
  @response(200, {
    description: 'Retrieve a specific course',
    content: {'application/json': {schema: COURSE_VIEW_SCHEMA}},
  })
  async getCourse(
    @param.path.string('id') id: string,
  ): Promise<CourseView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(id);
    this.ensureCourseAccess(course, tenantId);
    this.logger.debug(
      this.buildLogContext(tenantId, {
        courseId: course.id,
      }),
      'course retrieved',
    );
    return this.toView(course);
  }

  @authorize({allowedRoles: ['tenantAdmin']})
  @patch('/tenant/courses/{id}')
  @response(200, {
    description: 'Update a course',
    content: {'application/json': {schema: COURSE_VIEW_SCHEMA}},
  })
  async updateCourse(
    @param.path.string('id') id: string,
    @requestBody({content: {'application/json': {schema: COURSE_UPDATE_SCHEMA}}})
    body: CourseUpdateRequest,
  ): Promise<CourseView> {
    const tenantId = sanitizeTenantId(extractTenantId(this.request));
    const course = await this.courseRepository.findById(id);
    this.ensureCourseAccess(course, tenantId);

    this.validateDates(body.startDate ?? course.startDate, body.endDate ?? course.endDate);

    const updateData: Partial<Course> = {};
    if (body.title) {
      updateData.title = body.title;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.category !== undefined) {
      updateData.category = body.category;
    }
    if (body.price !== undefined) {
      updateData.price = body.price;
    }
    if (body.salePrice !== undefined) {
      updateData.salePrice = body.salePrice;
    }
    if (body.published !== undefined) {
      updateData.published = body.published;
    }
    if (body.status) {
      updateData.status = this.validateStatus(body.status);
    }
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate;
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate;
    }

    if (body.instructorId !== undefined) {
      if (body.instructorId === null) {
        updateData.instructorId = undefined;
      } else {
        const instructor = await this.userRepository.findById(body.instructorId);
        this.ensureInstructorEligibility(instructor, tenantId);
        updateData.instructorId = instructor.id;
      }
    }

    if (body.price !== undefined || body.salePrice !== undefined) {
      const nextPrice = body.price !== undefined ? body.price : course.price;
      const nextSalePrice =
        body.salePrice !== undefined ? body.salePrice : course.salePrice;
      updateData.platformFee = this.calculatePlatformFee(
        nextPrice,
        nextSalePrice,
      );
    }

    if (Object.keys(updateData).length === 0) {
      this.logger.debug(
        this.buildLogContext(tenantId, {
          courseId: id,
          noChanges: true,
        }),
        'course update skipped',
      );
      return this.toView(course);
    }

    updateData.updatedAt = new Date().toISOString();
    await this.courseRepository.updateById(id, updateData);

    const updated = await this.courseRepository.findById(id);
    this.logger.info(
      this.buildLogContext(tenantId, {
        courseId: id,
        updatedFields: Object.keys(updateData),
      }),
      'course updated',
    );
    return this.toView(updated);
  }

  private ensureCourseAccess(course: Course, tenantId: string): void {
    if (!course.tenantId) {
      this.logger.error(this.buildLogContext(tenantId, {courseId: course.id}), 'course missing tenant context');
      throw new HttpErrors.BadRequest('Course record is missing tenant context');
    }

    if (sanitizeTenantId(course.tenantId) !== tenantId) {
      this.logger.warn(
        this.buildLogContext(tenantId, {
          courseId: course.id,
          courseTenantId: course.tenantId,
        }),
        'course tenant mismatch',
      );
      throw new HttpErrors.Forbidden('Course does not belong to this tenant');
    }
  }

  private ensureInstructorEligibility(user: any, tenantId: string): void {
    if (!user) {
      throw new HttpErrors.NotFound('Instructor not found');
    }

    if (!user.tenantId || sanitizeTenantId(user.tenantId) !== tenantId) {
      throw new HttpErrors.Forbidden('Instructor does not belong to this tenant');
    }

    const roles = user.roles ?? [];
    if (!roles.includes('instructor') && !roles.includes('tenantAdmin')) {
      throw new HttpErrors.Forbidden('Instructor must have instructor or tenant admin role');
    }
  }

  private validateStatus(status?: string): string | undefined {
    if (!status) {
      return undefined;
    }

    const allowed = ['draft', 'published', 'archived'];
    if (!allowed.includes(status)) {
      throw new HttpErrors.BadRequest(
        `Invalid status value. Allowed values: ${allowed.join(', ')}`,
      );
    }

    return status;
  }

  private validateDates(start?: string, end?: string): void {
    if (!start || !end) {
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
      throw new HttpErrors.BadRequest('Invalid start or end date');
    }

    if (endDate < startDate) {
      throw new HttpErrors.BadRequest('End date cannot be earlier than start date');
    }
  }

  private calculatePlatformFee(
    price?: number,
    salePrice?: number,
  ): number {
    const basis = salePrice ?? price ?? 0;
    if (!basis || basis <= 0) {
      return 0;
    }

    const breakdown = this.commissionCalculator.calculate(basis);
    return Number(breakdown.platformFee.toFixed(2));
  }

  private toView(course: Course): CourseView {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      price: course.price,
      salePrice: course.salePrice,
      platformFee: course.platformFee,
      published: course.published,
      status: course.status,
      startDate: course.startDate,
      endDate: course.endDate,
      tenantId: course.tenantId,
      instructorId: course.instructorId,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      attachments: course.attachments,
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
