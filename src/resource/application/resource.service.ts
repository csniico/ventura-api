import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  normalizePaging,
  Paginated,
  paginate,
} from '../../common/dto/paginated'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { IResource, ResourceType } from '../domain/resource.entity'
import type { ResourceRepository } from '../domain/resource.repository'
import { RESOURCE_DATA_SOURCE } from '../domain/resource.repository'
import { CreateResourceDto } from '../dto/create-resource.dto'
import { UpdateResourceDto } from '../dto/update-resource.dto'

/**
 * Postgres-backed resource service. Data access goes through the
 * `ResourceRepository` abstraction (DIP); business rules (type validation, image
 * cleanup) live here, and the atomic stock operations delegate to single-query
 * repository methods. Every operation is scoped to a `businessId`. Methods
 * return the domain `IResource`; mapping to `ResourceResponse` happens at the
 * controller boundary.
 */
@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name)

  constructor(
    @Inject(RESOURCE_DATA_SOURCE)
    private readonly resourceRepository: ResourceRepository,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** Reject type-specific fields that don't belong to the given type. */
  private assertFieldsMatchType(
    type: ResourceType,
    fields: {
      availableQuantity?: number
      lowStockThreshold?: number
      businessHours?: unknown
    },
  ): void {
    if (type === ResourceType.SERVICE) {
      if (fields.availableQuantity !== undefined) {
        throw new BadRequestException(
          'availableQuantity is not valid for a service.',
        )
      }
      if (fields.lowStockThreshold !== undefined) {
        throw new BadRequestException(
          'lowStockThreshold is not valid for a service.',
        )
      }
    }
    if (type === ResourceType.PRODUCT && fields.businessHours !== undefined) {
      throw new BadRequestException('businessHours is not valid for a product.')
    }
  }

  /** Create a product or service for a business. */
  async create(businessId: string, dto: CreateResourceDto): Promise<IResource> {
    this.assertFieldsMatchType(dto.type, dto)
    return await this.resourceRepository.create({ businessId, ...dto })
  }

  /**
   * List a business's resources, newest first, paginated. Optionally filter by
   * type (product | service). Optional `q` matches (case-insensitive) name.
   */
  async list(
    businessId: string,
    opts: {
      page?: number
      limit?: number
      q?: string
      type?: ResourceType
    } = {},
  ): Promise<Paginated<IResource>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit)
    const { data, total } = await this.resourceRepository.list(businessId, {
      skip,
      limit,
      q: opts.q,
      type: opts.type,
    })
    return paginate(data, total, page, limit)
  }

  /** Get a resource by id, scoped to the business. */
  async getById(businessId: string, resourceId: string): Promise<IResource> {
    const resource = await this.resourceRepository.findById(
      businessId,
      resourceId,
    )
    if (!resource) {
      throw new NotFoundException('Resource not found.')
    }
    return resource
  }

  /** Best-effort cleanup of a replaced S3 object. Never throws. */
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.fileStorageService.deleteFile(key)
    } catch (error) {
      this.logger.error(`Failed to delete old image ${key}`, error)
    }
  }

  /**
   * Update a resource, validating fields against its (immutable) type. When an
   * image key is replaced (primaryImageKey) or removed (supportingImageKeys),
   * the corresponding old S3 object(s) are cleaned up best-effort.
   */
  async update(
    businessId: string,
    resourceId: string,
    dto: UpdateResourceDto,
  ): Promise<IResource> {
    const resource = await this.getById(businessId, resourceId)
    this.assertFieldsMatchType(resource.type, dto)

    const oldPrimaryImageKey = resource.primaryImageKey
    const oldSupportingImageKeys = [...(resource.supportingImageKeys ?? [])]

    const updated = await this.resourceRepository.update(
      businessId,
      resourceId,
      dto,
    )
    const saved = updated ?? resource

    // Clean up the previous primary image object if it was replaced.
    if (
      dto.primaryImageKey !== undefined &&
      oldPrimaryImageKey &&
      oldPrimaryImageKey !== dto.primaryImageKey
    ) {
      await this.deleteObject(oldPrimaryImageKey)
    }

    // Clean up supporting image objects that were removed from the array.
    if (dto.supportingImageKeys !== undefined) {
      const newKeys = new Set(dto.supportingImageKeys)
      const removedKeys = oldSupportingImageKeys.filter(
        (key) => !newKeys.has(key),
      )
      for (const key of removedKeys) {
        await this.deleteObject(key)
      }
    }

    return saved
  }

  /** Delete a resource, scoped to the business. */
  async delete(businessId: string, resourceId: string): Promise<IResource> {
    const removed = await this.resourceRepository.delete(businessId, resourceId)
    if (!removed) {
      throw new NotFoundException('Resource not found.')
    }
    return removed
  }

  /**
   * Atomically decrement a product's stock by `quantity`, only if enough is
   * available. Returns true on success, false if stock was insufficient (or the
   * resource isn't a product). Used by the order flow on creation.
   */
  async decrementStock(
    businessId: string,
    resourceId: string,
    quantity: number,
  ): Promise<boolean> {
    return await this.resourceRepository.decrementStock(
      businessId,
      resourceId,
      quantity,
    )
  }

  /**
   * Restore a product's stock by `quantity` (e.g. when an order is cancelled).
   * No-op for non-product resources.
   */
  async incrementStock(
    businessId: string,
    resourceId: string,
    quantity: number,
  ): Promise<void> {
    await this.resourceRepository.incrementStock(
      businessId,
      resourceId,
      quantity,
    )
  }

  /** Count products at or below their low-stock threshold (for the dashboard). */
  async countLowStock(businessId: string): Promise<number> {
    return await this.resourceRepository.countLowStock(businessId)
  }
}
