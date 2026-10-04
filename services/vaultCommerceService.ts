/**
 * Vault Services / Store / Courses API.
 * Entitlement and ownership stay server-side.
 */

import { getPublicMediaUrl } from './mediaService';
import { requestError, requireSupabase, SupabaseError } from './supabaseClient';
import {
  toCourseLessonCard,
  toCreatorCourse,
  toCreatorProduct,
  toCreatorService,
  toServiceRequest,
  type CourseLessonCard,
  type CreatorCourse,
  type CreatorProduct,
  type CreatorService,
  type VaultCoverMedia,
  type VaultInventoryMode,
  type VaultLessonContent,
  type VaultOfferAccess,
  type VaultOfferStatus,
  type VaultProductType,
  type VaultServiceCategory,
  type VaultServiceDelivery,
  type VaultServiceRequest,
  type VaultServiceRequestStatus,
} from './vaultCommerceMappers';

async function resolveCovers(
  mediaIds: readonly (string | null | undefined)[],
): Promise<Map<string, VaultCoverMedia>> {
  const ids = [...new Set(mediaIds.filter((id): id is string => Boolean(id)))];
  const map = new Map<string, VaultCoverMedia>();
  if (ids.length === 0) return map;
  const { data, error } = await requireSupabase()
    .from('media_objects')
    .select('id, bucket, storage_path, media_kind, visibility, status, deleted_at')
    .in('id', ids);
  if (error) throw requestError(error);
  for (const row of data) {
    if (
      row.visibility === 'public' &&
      row.bucket === 'public-media' &&
      row.status === 'ready' &&
      !row.deleted_at
    ) {
      map.set(row.id, {
        bucket: row.bucket,
        path: row.storage_path,
        kind: row.media_kind,
      });
    }
  }
  return map;
}

export function vaultCoverUrl(cover: VaultCoverMedia | null | undefined): string | null {
  if (!cover) return null;
  try {
    return getPublicMediaUrl(cover.bucket, cover.path);
  } catch {
    return null;
  }
}

// ── Services ────────────────────────────────────────────────────────────────

export async function fetchCreatorServices(
  creatorId: string,
  opts?: { includeDrafts?: boolean },
): Promise<CreatorService[]> {
  let query = requireSupabase()
    .from('creator_services')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false })
    .limit(40);
  if (!opts?.includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw requestError(error);
  const covers = await resolveCovers(data.map((r) => r.cover_media_object_id));
  return data.map((row) =>
    toCreatorService(row, row.cover_media_object_id ? covers.get(row.cover_media_object_id) ?? null : null),
  );
}

