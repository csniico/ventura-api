import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { IAdmin } from '../domain/admin.entity'
import type { AdminRepository } from '../domain/admin.repository'
import { ADMIN_DATA_SOURCE } from '../domain/admin.repository'
import { CreateAdminDto, UpdateAdminProfileDto } from '../dto/admin-profile.dto'

/**
 * Manages a platform admin's own account/profile. Postgres-backed via the
 * `AdminRepository` abstraction (DIP); returns the domain `IAdmin`, mapped to
 * `AdminResponse` at the controller boundary.
 */
@Injectable()
export class AdminProfileService {
  private readonly logger = new Logger(AdminProfileService.name)

  constructor(
    @Inject(ADMIN_DATA_SOURCE)
    private readonly adminRepository: AdminRepository,
  ) {}

  /**
   * Create an admin. If one with this email already exists, return it instead
   * of creating a duplicate (email is unique).
   */
  async create(dto: CreateAdminDto): Promise<IAdmin> {
    const existing = await this.adminRepository.findByEmail(dto.email)
    if (existing) {
      this.logger.debug(`Admin with email ${dto.email} already exists.`)
      return existing
    }
    return this.adminRepository.create({ name: dto.name, email: dto.email })
  }

  /** Get an admin by id. Throws NotFound if it doesn't exist. */
  async getById(adminId: string): Promise<IAdmin> {
    const admin = await this.adminRepository.findById(adminId)
    if (!admin) {
      throw new NotFoundException('Admin not found.')
    }
    return admin
  }

  /** Update an admin's profile. Only the provided fields are changed. */
  async updateProfile(
    adminId: string,
    dto: UpdateAdminProfileDto,
  ): Promise<IAdmin> {
    await this.getById(adminId)
    const updated = await this.adminRepository.update(adminId, {
      name: dto.name,
    })
    if (!updated) {
      throw new NotFoundException('Admin not found.')
    }
    return updated
  }
}
