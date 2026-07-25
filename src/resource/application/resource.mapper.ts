import { IResource } from '../domain/resource.entity';
import { ResourceResponse } from '../responses/resource.response';

/**
 * Project a domain `IResource` onto the public `ResourceResponse` contract.
 * Maps the Postgres `id` to `_id` so the payload stays shape-compatible with the
 * legacy Mongo response, and normalises nullable columns.
 */
export function toResourceResponse(resource: IResource): ResourceResponse {
  return {
    _id: resource.id,
    shortId: resource.shortId,
    businessId: resource.businessId,
    type: resource.type,
    name: resource.name,
    price: resource.price,
    primaryImage: resource.primaryImage ?? null,
    primaryImageKey: resource.primaryImageKey ?? null,
    supportingImages: resource.supportingImages ?? [],
    supportingImageKeys: resource.supportingImageKeys ?? [],
    description: resource.description ?? null,
    notes: resource.notes ?? null,
    availableQuantity: resource.availableQuantity,
    lowStockThreshold: resource.lowStockThreshold,
    businessHours: resource.businessHours ?? null,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}
