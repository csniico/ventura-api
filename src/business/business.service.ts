import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { UserService } from '../user/user.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { Business, BusinessDocument } from './schemas/business.schema';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { SUGGESTED_CATEGORIES } from './business.constants';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectModel(Business.name)
    private readonly businessModel: Model<BusinessDocument>,
    private readonly userService: UserService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** Suggested categories for the UI (businesses may also use custom ones). */
  getCategories(): readonly string[] {
    return SUGGESTED_CATEGORIES;
  }

  /**
   * Create a business owned by `ownerId` and link it to the owner's user
   * document. If the owner already has a business, the link fails (409) and
   * the just-created business is rolled back so no orphan is left behind.
   */
  async create(
    ownerId: string,
    dto: CreateBusinessDto,
  ): Promise<BusinessDocument> {
    const business = await this.businessModel.create({ ...dto, ownerId });

    try {
      await this.userService.setBusinessId(ownerId, String(business._id));
    } catch (err) {
      // Roll back the orphaned business if the owner couldn't be linked.
      await this.businessModel.deleteOne({ _id: business._id }).exec();
      throw err;
    }

    return business;
  }

  /** Get a business by _id. Throws NotFound if missing. */
  async getById(businessId: string): Promise<BusinessDocument> {
    const business = await this.businessModel.findById(businessId).exec();
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    return business;
  }

  /** Get the business owned by a given user (or null if none). */
  async getByOwner(ownerId: string): Promise<BusinessDocument | null> {
    return this.businessModel.findOne({ ownerId }).exec();
  }

  /**
   * Update a business. Verifies the caller owns it, then applies the provided
   * fields. Throws NotFound if missing, Forbidden if the caller isn't the owner.
   */
  async update(
    businessId: string,
    ownerId: string,
    dto: UpdateBusinessDto,
  ): Promise<BusinessDocument> {
    const business = await this.getById(businessId);
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.');
    }

    const oldLogoKey = business.logoKey;
    Object.assign(business, dto);
    const saved = await business.save();

    // If the logo changed, clean up the previous object (best-effort).
    if (dto.logoKey !== undefined && oldLogoKey && oldLogoKey !== dto.logoKey) {
      try {
        await this.fileStorageService.deleteFile(oldLogoKey);
      } catch (error) {
        this.logger.error(`Failed to delete old logo ${oldLogoKey}`, error);
      }
    }

    return saved;
  }
}
