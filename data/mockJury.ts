/**
 * The mock juror pool (spec §9).
 *
 * The jury is drawn from the wider community, not from the two people arguing —
 * `juryService.selectJurors()` also excludes any ids passed in, so a debater (or
 * the viewer) can never sit on their own jury. 24 identities give a 9-person
 * jury real variety across Clashes.
 */
export interface JurorIdentity {
  id: string;
  handle: string;
  tint: string;
}

export const JUROR_POOL: readonly JurorIdentity[] = [
  { id: 'j-1', handle: 'nikhil', tint: '#FF6A3D' },
  { id: 'j-2', handle: 'sara.k', tint: '#3D8BFF' },
  { id: 'j-3', handle: 'devansh', tint: '#FFC861' },
  { id: 'j-4', handle: 'meher', tint: '#A580FF' },
  { id: 'j-5', handle: 'rohan99', tint: '#43D6A0' },
  { id: 'j-6', handle: 'aarohi', tint: '#FF4D5E' },
  { id: 'j-7', handle: 'imran', tint: '#FF9A4D' },
  { id: 'j-8', handle: 'kritika', tint: '#3D8BFF' },
  { id: 'j-9', handle: 'sameer', tint: '#FFC861' },
  { id: 'j-10', handle: 'trisha', tint: '#A580FF' },
  { id: 'j-11', handle: 'yash', tint: '#FF6A3D' },
  { id: 'j-12', handle: 'naina', tint: '#43D6A0' },
  { id: 'j-13', handle: 'farhan', tint: '#98A0B0' },
  { id: 'j-14', handle: 'pooja.r', tint: '#FF4D5E' },
  { id: 'j-15', handle: 'aditya', tint: '#FF9A4D' },
  { id: 'j-16', handle: 'leela', tint: '#A580FF' },
  { id: 'j-17', handle: 'junaid', tint: '#3D8BFF' },
  { id: 'j-18', handle: 'shruti', tint: '#FFC861' },
  { id: 'j-19', handle: 'varun', tint: '#43D6A0' },
  { id: 'j-20', handle: 'aisha', tint: '#FF6A3D' },
  { id: 'j-21', handle: 'kunal', tint: '#98A0B0' },
  { id: 'j-22', handle: 'reema', tint: '#A580FF' },
  { id: 'j-23', handle: 'hritik', tint: '#FF4D5E' },
  { id: 'j-24', handle: 'sanya', tint: '#3D8BFF' },
];
