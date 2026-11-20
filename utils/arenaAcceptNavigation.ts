/** Pure navigation gate for challenge acceptance → linked Room. */
export function linkedRoomAfterAccept(result: {
  status: string;
  roomId?: string | null;
}): string | null {
  if (result.status !== 'ACCEPTED') return null;
  const roomId = result.roomId;
  return typeof roomId === 'string' && roomId.length > 0 ? roomId : null;
}
