/**
 * SEQ_PLAN — Default cadence execution plan.
 *
 * This is production configuration, not test data.
 * Moved from src/data/mockData.js (Phase 8A-Core) to make the
 * distinction between seed data and system config explicit.
 *
 * Shape: { key, label, day, channel }
 *   key     — unique step identifier, matches seqLog keys on leads
 *   label   — human-readable step name shown in CadenceTab
 *   day     — cadence day on which this step is due
 *   channel — 'Email' | 'SMS' | 'VM' | 'LinkedIn'
 *
 * Days are non-consecutive by design — gaps allow time for replies.
 * cadenceUtils.nextCadenceDay() handles non-consecutive day lookup safely.
 *
 * To change the default sequence: edit this file only.
 * All execution logic (cadenceUtils, AppContext, LeadPage) reads from here.
 */
export const SEQ_PLAN = [
  { key: 'E1',   label: 'Email 1',     day: 1,  channel: 'Email' },
  { key: 'E2',   label: 'Email 2',     day: 3,  channel: 'Email' },
  { key: 'E3',   label: 'Email 3',     day: 5,  channel: 'Email' },
  { key: 'E4',   label: 'Email 4',     day: 7,  channel: 'Email' },
  { key: 'E5',   label: 'Email 5',     day: 10, channel: 'Email' },
  { key: 'E6',   label: 'Email 6',     day: 14, channel: 'Email' },
  { key: 'E7',   label: 'Email 7',     day: 21, channel: 'Email' },
  { key: 'SMS1', label: 'SMS 1',       day: 2,  channel: 'SMS'   },
  { key: 'SMS2', label: 'SMS 2',       day: 6,  channel: 'SMS'   },
  { key: 'SMS3', label: 'SMS 3',       day: 9,  channel: 'SMS'   },
  { key: 'SMS4', label: 'SMS 4',       day: 13, channel: 'SMS'   },
  { key: 'SMS5', label: 'SMS 5',       day: 20, channel: 'SMS'   },
  { key: 'VM1',  label: 'Voicemail 1', day: 4,  channel: 'VM'    },
  { key: 'VM2',  label: 'Voicemail 2', day: 8,  channel: 'VM'    },
  { key: 'VM3',  label: 'Voicemail 3', day: 15, channel: 'VM'    },
];
