import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../schemas/admin.schema';
import {
  CreateAdminDto,
  UpdateAdminProfileDto,
} from '../dto/admin-profile.dto';

/** Manages an admin's own account/profile. */
@Injectable()
export class AdminProfileService {
  private readonly logger = new Logger(AdminProfileService.name);

  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,
  ) {}

  /**
   * Create an admin. If one with this email already exists, return it
   * instead of creating a duplicate (email is unique).
   */
  async create(dto: CreateAdminDto): Promise<AdminDocument> {
    const existing = await this.adminModel.findOne({ email: dto.email }).exec();
    if (existing) {
      this.logger.debug(`Admin with email ${dto.email} already exists.`);
      return existing;
    }
    return this.adminModel.create({ name: dto.name, email: dto.email });
  }

  /** Get an admin by _id. Throws NotFound if it doesn't exist. */
  async getById(adminId: string): Promise<AdminDocument> {
    const admin = await this.adminModel.findById(adminId).exec();
    if (!admin) {
      throw new NotFoundException('Admin not found.');
    }
    return admin;
  }

  /** Update an admin's profile. Only the provided fields are changed. */
  async updateProfile(
    adminId: string,
    dto: UpdateAdminProfileDto,
  ): Promise<AdminDocument> {
    const admin = await this.getById(adminId);
    if (dto.name !== undefined) {
      admin.name = dto.name;
    }
    return admin.save();
  }
}