export async function fetchCreatorService(serviceId: string): Promise<CreatorService | null> {
  const { data, error } = await requireSupabase()
    .from('creator_services')
    .select('*')
    .eq('id', serviceId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  const covers = await resolveCovers([data.cover_media_object_id]);
  return toCreatorService(
    data,
    data.cover_media_object_id ? covers.get(data.cover_media_object_id) ?? null : null,
  );
}

export async function createCreatorService(input: {
  title: string;
  description?: string;
  category?: VaultServiceCategory;
  deliveryType?: VaultServiceDelivery;
  accessType?: VaultOfferAccess;
  priceAmountMinor?: number | null;
  currency?: string | null;
  coverMediaObjectId?: string | null;
  externalUrl?: string | null;
}): Promise<CreatorService> {
  const { data, error } = await requireSupabase().rpc('create_creator_service', {
    p_title: input.title,
    p_description: input.description ?? '',
    p_category: input.category ?? 'other',
    p_delivery_type: input.deliveryType ?? 'online',
    p_access_type: input.accessType ?? 'contact',
    p_price_amount_minor: input.priceAmountMinor ?? undefined,
    p_currency: input.currency ?? undefined,
    p_cover_media_object_id: input.coverMediaObjectId ?? undefined,
    p_external_url: input.externalUrl ?? undefined,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_creator_service returned no row', 'bad_payload');
  return toCreatorService(data);
}

export async function setCreatorServiceStatus(
  serviceId: string,
  status: VaultOfferStatus,
): Promise<CreatorService> {
  const { data, error } = await requireSupabase().rpc('set_creator_service_status', {
    p_service_id: serviceId,
    p_status: status,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('set_creator_service_status returned no row', 'bad_payload');
  return toCreatorService(data);
}

export async function requestCreatorService(
  serviceId: string,
  message: string,
): Promise<VaultServiceRequest> {
  const { data, error } = await requireSupabase().rpc('request_creator_service', {
    p_service_id: serviceId,
    p_message: message,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('request_creator_service returned no row', 'bad_payload');
  return toServiceRequest(data);
}

export async function setServiceRequestStatus(
  requestId: string,
  status: VaultServiceRequestStatus,
): Promise<VaultServiceRequest> {
  const { data, error } = await requireSupabase().rpc('set_service_request_status', {
    p_request_id: requestId,
    p_status: status,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('set_service_request_status returned no row', 'bad_payload');
  return toServiceRequest(data);
}

export async function fetchMyServiceRequests(): Promise<VaultServiceRequest[]> {
  const { data, error } = await requireSupabase()
    .from('vault_service_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw requestError(error);
  return data.map(toServiceRequest);
}

// ── Products ────────────────────────────────────────────────────────────────

export async function fetchCreatorProducts(
  creatorId: string,
  opts?: { includeDrafts?: boolean },
): Promise<CreatorProduct[]> {
  let query = requireSupabase()
    .from('creator_products')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false })
    .limit(40);
  if (!opts?.includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw requestError(error);
  const covers = await resolveCovers(data.map((r) => r.cover_media_object_id));
  return data.map((row) =>
    toCreatorProduct(row, row.cover_media_object_id ? covers.get(row.cover_media_object_id) ?? null : null),
  );
}

export async function fetchCreatorProduct(productId: string): Promise<CreatorProduct | null> {
  const { data, error } = await requireSupabase()
    .from('creator_products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  const covers = await resolveCovers([data.cover_media_object_id]);
  return toCreatorProduct(
    data,
    data.cover_media_object_id ? covers.get(data.cover_media_object_id) ?? null : null,
  );
}

export async function createCreatorProduct(input: {
  title: string;
  description?: string;
  productType?: VaultProductType;
  accessType?: VaultOfferAccess;
  priceAmountMinor?: number | null;
  currency?: string | null;
  coverMediaObjectId?: string | null;
  externalUrl?: string | null;
  inventoryMode?: VaultInventoryMode;
  inventoryCount?: number | null;
}): Promise<CreatorProduct> {
  const { data, error } = await requireSupabase().rpc('create_creator_product', {
    p_title: input.title,
    p_description: input.description ?? '',
    p_product_type: input.productType ?? 'digital',
    p_access_type: input.accessType ?? 'paid',
    p_price_amount_minor: input.priceAmountMinor ?? undefined,
    p_currency: input.currency ?? undefined,
    p_cover_media_object_id: input.coverMediaObjectId ?? undefined,
    p_external_url: input.externalUrl ?? undefined,
    p_inventory_mode: input.inventoryMode ?? 'unlimited',
    p_inventory_count: input.inventoryCount ?? undefined,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_creator_product returned no row', 'bad_payload');
  return toCreatorProduct(data);
}

export async function setCreatorProductStatus(
  productId: string,
  status: VaultOfferStatus,
): Promise<CreatorProduct> {
  const { data, error } = await requireSupabase().rpc('set_creator_product_status', {
    p_product_id: productId,
    p_status: status,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('set_creator_product_status returned no row', 'bad_payload');
  return toCreatorProduct(data);
}

// ── Courses ─────────────────────────────────────────────────────────────────

export async function fetchCreatorCourses(
  creatorId: string,
  opts?: { includeDrafts?: boolean },
): Promise<CreatorCourse[]> {
  let query = requireSupabase()
    .from('creator_courses')
    .select('*')
    .eq('creator_id', creatorId)
    .order('updated_at', { ascending: false })
    .limit(40);
  if (!opts?.includeDrafts) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw requestError(error);
  if (data.length === 0) return [];
  const covers = await resolveCovers(data.map((r) => r.cover_media_object_id));
  const courseIds = data.map((r) => r.id);
  const { data: lessons, error: lessonError } = await requireSupabase()
    .from('course_lessons')
    .select('course_id, status')
    .in('course_id', courseIds);
  if (lessonError) throw requestError(lessonError);
  const counts = new Map<string, number>();
  for (const lesson of lessons) {
    if (!opts?.includeDrafts && lesson.status !== 'published') continue;
    counts.set(lesson.course_id, (counts.get(lesson.course_id) ?? 0) + 1);
  }
  return data.map((row) =>
    toCreatorCourse(
      row,
      counts.get(row.id) ?? 0,
      row.cover_media_object_id ? covers.get(row.cover_media_object_id) ?? null : null,
    ),
  );
}

export async function fetchCreatorCourse(courseId: string): Promise<CreatorCourse | null> {
  const { data, error } = await requireSupabase()
    .from('creator_courses')
    .select('*')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw requestError(error);
  if (!data) return null;
  const covers = await resolveCovers([data.cover_media_object_id]);
  const { count, error: countError } = await requireSupabase()
    .from('course_lessons')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('status', 'published');
  if (countError) throw requestError(countError);
  return toCreatorCourse(
    data,
    count ?? 0,
    data.cover_media_object_id ? covers.get(data.cover_media_object_id) ?? null : null,
  );
}

export async function createCreatorCourse(input: {
  title: string;
  description?: string;
  accessType?: VaultOfferAccess;
  priceAmountMinor?: number | null;
  currency?: string | null;
  coverMediaObjectId?: string | null;
}): Promise<CreatorCourse> {
  const { data, error } = await requireSupabase().rpc('create_creator_course', {
    p_title: input.title,
    p_description: input.description ?? '',
    p_access_type: input.accessType ?? 'free',
    p_price_amount_minor: input.priceAmountMinor ?? undefined,
    p_currency: input.currency ?? undefined,
    p_cover_media_object_id: input.coverMediaObjectId ?? undefined,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_creator_course returned no row', 'bad_payload');
  return toCreatorCourse(data, 0);
}

export async function setCreatorCourseStatus(
  courseId: string,
  status: VaultOfferStatus,
): Promise<CreatorCourse> {
  const { data, error } = await requireSupabase().rpc('set_creator_course_status', {
    p_course_id: courseId,
    p_status: status,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('set_creator_course_status returned no row', 'bad_payload');
  return toCreatorCourse(data);
}

export async function createCourseLesson(input: {
  courseId: string;
  title: string;
  description?: string;
  contentType?: VaultLessonContent;
  bodyText?: string;
  mediaObjectId?: string | null;
  accessType?: VaultOfferAccess;
  previewAllowed?: boolean;
}): Promise<CourseLessonCard> {
  const { data, error } = await requireSupabase().rpc('create_course_lesson', {
    p_course_id: input.courseId,
    p_title: input.title,
    p_description: input.description ?? '',
    p_content_type: input.contentType ?? 'text',
    p_body_text: input.bodyText ?? '',
    p_media_object_id: input.mediaObjectId ?? undefined,
    p_access_type: input.accessType ?? 'free',
    p_preview_allowed: input.previewAllowed ?? false,
  });
  if (error) throw requestError(error);
  if (!data) throw new SupabaseError('create_course_lesson returned no row', 'bad_payload');
  const card = await fetchCourseLessonCard(data.id);
  if (!card) throw new SupabaseError('lesson card missing', 'bad_payload');
  return card;
}

export async function setCourseLessonStatus(
  lessonId: string,
  status: VaultOfferStatus,
): Promise<void> {
  const { error } = await requireSupabase().rpc('set_course_lesson_status', {
    p_lesson_id: lessonId,
    p_status: status,
  });
  if (error) throw requestError(error);
}

export async function fetchCourseLessonCards(courseId: string): Promise<CourseLessonCard[]> {
  const { data, error } = await requireSupabase()
    .from('course_lessons')
    .select('id')
    .eq('course_id', courseId)
    .order('position', { ascending: true })
    .limit(60);
  if (error) throw requestError(error);
  const cards = await Promise.all(data.map((row) => fetchCourseLessonCard(row.id)));
  return cards.filter((card): card is CourseLessonCard => Boolean(card));
}

export async function fetchCourseLessonCard(lessonId: string): Promise<CourseLessonCard | null> {
  const { data, error } = await requireSupabase().rpc('course_lesson_card', {
    p_lesson_id: lessonId,
  });
  if (error) throw requestError(error);
  if (data === null) return null;
  return toCourseLessonCard(data);
}

export async function completeCourseLesson(lessonId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('complete_course_lesson', {
    p_lesson_id: lessonId,
  });
  if (error) throw requestError(error);
}

export async function fetchCourseProgress(courseId: string): Promise<string[]> {
  const { data, error } = await requireSupabase()
    .from('course_progress')
    .select('lesson_id')
    .eq('course_id', courseId)
    .limit(120);
  if (error) throw requestError(error);
  return data.map((row) => row.lesson_id);
}

/** Signed URL for entitled private lesson media. */
export async function requestLessonMediaAccess(
  lessonId: string,
): Promise<{ url: string; mediaKind: string; expiresIn: number }> {
  const { data, error } = await requireSupabase().functions.invoke<{
    url: string;
    mediaKind: string;
    expiresIn: number;
  }>('course-lesson-media-access', { body: { lessonId } });
  if (error) throw new SupabaseError('This lesson is not available to you.', 'media_access_denied');
  if (!data || typeof data.url !== 'string') {
    throw new SupabaseError('The media service returned an unexpected payload', 'bad_payload');
  }
  return data;
}
