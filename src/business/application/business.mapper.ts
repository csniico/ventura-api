import { IBusiness } from '../domain/business.entity';
import { BusinessResponse } from '../responses/business.response';

/**
 * Project a domain `IBusiness` onto the public `BusinessResponse` contract,
 * normalising nullable columns.
 */
export function toBusinessResponse(business: IBusiness): BusinessResponse {
  return {
    id: business.id,
    shortId: business.shortId,
    name: business.name,
    ownerId: business.ownerId,
    categories: business.categories ?? [],
    description: business.description ?? null,
    tagLine: business.tagLine ?? null,
    logo: business.logo ?? null,
    logoKey: business.logoKey ?? null,
    email: business.email ?? null,
    phone: business.phone ?? null,
    website: business.website ?? null,
    address: business.address ?? null,
    city: business.city ?? null,
    state: business.state ?? null,
    country: business.country ?? null,
    taxId: business.taxId ?? null,
    registrationNumber: business.registrationNumber ?? null,
    businessHours: business.businessHours ?? null,
    socials: business.socials ?? {},
    isActive: business.isActive,
    createdAt: business.createdAt,
    updatedAt: business.updatedAt,
  };
}
