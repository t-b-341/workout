/** Program strength / wellbeing targets surfaced on every full JSON export (`summary.programTargets`). */
export type SummaryProgramTarget = {
  id: string;
  text: string;
};

export const EXPORT_SUMMARY_PROGRAM_TARGETS: readonly SummaryProgramTarget[] = [
  { id: 'bp_pause', text: 'BP(P) - 225# (current: 205)' },
  { id: 'bp_tng', text: 'BP(TNG) - 245# (current: 225)' },
  { id: 'cgbp', text: 'CGBP - 185x10' },
  { id: 'wgbp', text: 'WGBP - 185x10' },
  { id: 'ohp', text: 'OHP - 155# (current 140)' },
  { id: 'pp_barbell', text: 'PP - 185# (current 175)' },
  { id: 'pp_bodyweight', text: 'PP - bodyweight (eventually 200)' },
  { id: 'p1_bw_reps', text: 'P1 - BW x 10 (current 4)' },
  { id: 'p1_negative', text: 'P1#(e)- 45# negative (current 10 lbs)' },
  { id: 'p1_weighted', text: 'P1# - 25#x3' },
  { id: 'bbr', text: 'BBR - 225x4 (current 200x5)' },
  { id: 'dl', text: 'DL - 450# (current 435)' },
  { id: 'rdl', text: 'RDL - 275#x8' },
  { id: 'bs', text: 'BS - 350# (current 335)' },
  { id: 'bs_pause', text: 'BS(P) - 315#' },
  { id: 'fs', text: 'FS - 185#' },
  { id: 'bss', text: 'BSS - 65#x8 L/R ' },
  { id: 'bodyweight', text: 'BW - 200# (current ~245)' },
  { id: 'mindfulness', text: 'Mindfulness - 3 minutes per day' },
  { id: 'bc', text: 'BC - 65x4x10' },
  { id: 'ur', text: 'UR - 75x4x10' },
] as const satisfies readonly SummaryProgramTarget[];
