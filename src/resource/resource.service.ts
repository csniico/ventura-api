import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Resource,
  ResourceDocument,
  ResourceType,
} from './schemas/resource.schema';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { FileStorageService } from '../file-storage/file-storage.service';
import { Paginated, normalizePaging, paginate } from '../common/dto/paginated';
import { escapeRegex } from '../common/util/escape-regex';

@Injectable()
export class ResourceService {
  private readonly logger = new Logger(ResourceService.name);

  constructor(
    @InjectModel(Resource.name)
    private readonly resourceModel: Model<ResourceDocument>,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** Reject type-specific fields that don't belong to the given type. */
  private assertFieldsMatchType(
    type: ResourceType,
    fields: {
      availableQuantity?: number;
      lowStockThreshold?: number;
      businessHours?: unknown;
    },
  ): void {
    if (type === ResourceType.SERVICE) {
      if (fields.availableQuantity !== undefined) {
        throw new BadRequestException(
          'availableQuantity is not valid for a service.',
        );
      }
      if (fields.lowStockThreshold !== undefined) {
        throw new BadRequestException(
          'lowStockThreshold is not valid for a service.',
        );
      }
    }
    if (type === ResourceType.PRODUCT && fields.businessHours !== undefined) {
      throw new BadRequestException(
        'businessHours is not valid for a product.',
      );
    }
  }

  /** Create a product or service for a business. */
  async create(
    businessId: string,
    dto: CreateResourceDto,
  ): Promise<ResourceDocument> {
    this.assertFieldsMatchType(dto.type, dto);
    return this.resourceModel.create({ ...dto, businessId });
  }

  /**
   * List a business's resources, newest first, paginated. Optionally filter by
   * type (product | service). Optional `q` matches (case-insensitive) name.
   */
  async list(
    businessId: string,
    opts: {
      page?: number;
      limit?: number;
      q?: string;
      type?: ResourceType;
    } = {},
  ): Promise<Paginated<ResourceDocument>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit);
    const query: Record<string, unknown> = { businessId };
    if (opts.type) query.type = opts.type;
    if (opts.q?.trim()) {
      const rx = new RegExp(escapeRegex(opts.q.trim()), 'i');
      query.name = rx;
    }

    const [data, total] = await Promise.all([
      this.resourceModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.resourceModel.countDocuments(query).exec(),
    ]);

    return paginate(data, total, page, limit);
  }

  /** Get a resource by id, scoped to the business. */
  async getById(
    businessId: string,
    resourceId: string,
  ): Promise<ResourceDocument> {
    const resource = await this.resourceModel
      .findOne({ _id: resourceId, businessId })
      .exec();
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    return resource;
  }

  /** Best-effort cleanup of a replaced S3 object. Never throws. */
  private async deleteObject(key: string): Promise<void> {
    try {
      await this.fileStorageService.deleteFile(key);
    } catch (error) {
      this.logger.error(`Failed to delete old image ${key}`, error);
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
  ): Promise<ResourceDocument> {
    const resource = await this.getById(businessId, resourceId);
    this.assertFieldsMatchType(resource.type, dto);

    const oldPrimaryImageKey = resource.primaryImageKey;
    const oldSupportingImageKeys = [...(resource.supportingImageKeys ?? [])];

    Object.assign(resource, dto);
    const saved = await resource.save();

    // Clean up the previous primary image object if it was replaced.
    if (
      dto.primaryImageKey !== undefined &&
      oldPrimaryImageKey &&
      oldPrimaryImageKey !== dto.primaryImageKey
    ) {
      await this.deleteObject(oldPrimaryImageKey);
    }

    // Clean up supporting image objects that were removed from the array.
    if (dto.supportingImageKeys !== undefined) {
      const newKeys = new Set(dto.supportingImageKeys);
      const removedKeys = oldSupportingImageKeys.filter(
        (key) => !newKeys.has(key),
      );
      for (const key of removedKeys) {
        await this.deleteObject(key);
      }
    }

    return saved;
  }

  /** Delete a resource, scoped to the business. */
  async delete(
    businessId: string,
    resourceId: string,
  ): Promise<ResourceDocument> {
    const resource = await this.resourceModel
      .findOneAndDelete({ _id: resourceId, businessId })
      .exec();
    if (!resource) {
      throw new NotFoundException('Resource not found.');
    }
    return resource;
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
    const result = await this.resourceModel
      .updateOne(
        {
          _id: resourceId,
          businessId,
          type: ResourceType.PRODUCT,
          availableQuantity: { $gte: quantity },
        },
        { $inc: { availableQuantity: -quantity } },
      )
      .exec();
    return result.modifiedCount === 1;
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
    await this.resourceModel
      .updateOne(
        { _id: resourceId, businessId, type: ResourceType.PRODUCT },
        { $inc: { availableQuantity: quantity } },
      )
      .exec();
  }
}
