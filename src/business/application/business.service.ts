import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { FileStorageService } from '../../file-storage/file-storage.service'
import { UserServiceV2 } from '../../user/application/user.service'
import { SUGGESTED_CATEGORIES } from '../business.constants'
import { IBusiness } from '../domain/business.entity'
import type { BusinessRepository } from '../domain/business.repository'
import { BUSINESS_DATA_SOURCE } from '../domain/business.repository'
import { CreateBusinessDto } from '../dto/create-business.dto'
import { UpdateBusinessDto } from '../dto/update-business.dto'

/**
 * Postgres-backed business service. Data access goes through the
 * `BusinessRepository` abstraction (DIP); business rules (ownership, owner
 * linking with rollback, logo cleanup) live here. Methods return the domain
 * `IBusiness`; mapping to `BusinessResponse` happens at the controller boundary.
 */
@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name)

  constructor(
    @Inject(BUSINESS_DATA_SOURCE)
    private readonly businessRepository: BusinessRepository,
    private readonly userService: UserServiceV2,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** Suggested categories for the UI (businesses may also use custom ones). */
  getCategories(): readonly string[] {
    return SUGGESTED_CATEGORIES
  }

  /**
   * Create a business owned by `ownerId` and link it to the owner's user. If the
   * owner already has a business, the link fails (409) and the just-created
   * business is rolled back so no orphan is left behind.
   */
  async create(ownerId: string, dto: CreateBusinessDto): Promise<IBusiness> {
    const business = await this.businessRepository.create({
      name: dto.name,
      ownerId,
      categories: dto.categories ?? [],
      socials: {},
    })

    try {
      await this.userService.setBusinessId(ownerId, business.id)
    } catch (err) {
      // Roll back the orphaned business if the owner couldn't be linked.
      await this.businessRepository.delete(business.id)
      throw err
    }

    return business
  }

  /** Get a business by id. Throws NotFound if missing. */
  async getById(businessId: string): Promise<IBusiness> {
    const business = await this.businessRepository.findById(businessId)
    if (!business) {
      throw new NotFoundException('Business not found.')
    }
    return business
  }

  /** Get the business owned by a given user (or null if none). */
  async getByOwner(ownerId: string): Promise<IBusiness | null> {
    return await this.businessRepository.findByOwner(ownerId)
  }

  /**
   * Update a business. Verifies the caller owns it, then applies the provided
   * fields. Throws NotFound if missing, Forbidden if the caller isn't the owner.
   */
  async update(
    businessId: string,
    ownerId: string,
    dto: UpdateBusinessDto,
  ): Promise<IBusiness> {
    const business = await this.getById(businessId)
    if (business.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this business.')
    }

    const oldLogoKey = business.logoKey
    const updated = await this.businessRepository.update(businessId, dto)
    const saved = updated ?? business

    // If the logo changed, clean up the previous object (best-effort).
    if (dto.logoKey !== undefined && oldLogoKey && oldLogoKey !== dto.logoKey) {
      try {
        await this.fileStorageService.deleteFile(oldLogoKey)
      } catch (error) {
        this.logger.error(`Failed to delete old logo ${oldLogoKey}`, error)
      }
    }

    return saved
  }
}
