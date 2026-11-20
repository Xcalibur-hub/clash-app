/** Domain types for Vault Services / Store / Courses. */

export type VaultOfferStatus = 'draft' | 'published' | 'archived';
export type VaultOfferAccess = 'free' | 'subscriber' | 'paid' | 'contact';

export type VaultServiceCategory =
  | 'consultation'
  | 'coaching'
  | 'custom_content'
  | 'commission'
  | 'private_session'
  | 'creative_service'
  | 'event'
  | 'other';

export type VaultServiceDelivery = 'online' | 'in_person' | 'custom' | 'external';
export type VaultServiceRequestStatus =
  | 'requested'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed';

export type VaultProductType = 'digital' | 'physical' | 'merch' | 'external';
export type VaultInventoryMode = 'unlimited' | 'limited' | 'external';
export type VaultLessonContent = 'video' | 'text' | 'image';

export interface VaultCoverMedia {
  bucket: string;
  path: string;
  kind: string;
}

export interface CreatorService {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: VaultServiceCategory;
  coverMedia: VaultCoverMedia | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  deliveryType: VaultServiceDelivery;
  externalUrl: string | null;
  status: VaultOfferStatus;
  createdAt: number;
  updatedAt: number;
}

export interface VaultServiceRequest {
  id: string;
  serviceId: string;
  creatorId: string;
  requesterId: string;
  message: string;
  status: VaultServiceRequestStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorProduct {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  productType: VaultProductType;
  coverMedia: VaultCoverMedia | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  externalUrl: string | null;
  inventoryMode: VaultInventoryMode;
  inventoryCount: number | null;
  status: VaultOfferStatus;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorCourse {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  coverMedia: VaultCoverMedia | null;
  accessType: VaultOfferAccess;
  priceAmountMinor: number | null;
  currency: string | null;
  status: VaultOfferStatus;
  lessonCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CourseLessonCard {
  id: string;
  courseId: string;
  creatorId: string;
  title: string;
  description: string;
  position: number;
  contentType: VaultLessonContent;
  accessType: VaultOfferAccess;
  previewAllowed: boolean;
  status: VaultOfferStatus;
  accessible: boolean;
  bodyText: string;
  publicMedia: VaultCoverMedia | null;
  hasPrivateMedia: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function epoch(value: unknown): number {
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function coverFromId(
  mediaId: string | null,
  resolved: VaultCoverMedia | null | undefined,
): VaultCoverMedia | null {
  return resolved ?? null;
}

function parseCover(raw: unknown): VaultCoverMedia | null {
  const r = asRecord(raw);
  if (!r) return null;
  const bucket = str(r.bucket);
  const path = str(r.path);
  if (!bucket || !path) return null;
  return { bucket, path, kind: str(r.kind) ?? 'image' };
}

const SERVICE_CATS: VaultServiceCategory[] = [
  'consultation',
  'coaching',
  'custom_content',
  'commission',
  'private_session',
  'creative_service',
  'event',
  'other',
];

function asServiceCategory(value: unknown): VaultServiceCategory {
  return SERVICE_CATS.includes(value as VaultServiceCategory)
    ? (value as VaultServiceCategory)
    : 'other';
}

function asAccess(value: unknown): VaultOfferAccess {
  return value === 'free' || value === 'subscriber' || value === 'paid' || value === 'contact'
    ? value
    : 'contact';
}

function asStatus(value: unknown): VaultOfferStatus {
  return value === 'published' || value === 'archived' || value === 'draft' ? value : 'draft';
}

function asDelivery(value: unknown): VaultServiceDelivery {
  return value === 'online' || value === 'in_person' || value === 'custom' || value === 'external'
    ? value
    : 'online';
}

export function toCreatorService(
  row: {
    id: string;
    creator_id: string;
    title: string;
    description: string;
    category: string;
    cover_media_object_id: string | null;
    access_type: string;
    price_amount_minor: number | null;
    currency: string | null;
    delivery_type: string;
    external_url: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  },
  cover: VaultCoverMedia | null = null,
): CreatorService {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    category: asServiceCategory(row.category),
    coverMedia: coverFromId(row.cover_media_object_id, cover),
    accessType: asAccess(row.access_type),
    priceAmountMinor: row.price_amount_minor,
    currency: row.currency,
    deliveryType: asDelivery(row.delivery_type),
    externalUrl: row.external_url,
    status: asStatus(row.status),
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

export function toCreatorProduct(
  row: {
    id: string;
    creator_id: string;
    title: string;
    description: string;
    product_type: string;
    cover_media_object_id: string | null;
    access_type: string;
    price_amount_minor: number | null;
    currency: string | null;
    external_url: string | null;
    inventory_mode: string;
    inventory_count: number | null;
    status: string;
    created_at: string;
    updated_at: string;
  },
  cover: VaultCoverMedia | null = null,
): CreatorProduct {
  const productType =
    row.product_type === 'physical' || row.product_type === 'merch' || row.product_type === 'external'
      ? row.product_type
      : 'digital';
  const inventoryMode =
    row.inventory_mode === 'limited' || row.inventory_mode === 'external'
      ? row.inventory_mode
      : 'unlimited';
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    productType,
    coverMedia: coverFromId(row.cover_media_object_id, cover),
    accessType: asAccess(row.access_type) === 'contact' ? 'paid' : asAccess(row.access_type),
    priceAmountMinor: row.price_amount_minor,
    currency: row.currency,
    externalUrl: row.external_url,
    inventoryMode,
    inventoryCount: row.inventory_count,
    status: asStatus(row.status),
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

export function toCreatorCourse(
  row: {
    id: string;
    creator_id: string;
    title: string;
    description: string;
    cover_media_object_id: string | null;
    access_type: string;
    price_amount_minor: number | null;
    currency: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  },
  lessonCount = 0,
  cover: VaultCoverMedia | null = null,
): CreatorCourse {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    coverMedia: coverFromId(row.cover_media_object_id, cover),
    accessType: asAccess(row.access_type) === 'contact' ? 'free' : asAccess(row.access_type),
    priceAmountMinor: row.price_amount_minor,
    currency: row.currency,
    status: asStatus(row.status),
    lessonCount,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}

export function toCourseLessonCard(value: unknown): CourseLessonCard | null {
  const r = asRecord(value);
  if (!r) return null;
  const id = str(r.id);
  const courseId = str(r.courseId);
  const creatorId = str(r.creatorId);
  const title = str(r.title);
  if (!id || !courseId || !creatorId || !title) return null;
  const contentType =
    r.contentType === 'video' || r.contentType === 'image' ? r.contentType : 'text';
  return {
    id,
    courseId,
    creatorId,
    title,
    description: str(r.description) ?? '',
    position: num(r.position) ?? 1,
    contentType,
    accessType: asAccess(r.accessType) === 'contact' ? 'free' : asAccess(r.accessType),
    previewAllowed: r.previewAllowed === true,
    status: asStatus(r.status),
    accessible: r.accessible === true,
    bodyText: str(r.bodyText) ?? '',
    publicMedia: parseCover(r.publicMedia),
    hasPrivateMedia: r.hasPrivateMedia === true,
  };
}

export function toServiceRequest(row: {
  id: string;
  service_id: string;
  creator_id: string;
  requester_id: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
}): VaultServiceRequest {
  const status =
    row.status === 'accepted' ||
    row.status === 'declined' ||
    row.status === 'cancelled' ||
    row.status === 'completed'
      ? row.status
      : 'requested';
  return {
    id: row.id,
    serviceId: row.service_id,
    creatorId: row.creator_id,
    requesterId: row.requester_id,
    message: row.message,
    status,
    createdAt: epoch(row.created_at),
    updatedAt: epoch(row.updated_at),
  };
}
